"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * A boolean that survives a reload, remembered per browser rather than per
 * account -- e.g. "did this worker turn blink-capture on for the phone
 * propped up at this cart".
 *
 * Hydration-safe: renders false during SSR and initial hydration to match
 * server output, then reconciles to stored localStorage preference after mount.
 */
export function usePersistedBoolean(key: string): [boolean, (value: boolean) => void] {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [key]);

  const getServerSnapshot = useCallback(() => false, []);

  const storedValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = mounted ? storedValue : false;

  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Nothing durable to fall back to
      }
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key],
  );

  return [value, set];
}
