"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A boolean that survives a reload, remembered per browser rather than per
 * account -- e.g. "did this worker turn blink-capture on for the phone
 * propped up at this cart".
 *
 * Built on `useSyncExternalStore` rather than the more familiar "read
 * localStorage in a `useEffect`, then `setState`": that pattern forces an
 * extra render right after hydration to reach state the server could never
 * know, and a `setState` call sitting directly in an effect body is exactly
 * what `react-hooks/set-state-in-effect` exists to flag. `useSyncExternalStore`
 * is the sanctioned way to read state a server cannot see -- it renders the
 * given default during SSR and the first client paint (so the two always
 * agree), then reconciles to the real value before the browser shows anything,
 * with no separate effect and no lint violation.
 */
export function usePersistedBoolean(key: string): [boolean, (value: boolean) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    // The browser only fires "storage" for a change made in *another* tab; a
    // change made here is signalled explicitly by `set`, below.
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      // Private browsing, or storage disabled outright. False is the safe
      // default rather than a thrown error.
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
        // Nothing durable to fall back to; the toggle still works for this
        // tab, it just will not be remembered on the next visit.
      }
      // A same-tab write does not raise the native "storage" event, so this
      // component (and any sibling reading the same key) is nudged directly.
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key],
  );

  return [value, set];
}
