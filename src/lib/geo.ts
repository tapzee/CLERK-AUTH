import type { CaptureMethod } from "@/lib/capture";
import { StorageError } from "@/lib/storage";

export type { CaptureMethod };

export type LocationInput = {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  altitudeM: number | null;
  /** Why there is no fix, when there isn't one (denied, timed out, …). */
  error: string | null;
};

function finiteOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return value === null || value === "" || !Number.isFinite(parsed) ? null : parsed;
}

/**
 * Parses the location fields off the upload form.
 *
 * These coordinates come from the browser, so they are self-reported: a user
 * with devtools open can override their position. The range checks below reject
 * nonsense, but they cannot prove the fix is genuine. Treat stored coordinates
 * as "what the device claimed", not as attested truth.
 */
export function parseLocation(form: FormData): LocationInput {
  const latitude = finiteOrNull(form.get("latitude"));
  const longitude = finiteOrNull(form.get("longitude"));
  const accuracyM = finiteOrNull(form.get("accuracyM"));
  const altitudeM = finiteOrNull(form.get("altitudeM"));
  const rawError = form.get("locationError");

  // Latitude and longitude are only meaningful together.
  if ((latitude === null) !== (longitude === null)) {
    throw new StorageError("Latitude and longitude must be sent together.", 400);
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    throw new StorageError("Latitude must be between -90 and 90.", 400);
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    throw new StorageError("Longitude must be between -180 and 180.", 400);
  }
  if (accuracyM !== null && accuracyM < 0) {
    throw new StorageError("Accuracy cannot be negative.", 400);
  }

  return {
    latitude,
    longitude,
    accuracyM,
    altitudeM,
    error:
      latitude === null && typeof rawError === "string" && rawError
        ? rawError.slice(0, 200)
        : null,
  };
}

export function parseCaptureMethod(form: FormData): CaptureMethod {
  return form.get("captureMethod") === "blink" ? "blink" : "manual";
}
