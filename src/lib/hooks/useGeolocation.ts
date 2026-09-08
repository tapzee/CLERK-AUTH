"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GeoFix = {
  latitude: number;
  longitude: number;
  /** Radius of 68% confidence, in metres. Smaller is better. */
  accuracyM: number;
  altitudeM: number | null;
  at: string;
};

/** A fix older than this is treated as stale and not attached to a photo. */
export const MAX_FIX_AGE_MS = 60_000;

export function isFixFresh(fix: GeoFix, now = Date.now()): boolean {
  return now - new Date(fix.at).getTime() <= MAX_FIX_AGE_MS;
}

export type GeoState = {
  status: "idle" | "locating" | "ready" | "denied" | "unavailable";
  fix: GeoFix | null;
  error: string | null;
};

type Result = { fix: GeoFix | null; error: string | null; denied: boolean };

const EMPTY: Result = { fix: null, error: null, denied: false };

/**
 * Watches the device position while the camera is open.
 *
 * `enableHighAccuracy` asks for GPS where the device has it. On a phone that
 * usually means a fix within a few metres; on a desktop there is no GPS radio,
 * so the browser falls back to Wi-Fi and IP lookup and the accuracy radius can
 * be hundreds of metres or worse. `accuracyM` is stored with every photo so you
 * can tell which kind of fix you got.
 */
export function useGeolocation(enabled: boolean): GeoState & { retry: () => void } {
  const [result, setResult] = useState<Result>(EMPTY);
  const [attempt, setAttempt] = useState(0);
  const watchId = useRef<number | null>(null);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  // Checked during render rather than written into state from an effect.
  // `navigator` is absent while server-rendering, so this is false on the
  // server and true in the browser — see the status ordering below.
  const supported =
    typeof navigator !== "undefined" && typeof navigator.geolocation !== "undefined";

  useEffect(() => {
    if (!enabled || !supported) return;

    // A watch (rather than a one-shot read) lets the fix tighten over time as
    // the GPS settles, so the photo records the best position available.
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, altitude } = position.coords;
        setResult({
          denied: false,
          error: null,
          fix: {
            latitude,
            longitude,
            accuracyM: accuracy,
            altitudeM: altitude,
            at: new Date(position.timestamp).toISOString(),
          },
        });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setResult({
          denied,
          fix: null,
          error: denied
            ? "permission denied"
            : error.message || "could not get a fix",
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [enabled, supported, attempt]);

  // `enabled` is checked first, and it is false on the server and on the first
  // client render alike, so both produce "idle" and hydration matches. Support
  // is only reported once we are actually trying to locate — which is also more
  // honest, since "unavailable" before any attempt says nothing useful.
  const status: GeoState["status"] = !enabled
    ? "idle"
    : !supported
      ? "unavailable"
      : result.denied
        ? "denied"
        : result.fix
          ? "ready"
          : result.error
            ? "unavailable"
            : "locating";

  return {
    status,
    // Never expose a fix while disabled; callers additionally check `at` for
    // freshness before attaching it to a photo (see isFixFresh).
    fix: enabled && supported ? result.fix : null,
    error: !enabled
      ? null
      : supported
        ? result.error
        : "this browser has no geolocation API",
    retry,
  };
}
