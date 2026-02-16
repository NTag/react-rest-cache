import { useCallback, useEffect, useState } from "react";

import { useRestCache } from "../context";
import type { HttpMethod } from "../restCache";

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
  const [, setIncrement] = useState(0); // Only way to force a re-render
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const rerender = useCallback(
    () => setIncrement((i) => i + 1),
    [setIncrement]
  );
  const [abortController, setAbortController] = useState(new AbortController());

  const mutate = useCallback(
    (mutationOptions?: MutateOptions) => {
      setLoading(true);

      const signal = abortController.signal;

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
        rerender
      )
        .then((newData) => {
          setData(newData);
          setLoading(false);
          setError(undefined);

          return newData as T;
        })
        .catch((error) => {
          if (signal.aborted) {
            // If the request has been cancelled,
            // it'll raise an error, that we don't
            // want to display.
            return;
          }

          setError(error);
          setLoading(false);

          return Promise.reject(error);
        });
    },
    [path, JSON.stringify(options), abortController]
  );

  useEffect(() => {
    setAbortController(new AbortController());

    return () => {
      abortController.abort();
      unsubscribe(rerender);
    };
  }, []);

  return [mutate, { data, error, loading }] as const;
};
