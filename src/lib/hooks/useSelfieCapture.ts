"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CaptureMethod } from "@/lib/attendance/types";
import { captureFrame, shrinkImageFile } from "@/lib/image";

/**
 * The camera half of the punch screen: getting one photo, however it arrives.
 *
 * A punch can be evidenced by a live capture or by a picked file, and both
 * paths have to end in the same thing — a shrunk blob with its real pixel
 * dimensions. Keeping the stream, the hidden file input and the preview URL
 * together here is what stops the screen leaking a camera light or a blob: the
 * stream is stopped on every exit, and each preview URL is revoked by the same
 * effect that hands over to its successor.
 */

export type Shot = {
  /** An object URL, owned by this hook and revoked when it is replaced. */
  previewUrl: string;
  blob: Blob;
  width: number;
  height: number;
  method: CaptureMethod;
  source: "camera" | "upload";
  capturedAt: string;
};

/**
 * What the capture flow is doing, in the punch screen's own vocabulary.
 *
 * Deliberately a subset of that screen's phases rather than a parallel enum, so
 * the screen can hand this straight to `setPhase` without a translation table
 * that would drift.
 */
export type CaptureStatus =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "review" }
  | { kind: "error"; message: string };

/** A picked file larger than this is refused before it is ever decoded. */
const MAX_PICKED_BYTES = 15 * 1024 * 1024;

/** Stand-in dimensions for a file that displays but will not decode for us. */
const FALLBACK_DIMENSIONS = { width: 1280, height: 720 };

/**
 * @param report Called on every change of state. Must be stable across renders
 *   -- a `useState` setter, or a `useCallback` -- because the camera callbacks
 *   below are rebuilt whenever it changes.
 */
export function useSelfieCapture(report: (status: CaptureStatus) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [shot, setShot] = useState<Shot | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Release the camera when the screen goes away, not only when it is used.
  useEffect(() => stopStream, [stopStream]);

  // Revokes a preview once it has been replaced, and the last one on unmount.
  // Without this every retake leaks a blob for the lifetime of the tab.
  useEffect(() => {
    if (!shot) return;
    return () => URL.revokeObjectURL(shot.previewUrl);
  }, [shot]);

  const startCamera = useCallback(async () => {
    report({ kind: "starting" });
    stopStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      report({
        kind: "error",
        message:
          "This browser has no camera API. Camera access needs HTTPS or localhost. You can still use the Upload Photo option.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      report({ kind: "live" });
    } catch (error) {
      report({
        kind: "error",
        message:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow it in your browser settings or use the Upload Photo option below."
            : "Could not start the camera. Try again or upload an image directly.",
      });
    }
  }, [report, stopStream]);

  /** Freezes the current video frame. The camera is released on the way out. */
  const takePhoto = useCallback(
    async (method: CaptureMethod = "manual") => {
      const video = videoRef.current;
      if (!video) return;

      const frame = await captureFrame(video);
      if (!frame) {
        report({ kind: "error", message: "Could not read a frame from the camera." });
        return;
      }

      stopStream();
      setShot({
        previewUrl: URL.createObjectURL(frame.blob),
        blob: frame.blob,
        width: frame.width,
        height: frame.height,
        method,
        source: "camera",
        capturedAt: new Date().toISOString(),
      });
      report({ kind: "review" });
    },
    [report, stopStream],
  );

  /** Takes a file from the picker or from a drop, and treats it as the shot. */
  const acceptFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        report({
          kind: "error",
          message: "Please select a valid image file (JPG, PNG, or WebP).",
        });
        return;
      }

      if (file.size > MAX_PICKED_BYTES) {
        report({ kind: "error", message: "The selected image is too large (max 15 MB)." });
        return;
      }

      stopStream();
      report({ kind: "starting" });

      try {
        const { file: processed, width, height } = await prepareFile(file);

        setShot({
          previewUrl: URL.createObjectURL(processed),
          blob: processed,
          width,
          height,
          method: "manual",
          source: "upload",
          capturedAt: new Date().toISOString(),
        });
        report({ kind: "review" });
      } catch {
        report({
          kind: "error",
          message: "Could not process this image. Please try another photo.",
        });
      } finally {
        // Cleared so picking the same file twice in a row still fires `change`.
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [report, stopStream],
  );

  const onFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void acceptFile(file);
    },
    [acceptFile],
  );

  const openFilePicker = useCallback(() => {
    stopStream();
    fileInputRef.current?.click();
  }, [stopStream]);

  /** Drops the shot, reopening the camera only if that is where it came from. */
  const retake = useCallback(() => {
    const wasCamera = shot?.source === "camera";
    setShot(null);
    if (wasCamera) {
      void startCamera();
    } else {
      report({ kind: "idle" });
    }
  }, [report, shot, startCamera]);

  /** Drops the shot without reopening anything — for a punch that went through. */
  const clearShot = useCallback(() => setShot(null), []);

  return {
    videoRef,
    fileInputRef,
    shot,
    startCamera,
    takePhoto,
    acceptFile,
    openFilePicker,
    onFileInputChange,
    retake,
    clearShot,
  };
}

/**
 * Shrinks a picked file and reads the dimensions of whatever came back.
 *
 * A file the browser can display but cannot re-encode still makes a usable
 * punch photo, so a failed shrink falls back to the original bytes rather than
 * refusing the upload, and unreadable dimensions fall back to a plausible pair
 * — the server measures the image itself, these only size the preview.
 */
async function prepareFile(
  file: File,
): Promise<{ file: File; width: number; height: number }> {
  let processed = file;
  try {
    processed = await shrinkImageFile(file);
  } catch {
    // Keep the original; it still uploads as long as it is under the cap.
  }

  const candidates = processed === file ? [file] : [processed, file];
  for (const candidate of candidates) {
    try {
      const bitmap = await createImageBitmap(candidate);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return { file: processed, ...size };
    } catch {
      // Try the original next; if that fails too, fall through to the default.
    }
  }

  return { file: processed, ...FALLBACK_DIMENSIONS };
}
