"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A boolean that survives a reload, remembered per browser rather than per
 * account -- e.g. "did this worker turn blink-capture on for the phone
 * propped up at this cart".
 *
 * Hydration-safe by construction: `useSyncExternalStore` renders the server
 * snapshot (false) on the server and through hydration, then swaps to what
 * `localStorage` actually holds -- so the markup matches without a `mounted`
 * flag of our own, and a change in another tab arrives through `storage`.
 */
export function usePersistedBoolean(key: string): [boolean, (value: boolean) => void] {
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

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
