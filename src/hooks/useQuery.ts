import { useCallback, useEffect, useState } from "react";

import { useRestCache } from "../context";

interface Options {
  params?: Record<string, string>;
  skip?: boolean;
}

export const useQuery = <RestType>(path: string, options?: Options) => {
  const { query, unsubscribe } = useRestCache();
  const [, setIncrement] = useState(0); // Only way to force a re-render
  const [data, setData] = useState<RestType | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const rerender = useCallback(
    () => setIncrement((i) => i + 1),
    [setIncrement]
  );

  const refetch = useCallback(() => {
    setLoading(true);

    const abortController = new AbortController();
    const signal = abortController.signal;

    query<RestType>(
      { path, signal, params: options?.params || undefined },
      rerender
    )
      .then((newData) => {
        setData(newData);
        setLoading(false);
      })
      .catch((error) => {
        if (signal.aborted) {
          // If the request has been cancelled,
          // it’ll raise an error, that we don’t
          // want to display.
          return;
        }

        setError(error);
        setLoading(false);
      });

    return () => {
      abortController.abort();
      unsubscribe(rerender);
    };
  }, [path, JSON.stringify(options)]);

  useEffect(() => {
    if (options?.skip) {
      return;
    }

    return refetch();
  }, [refetch]);

  return { data, error, loading, refetch };
};
