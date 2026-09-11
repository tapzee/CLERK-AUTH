/**
 * Capture sizing.
 *
 * Runs in the browser, so nothing here may import `server-only`.
 */

/**
 * Longest edge of an uploaded evidence photo.
 *
 * A 1280x720 frame at quality 0.92 is around 300 KB; at 640px it is closer to
 * 60 KB. On a cart's mobile connection that is the difference between a punch
 * that feels instant and one that visibly hangs, and it is still far more
 * detail than a manager needs to see whether a cap is on.
 */
export const EVIDENCE_MAX_EDGE = 640;

/**
 * What Phase 2 will downscale to before sending a frame to the model.
 *
 * Gemini charges a flat 258 tokens for an image whose dimensions are both 384px
 * or under, and tiles anything larger at 258 tokens per 768x768 tile — so a
 * 640px frame costs about four times as much as a 384px one for the same
 * "is the cap on" verdict. Kept here next to the evidence size so the two
 * stay visibly distinct.
 */
export const MODEL_MAX_EDGE = 384;

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
 * Drawing straight into an already-small canvas avoids encoding the full-size
 * frame first, so this is one resize rather than a capture followed by a
 * re-encode.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  maxEdge = EVIDENCE_MAX_EDGE,
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
