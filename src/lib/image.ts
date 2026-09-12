/**
 * Capture sizing.
 *
 * Runs in the browser, so nothing here may import `server-only`.
 */

/**
 * Longest edge of an uploaded capture.
 *
 * One photo serves both the manager's review and the uniform check. Gemini 3.x
 * prices an image by the media resolution asked for, not by how many pixels
 * were sent, so shrinking this saves upload bandwidth and not one token — while
 * costing detail the check cannot get back. 1024px keeps a chest logo legible
 * and still lands around 150 KB, which uploads comfortably on a cart's mobile
 * connection and sits far under the 4 MB request ceiling.
 */
export const CAPTURE_MAX_EDGE = 1024;

export type Dimensions = { width: number; height: number };

/** Scales `source` down to fit inside a square of `maxEdge`, never up. */
export function fitWithin(source: Dimensions, maxEdge: number): Dimensions {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxEdge) return { ...source };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * Grabs the current video frame as a JPEG, scaled down on the way out.
 *
 * Drawing straight into an already-sized canvas avoids encoding the full-size
 * frame first, so this is one resize rather than a capture followed by a
 * re-encode.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  maxEdge = CAPTURE_MAX_EDGE,
  quality = 0.85,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (!video.videoWidth || !video.videoHeight) return null;

  const { width, height } = fitWithin(
    { width: video.videoWidth, height: video.videoHeight },
    maxEdge,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );

  return blob ? { blob, width, height } : null;
}

/** Output formats that survive a canvas redraw with their transparency intact. */
const ALPHA_SAFE_TYPES = new Set(["image/png", "image/webp"]);

/**
 * Reads a picked file into an image scaled to fit, for admin reference uploads.
 *
 * PNG and WebP come back as themselves. A logo uploaded as a cut-out would
 * otherwise have its transparency flattened to black, and the logo is the one
 * item a check compares photo-to-photo rather than in words.
 */
export async function shrinkImageFile(
  file: File,
  maxEdge = CAPTURE_MAX_EDGE,
  quality = 0.85,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(
    { width: bitmap.width, height: bitmap.height },
    maxEdge,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const type = ALPHA_SAFE_TYPES.has(file.type) ? file.type : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
  return blob ? new File([blob], file.name, { type: blob.type }) : file;
}
