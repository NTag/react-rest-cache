import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Subscribes to cache entity changes via useSyncExternalStore.
 * Returns the current `version` (bumped every time an observed entity
 * changes — use it as a dependency to re-read data from the cache) and a
 * `notify` function to be passed as the observer to restCache.query().
 */
export const useCacheSubscription = (): {
  version: number;
  notify: () => void;
} => {
  const versionRef = useRef(0);
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => versionRef.current, []);

  const version = useSyncExternalStore(subscribe, getSnapshot, () => 0);

  const notify = useCallback(() => {
    versionRef.current++;
    listenersRef.current.forEach((l) => l());
  }, []);

  return { version, notify };
};
