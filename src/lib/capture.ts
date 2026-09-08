/**
 * Shared between client and server, so it lives outside `src/lib/storage`,
 * which is marked `server-only`.
 */
export type CaptureMethod = "manual" | "blink";
