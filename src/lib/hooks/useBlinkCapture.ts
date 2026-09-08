"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** Mean of the two eye-blink blendshapes above which the eyes count as shut. */
const CLOSE_THRESHOLD = 0.5;
/**
 * How long the eyes must stay shut to count as deliberate. An involuntary blink
 * lasts roughly 100-150ms, so holding well past that is what separates "I meant
 * it" from ordinary blinking.
 */
const HOLD_MS = 600;
/** After the eyes reopen, wait this long so the photo catches them fully open. */
const SETTLE_MS = 250;
/** Ignore everything for this long after a capture. */
const COOLDOWN_MS = 4000;

const WASM_BASE =
  process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_BASE ??
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  process.env.NEXT_PUBLIC_FACE_LANDMARKER_MODEL_URL ??
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/**
 * MediaPipe's WASM runtime pipes its stdout/stderr through `console.error`, so
 * benign startup notices ("INFO: Created TensorFlow Lite XNNPACK delegate for
 * CPU.") land in the Next.js dev overlay as red Console Errors. Drop just those
 * notices while a landmarker is alive; anything else still goes through.
 */
const BENIGN_WASM_LOG = /^(INFO|WARNING):/;
let patchedConsoleError: typeof console.error | null = null;
let originalConsoleError: typeof console.error | null = null;
let logFilterDepth = 0;

function installLogFilter() {
  logFilterDepth += 1;
  if (patchedConsoleError) return;
  const original = console.error;
  originalConsoleError = original;
  patchedConsoleError = (...args: unknown[]) => {
    if (typeof args[0] === "string" && BENIGN_WASM_LOG.test(args[0])) return;
    original(...args);
  };
  console.error = patchedConsoleError;
}

function removeLogFilter() {
  logFilterDepth = Math.max(0, logFilterDepth - 1);
  if (logFilterDepth > 0 || !patchedConsoleError) return;
  // Only unwind if nothing else has wrapped console.error since; clobbering a
  // later patch would be worse than leaving ours in place.
  if (console.error === patchedConsoleError && originalConsoleError) {
    console.error = originalConsoleError;
  }
  patchedConsoleError = null;
  originalConsoleError = null;
}

export type BlinkState = {
  status: "off" | "loading" | "ready" | "error";
  error: string | null;
  faceDetected: boolean;
  /** 0-1, how shut the eyes currently read. */
  eyeClosedScore: number;
  /** 0-1 progress through the deliberate hold. Useful for a progress ring. */
  holdProgress: number;
  /** True during the post-capture cooldown. */
  cooling: boolean;
};

type Options = {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Only run while the camera is live and the feature is switched on. */
  enabled: boolean;
  onTrigger: () => void;
};

/**
 * Fires `onTrigger` when the user deliberately holds their eyes shut.
 *
 * Face landmarks are computed on-device with MediaPipe. No frame ever leaves
 * the browser for this — only the photo the user chooses to save is uploaded.
 */
export function useBlinkCapture({ videoRef, enabled, onTrigger }: Options): BlinkState {
  const [state, setState] = useState<BlinkState>({
    status: "off",
    error: null,
    faceDetected: false,
    eyeClosedScore: 0,
    holdProgress: 0,
    cooling: false,
  });

  // Kept in a ref so the detection loop never restarts when the callback
  // identity changes, which would drop the landmarker mid-session.
  const onTriggerRef = useRef(onTrigger);
  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, status: "off", holdProgress: 0 }));
      return;
    }

    installLogFilter();

    let cancelled = false;
    let frame = 0;
    let landmarker: import("@mediapipe/tasks-vision").FaceLandmarker | null = null;

    let closedSince: number | null = null;
    let armed = false;
    let reopenedAt: number | null = null;
    let cooldownUntil = 0;
    let lastVideoTime = -1;

    async function run() {
      setState((prev) => ({ ...prev, status: "loading", error: null }));

      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        }).catch(async () =>
          // Not every machine exposes a usable GPU delegate to WebAssembly.
          FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1,
          }),
        );

        if (cancelled) return;
        setState((prev) => ({ ...prev, status: "ready" }));
        frame = requestAnimationFrame(tick);
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error:
            error instanceof Error
              ? `Could not load the face model: ${error.message}`
              : "Could not load the face model.",
        }));
      }
    }

    function tick() {
      const video = videoRef.current;
      if (cancelled || !landmarker || !video) return;

      // detectForVideo requires strictly increasing timestamps, so only feed it
      // genuinely new frames.
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const now = performance.now();

        let result;
        try {
          result = landmarker.detectForVideo(video, now);
        } catch {
          frame = requestAnimationFrame(tick);
          return;
        }

        const shapes = result.faceBlendshapes?.[0]?.categories;
        const faceDetected = Boolean(shapes?.length);

        let score = 0;
        if (shapes) {
          const left = shapes.find((c) => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
          const right = shapes.find((c) => c.categoryName === "eyeBlinkRight")?.score ?? 0;
          score = (left + right) / 2;
        }

        const cooling = now < cooldownUntil;
        const closed = faceDetected && score > CLOSE_THRESHOLD;
        let holdProgress = 0;

        if (cooling) {
          closedSince = null;
          armed = false;
          reopenedAt = null;
        } else if (closed) {
          closedSince ??= now;
          holdProgress = Math.min(1, (now - closedSince) / HOLD_MS);
          // Long enough to be deliberate: capture once the eyes come back open.
          if (holdProgress >= 1) armed = true;
          reopenedAt = null;
        } else {
          closedSince = null;
          if (armed) {
            reopenedAt ??= now;
            if (now - reopenedAt >= SETTLE_MS) {
              armed = false;
              reopenedAt = null;
              cooldownUntil = now + COOLDOWN_MS;
              onTriggerRef.current();
            }
          }
        }

        setState((prev) =>
          prev.faceDetected === faceDetected &&
          Math.abs(prev.eyeClosedScore - score) < 0.02 &&
          Math.abs(prev.holdProgress - holdProgress) < 0.02 &&
          prev.cooling === cooling
            ? prev
            : { ...prev, faceDetected, eyeClosedScore: score, holdProgress, cooling },
        );
      }

      frame = requestAnimationFrame(tick);
    }

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      landmarker?.close();
      landmarker = null;
      removeLogFilter();
    };
  }, [enabled, videoRef]);

  return state;
}
