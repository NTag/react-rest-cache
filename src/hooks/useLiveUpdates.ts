import { useEffect, useRef } from "react";

import { useRestCache } from "../context";
import { connectLiveUpdates, type LiveUpdatesOptions } from "../live";

/**
 * Keeps the cache up to date from a Server-Sent Events stream while the
 * component is mounted (see `connectLiveUpdates`). Mount it once, near the
 * `Provider`: every component reading the cache benefits.
 */
export const useLiveUpdates = (
  path: string,
  options: LiveUpdatesOptions & { skip?: boolean } = {}
): void => {
  const restCache = useRestCache();
  // The latest callbacks, without reconnecting when they change identity.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { skip = false, withCredentials = false } = options;

  useEffect(() => {
    if (skip) {
      return;
    }
    return connectLiveUpdates(restCache, path, {
      withCredentials,
      eventSource: optionsRef.current.eventSource,
      onError: (error) => optionsRef.current.onError?.(error),
    });
  }, [restCache, path, skip, withCredentials]);
};
