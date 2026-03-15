import { useCallback, useEffect, useRef, useState } from "react";

import { useRestCache } from "../context";
import type { HttpMethod } from "../restCache";
import { useCacheSubscription } from "./useCacheSubscription";

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
  const { query, unsubscribe, get, getQueryKey, getHydratedData } = useRestCache();
  const notify = useCacheSubscription();

  const queryKey = getQueryKey(path, {
    params: options?.params,
    method: options?.method,
    body: options?.body,
  });

  const [hydratedData] = useState(() => getHydratedData<T>(queryKey));
  const [data, setData] = useState<T | undefined>(hydratedData ?? undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(options?.skip || hydratedData !== undefined ? false : true);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortControllersRef = useRef(new Set<AbortController>());

  const refetch = useCallback(() => {
    setLoading(true);

    const abortController = new AbortController();
    abortControllersRef.current.add(abortController);
    const signal = abortController.signal;

    query<T>(
      {
        path,
        signal,
        params: options?.params || undefined,
        method: options?.method || "GET",
        body: options?.body || undefined,
      },
      notify
    )
      .then((newData) => {
        setData(newData);
        setLoading(false);
        setError(undefined);
      })
      .catch((error) => {
        if (signal.aborted) {
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
      abortControllersRef.current.add(abortController);
      const signal = abortController.signal;

      query<T>(
        {
          path,
          signal,
          params: optionsMore?.params || undefined,
          method: options?.method || "GET",
          body: options?.body || undefined,
        },
        notify
      )
        .then((newData) => {
          setData(mergeFn(data as T, newData));
          setLoadingMore(false);
        })
        .catch((error) => {
          if (signal.aborted) {
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
      abortControllersRef.current.forEach((abortController) => {
        abortController.abort();
      });
      unsubscribe(notify);
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
