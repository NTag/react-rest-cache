import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const { query, unsubscribe, get, getQueryKey, getHydratedData, materialize, registerQuery } =
    useRestCache();
  const { version, notify } = useCacheSubscription();

  const queryKey = getQueryKey(path, {
    params: options?.params,
    method: options?.method,
    body: options?.body,
  });

  const [hydratedData] = useState(() => getHydratedData<T>(queryKey));
  const [rawData, setRawData] = useState<T | undefined>(hydratedData ?? undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(options?.skip || hydratedData !== undefined ? false : true);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortControllersRef = useRef(new Set<AbortController>());
  // Which query key the current rawData belongs to. Refetches for a key
  // whose data is already displayed happen in the background (no loading
  // flip): hydrated mounts, invalidateQueries and manual refetches
  // revalidate without a loading flash.
  const dataKeyRef = useRef<string | null>(
    hydratedData !== undefined ? queryKey : null
  );

  const refetch = useCallback(() => {
    if (dataKeyRef.current !== queryKey) {
      setLoading(true);
    }

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
        setRawData(newData);
        dataKeyRef.current = queryKey;
        setLoading(false);
        setError(undefined);
      })
      .catch((error) => {
        if (signal.aborted) {
          return;
        }

        setError(error);
        setLoading(false);
        setRawData(undefined);
        dataKeyRef.current = null;
      })
      .finally(() => {
        abortControllersRef.current.delete(abortController);
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
          setRawData((prevData) => mergeFn(prevData as T, newData as T));
          setLoadingMore(false);
        })
        .catch((error) => {
          if (signal.aborted) {
            return;
          }

          setError(error);
          setLoadingMore(false);
        })
        .finally(() => {
          abortControllersRef.current.delete(abortController);
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

  // Register with the cache so invalidateQueries(path) can refetch this
  // query while it is mounted.
  useEffect(() => {
    if (options?.skip) {
      return;
    }
    return registerQuery({ queryKey, path, refetch });
  }, [refetch, queryKey, path, options?.skip]);

  // Re-read the data from the cache whenever an observed entity changes
  // (`version` bump): unchanged entities keep their identity, updated ones
  // get a new immutable snapshot.
  const data = useMemo(
    () => (rawData === undefined ? undefined : (materialize(rawData) as T)),
    [rawData, version]
  );

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
