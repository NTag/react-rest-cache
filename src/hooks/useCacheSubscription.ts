import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Subscribes to cache entity changes via useSyncExternalStore.
 * Returns a `notify` function to be passed as the observer to restCache.query().
 * When notify is called (i.e. a cached entity changed), useSyncExternalStore
 * triggers a re-render so the component picks up the mutated data.
 */
export const useCacheSubscription = (): (() => void) => {
  const versionRef = useRef(0);
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => versionRef.current, []);

  useSyncExternalStore(subscribe, getSnapshot);

  return useCallback(() => {
    versionRef.current++;
    listenersRef.current.forEach((l) => l());
  }, []);
};
