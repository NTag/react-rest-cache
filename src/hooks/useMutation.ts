import { useCallback, useEffect, useRef, useState } from "react";

import { useRestCache } from "../context";
import type { HttpMethod } from "../restCache";
import { useCacheSubscription } from "./useCacheSubscription";

export interface UseMutationOptions {
  params?: Record<string, string>;
  method: HttpMethod;
  // Paths of queries to invalidate (refetch) after a successful mutation,
  // e.g. ["/users"] after creating or deleting a user.
  invalidateQueries?: string[];
}

export interface MutateOptions {
  body?: any;
  subPath?: string;
}

export type UseMutationResult<T> = readonly [
  (mutationOptions?: MutateOptions) => Promise<T>,
  { data: T | undefined; error: Error | undefined; loading: boolean },
];

export const useMutation = <T>(path: string, options: UseMutationOptions): UseMutationResult<T> => {
  const { query, unsubscribe, invalidateQueries } = useRestCache();
  const { notify } = useCacheSubscription();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  // Calls in flight: each one runs to the end. A write already sent can't be
  // taken back by aborting it, only its answer lost (and the cache with it).
  const inFlightRef = useRef(0);
  const mountedRef = useRef(true);

  const mutate = useCallback(
    (mutationOptions?: MutateOptions) => {
      inFlightRef.current += 1;
      if (mountedRef.current) {
        setLoading(true);
      }

      // Answered after unmount: the cache is updated (other components see
      // it), but this hook's state is left alone and it stops observing.
      const settle = (update: () => void) => {
        inFlightRef.current -= 1;
        if (!mountedRef.current) {
          unsubscribe(notify);
          return;
        }
        update();
        setLoading(inFlightRef.current > 0);
      };

      return query<T>(
        {
          path: mutationOptions?.subPath
            ? `${path}${mutationOptions.subPath}`
            : path,
          // Never aborted (see above).
          signal: new AbortController().signal,
          params: options.params || undefined,
          method: options.method,
          body: mutationOptions?.body,
        },
        notify
      ).then(
        (newData) => {
          settle(() => {
            setData(newData);
            setError(undefined);
          });

          options.invalidateQueries?.forEach((invalidatePath) =>
            invalidateQueries(invalidatePath)
          );

          return newData as T;
        },
        (error) => {
          settle(() => setError(error));

          return Promise.reject(error);
        }
      );
    },
    [path, JSON.stringify(options)]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      unsubscribe(notify);
    };
  }, []);

  return [mutate, { data, error, loading }] as const;
};
