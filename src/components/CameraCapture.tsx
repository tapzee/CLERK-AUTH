"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { CaptureMethod } from "@/lib/capture";
import { useBlinkCapture } from "@/lib/hooks/useBlinkCapture";
import { isFixFresh, useGeolocation } from "@/lib/hooks/useGeolocation";

type Status =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "uploading" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

type Shot = {
  previewUrl: string;
  blob: Blob;
  width: number;
  height: number;
  method: CaptureMethod;
};

export function CameraCapture() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [shot, setShot] = useState<Shot | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [blinkEnabled, setBlinkEnabled] = useState(false);

  // Location is watched while the camera is open so a fix is ready at shutter time.
  const geo = useGeolocation(status.kind === "live" || shot !== null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setStatus({ kind: "starting" });
    stopStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({
        kind: "error",
        message: "This browser has no camera API. Note that camera access needs HTTPS or localhost.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus({ kind: "live" });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow it in your browser settings and try again."
            : "Could not start the camera. Is another app using it?",
      });
    }
  }, [facingMode, stopStream]);

  // Release the camera when the component unmounts or the tab navigates away.
  useEffect(() => stopStream, [stopStream]);

  // Revoke the object URL of a discarded preview so it doesn't leak.
  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot.previewUrl);
    };
  }, [shot]);

  const takePhoto = useCallback(async (method: CaptureMethod = "manual") => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) {
      setStatus({ kind: "error", message: "Could not read a frame from the camera." });
      return;
    }

    stopStream();
    setShot({
      previewUrl: URL.createObjectURL(blob),
      blob,
      width: canvas.width,
      height: canvas.height,
      method,
    });
    setStatus({ kind: "idle" });
  }, [stopStream]);

  const blinkTrigger = useCallback(() => {
    void takePhoto("blink");
  }, [takePhoto]);

  const blink = useBlinkCapture({
    videoRef,
    enabled: blinkEnabled && status.kind === "live" && shot === null,
    onTrigger: blinkTrigger,
  });

  const discard = useCallback(() => {
    setShot(null);
    void startCamera();
  }, [startCamera]);

  const upload = useCallback(async () => {
    if (!shot) return;
    setStatus({ kind: "uploading" });

    const form = new FormData();
    // The Clerk session cookie rides along with the request; the server derives
    // the storage path from it, so nothing user-identifying is sent from here.
    form.append("photo", shot.blob, "capture.jpg");
    form.append("width", String(shot.width));
    form.append("height", String(shot.height));
    form.append("capturedAt", new Date().toISOString());
    form.append("captureMethod", shot.method);

    // A stale fix is worse than none: it would tag the photo with wherever the
    // device was some time ago.
    if (geo.fix && isFixFresh(geo.fix)) {
      form.append("latitude", String(geo.fix.latitude));
      form.append("longitude", String(geo.fix.longitude));
      form.append("accuracyM", String(geo.fix.accuracyM));
      if (geo.fix.altitudeM !== null) {
        form.append("altitudeM", String(geo.fix.altitudeM));
      }
    } else {
      // Record why there are no coordinates rather than dropping it silently.
      form.append("locationError", geo.error ?? "no fresh location fix");
    }

    try {
      const response = await fetch("/api/photos", { method: "POST", body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setStatus({ kind: "error", message: body.error ?? "Upload failed." });
        return;
      }
      URL.revokeObjectURL(shot.previewUrl);
      setShot(null);
      setStatus({ kind: "saved" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error while uploading." });
    }
  }, [geo, router, shot]);

  const isLive = status.kind === "live";
  const isUploading = status.kind === "uploading";

  const locationLabel = geo.fix
    ? `Location ready · ±${Math.round(geo.fix.accuracyM)}m`
    : geo.status === "locating"
      ? "Getting location…"
      : geo.status === "denied"
        ? "Location permission denied"
        : geo.status === "idle"
          ? "Location starts with the camera"
          : "Location unavailable on this device";

  const blinkLabel =
    blink.status === "loading"
      ? "Loading face model…"
      : blink.status === "error"
        ? (blink.error ?? "Blink detection unavailable")
        : blink.cooling
          ? "Captured — pausing for a moment"
          : !blink.faceDetected
            ? "Looking for your face…"
            : blink.holdProgress > 0
              ? "Hold it…"
              : "Ready — hold your eyes shut";

  return (
    <div className="space-y-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black/90">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: preview, not a remote asset
          <img
            src={shot.previewUrl}
            alt="Photo you just captured"
            className="h-full w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            // Selfie view reads as a mirror; the saved file is not flipped.
            style={{ transform: facingMode === "user" ? "scaleX(-1)" : undefined }}
          />
        )}

        {!shot && isLive && blinkEnabled && (
          <div className="absolute inset-x-4 bottom-4 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-full bg-black/60 px-4 py-1.5 text-xs text-white backdrop-blur">
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    blink.faceDetected ? "bg-green-400" : "bg-white/40"
                  }`}
                />
                {blinkLabel}
              </span>
              {geo.fix && <span className="opacity-70">±{Math.round(geo.fix.accuracyM)}m</span>}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-100"
                style={{ width: `${Math.round(blink.holdProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {!shot && !isLive && (
          <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
            {status.kind === "starting" ? "Starting camera…" : "Camera is off"}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {shot ? (
          <>
            <button
              onClick={upload}
              disabled={isUploading}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-50"
            >
              {isUploading ? "Saving…" : "Save to Supabase"}
            </button>
            <button
              onClick={discard}
              disabled={isUploading}
              className="rounded-full border border-black/15 px-5 py-2.5 text-sm disabled:opacity-50 dark:border-white/20"
            >
              Retake
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => (isLive ? takePhoto("manual") : startCamera())}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
            >
              {isLive ? "Take photo" : "Start camera"}
            </button>
            <button
              onClick={() => {
                setFacingMode((mode) => (mode === "user" ? "environment" : "user"));
                if (isLive) void startCamera();
              }}
              className="rounded-full border border-black/15 px-5 py-2.5 text-sm dark:border-white/20"
            >
              Switch camera
            </button>
            {isLive && (
              <button
                onClick={() => {
                  stopStream();
                  setStatus({ kind: "idle" });
                }}
                className="text-sm opacity-70 hover:underline"
              >
                Stop
              </button>
            )}
          </>
        )}
      </div>

      {/*
        Hands-free capture and location. The behaviour lives in src/lib/hooks/
        (useBlinkCapture, useGeolocation); this block is presentation only.
      */}
      <div className="space-y-3 rounded-2xl border border-black/10 p-4 dark:border-white/15">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={blinkEnabled}
            onChange={(event) => setBlinkEnabled(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="block text-sm font-medium">Blink to capture</span>
            <span className="block text-xs opacity-60">
              Hold your eyes shut for about a second. The shot is taken just after you
              open them, so your eyes are open in the photo.
            </span>
          </span>
        </label>

        {blinkEnabled && !isLive && (
          <p className="text-xs opacity-60">Start the camera to arm it.</p>
        )}

        <p className="flex items-center gap-2 text-xs opacity-60">
          <span>{locationLabel}</span>
          {geo.status === "denied" && (
            <button onClick={geo.retry} className="underline">
              retry
            </button>
          )}
        </p>
      </div>

      {status.kind === "error" && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {status.message}
        </p>
      )}
      {status.kind === "saved" && (
        <p className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Saved. It is in your gallery now.
        </p>
      )}
    </div>
  );
}
