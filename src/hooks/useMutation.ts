import { useCallback, useEffect, useRef, useState } from "react";

import { useRestCache } from "../context";
import type { HttpMethod } from "../restCache";
import { useCacheSubscription } from "./useCacheSubscription";

interface Options {
  params?: Record<string, string>;
  method: HttpMethod;
}

interface MutateOptions {
  body?: any;
  subPath?: string;
}

type UseMutationResult<T> = readonly [
  (mutationOptions?: MutateOptions) => Promise<T | void>,
  { data: T | undefined; error: Error | undefined; loading: boolean },
];

export const useMutation = <T>(path: string, options?: Options): UseMutationResult<T> => {
  const { query, unsubscribe } = useRestCache();
  const notify = useCacheSubscription();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef(new AbortController());

  const mutate = useCallback(
    (mutationOptions?: MutateOptions) => {
      abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      setLoading(true);

      return query<T>(
        {
          path: mutationOptions?.subPath
            ? `${path}${mutationOptions.subPath}`
            : path,
          signal,
          params: options?.params || undefined,
          method: options.method,
          body: mutationOptions?.body,
        },
        notify
      )
        .then((newData) => {
          setData(newData);
          setLoading(false);
          setError(undefined);

          return newData as T;
        })
        .catch((error) => {
          if (signal.aborted) {
            return;
          }

          setError(error);
          setLoading(false);

          return Promise.reject(error);
        });
    },
    [path, JSON.stringify(options)]
  );

  useEffect(() => {
    return () => {
      abortControllerRef.current.abort();
      unsubscribe(notify);
    };
  }, []);

  return [mutate, { data, error, loading }] as const;
};
