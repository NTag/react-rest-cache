import { useCallback, useEffect, useState } from "react";

import { useRestCache } from "../context";

interface Options {
  params?: Record<string, string>;
  skip?: boolean;
  prefetchFromCache?: {
    singleObject: {
      __typename: string;
      id: string;
    };
  };
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
}

type MergeFn<T> = (prevData: T, newData: T) => T;

export const useQuery = <RestType>(path: string, options?: Options) => {
  const { query, unsubscribe, get } = useRestCache();
  const [, setIncrement] = useState(0); // Only way to force a re-render
  const [data, setData] = useState<RestType | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(options?.skip ? false : true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [abortControllers] = useState<Set<AbortController>>(new Set());
  const rerender = useCallback(
    () => setIncrement((i) => i + 1),
    [setIncrement]
  );

  const refetch = useCallback(() => {
    setLoading(true);

    const abortController = new AbortController();
    abortControllers.add(abortController);
    const signal = abortController.signal;

    query<RestType>(
      {
        path,
        signal,
        params: options?.params || undefined,
        method: options?.method || "GET",
        body: options?.body || undefined,
      },
      rerender
    )
      .then((newData) => {
        setData(newData);
        setLoading(false);
        setError(undefined);
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
        setData(undefined);
      });
  }, [path, JSON.stringify(options)]);

  const fetchMore = useCallback(
    (mergeFn: MergeFn<RestType>, optionsMore?: Pick<Options, "params">) => {
      setLoadingMore(true);

      const abortController = new AbortController();
      abortControllers.add(abortController);
      const signal = abortController.signal;

      query<RestType>(
        {
          path,
          signal,
          params: optionsMore?.params || undefined,
          method: options?.method || "GET",
          body: options?.body || undefined,
        },
        rerender
      )
        .then((newData) => {
          setData(mergeFn(data as RestType, newData));
          setLoadingMore(false);
        })
        .catch((error) => {
          if (signal.aborted) {
            // If the request has been cancelled,
            // it’ll raise an error, that we don’t
            // want to display.
            return;
          }

          setError(error);
          setLoadingMore(false);
        });
    },
    [path, JSON.stringify(options)]
  );

  useEffect(() => {
    if (options?.skip) {
      return;
    }

    refetch();

    return () => {
      abortControllers.forEach((abortController) => {
        abortController.abort();
      });
      unsubscribe(rerender);
    };
  }, [refetch, options?.skip]);

  const dataFromQueryOrCache =
    data ??
    (options?.prefetchFromCache
      ? get(options.prefetchFromCache.singleObject)
      : undefined);

  return {
    data: dataFromQueryOrCache,
    error,
    loading,
    refetch,
    fetchMore,
    loadingMore,
  };
};
