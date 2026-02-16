import { useCallback, useEffect, useState } from "react";

import { useRestCache } from "../context";
import type { HttpMethod } from "../restCache";

interface Options {
  params?: Record<string, string>;
  skip?: boolean;
  prefetchFromCache?: {
    singleObject: {
      __typename: string;
      id: string;
    };
  };
  method?: HttpMethod;
  body?: any;
}

type MergeFn<T> = (prevData: T, newData: T) => T;

interface UseQueryResult<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refetch: () => void;
  fetchMore: (mergeFn: MergeFn<T>, optionsMore?: Pick<Options, "params">) => void;
  loadingMore: boolean;
}

export const useQuery = <T>(path: string, options?: Options): UseQueryResult<T> => {
  const { query, unsubscribe, get } = useRestCache();
  const [, setIncrement] = useState(0); // Only way to force a re-render
  const [data, setData] = useState<T | undefined>(undefined);
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

    query<T>(
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
          // it'll raise an error, that we don't
          // want to display.
          return;
        }

        setError(error);
        setLoading(false);
        setData(undefined);
      });
  }, [path, JSON.stringify(options)]);

  const fetchMore = useCallback(
    (mergeFn: MergeFn<T>, optionsMore?: Pick<Options, "params">) => {
      setLoadingMore(true);

      const abortController = new AbortController();
      abortControllers.add(abortController);
      const signal = abortController.signal;

      query<T>(
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
          setData(mergeFn(data as T, newData));
          setLoadingMore(false);
        })
        .catch((error) => {
          if (signal.aborted) {
            // If the request has been cancelled,
            // it'll raise an error, that we don't
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

  const dataFromQueryOrCache: T | undefined =
    data ??
    (options?.prefetchFromCache
      ? get<T>(options.prefetchFromCache.singleObject)
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
