import { useCallback, useEffect, useRef, useState } from "react";

import { useRestCache } from "../context";
import type { HttpMethod } from "../restCache";
import { useCacheSubscription } from "./useCacheSubscription";

interface SuspenseQueryOptions {
  params?: Record<string, string>;
  method?: HttpMethod;
  body?: any;
}

type MergeFn<T> = (prevData: T, newData: T) => T;

interface UseSuspenseQueryResult<T> {
  data: T;
  refetch: () => void;
  fetchMore: (
    mergeFn: MergeFn<T>,
    optionsMore?: Pick<SuspenseQueryOptions, "params">
  ) => void;
  loadingMore: boolean;
}

interface SuspenseResource<T> {
  key: string;
  promise: Promise<T>;
  status: "pending" | "resolved" | "rejected";
  data?: T;
  error?: Error;
  abortController: AbortController;
}

export const useSuspenseQuery = <T>(
  path: string,
  options?: SuspenseQueryOptions
): UseSuspenseQueryResult<T> => {
  const { query, unsubscribe, get } = useRestCache();
  const notify = useCacheSubscription();
  const [loadingMore, setLoadingMore] = useState(false);
  const resourceRef = useRef<SuspenseResource<T> | null>(null);

  const queryKey = JSON.stringify({
    path,
    params: options?.params,
    method: options?.method,
    body: options?.body,
  });

  // Start fetch if needed (first render or query key changed)
  if (!resourceRef.current || resourceRef.current.key !== queryKey) {
    resourceRef.current?.abortController.abort();

    const abortController = new AbortController();
    const resource: SuspenseResource<T> = {
      key: queryKey,
      promise: undefined as any,
      status: "pending",
      abortController,
    };

    resource.promise = query<T>(
      {
        path,
        signal: abortController.signal,
        params: options?.params,
        method: options?.method || "GET",
        body: options?.body,
      },
      notify
    )
      .then((data) => {
        resource.status = "resolved";
        resource.data = data as T;
        return data as T;
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return undefined as any;
        }
        resource.status = "rejected";
        resource.error = error;
        throw error;
      });

    resourceRef.current = resource;
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resourceRef.current?.abortController.abort();
      unsubscribe(notify);
    };
  }, []);

  const resource = resourceRef.current;

  // Suspend: throw promise while pending
  if (resource.status === "pending") {
    throw resource.promise;
  }

  // Error Boundary: throw error if rejected
  if (resource.status === "rejected") {
    throw resource.error;
  }

  const refetch = useCallback(() => {
    const abortController = new AbortController();
    resourceRef.current!.abortController = abortController;

    query<T>(
      {
        path,
        signal: abortController.signal,
        params: options?.params,
        method: options?.method || "GET",
        body: options?.body,
      },
      notify
    ).then((data) => {
      if (resourceRef.current) {
        resourceRef.current.data = data as T;
        notify();
      }
    });
  }, [queryKey]);

  const fetchMore = useCallback(
    (
      mergeFn: MergeFn<T>,
      optionsMore?: Pick<SuspenseQueryOptions, "params">
    ) => {
      setLoadingMore(true);

      const abortController = new AbortController();

      query<T>(
        {
          path,
          signal: abortController.signal,
          params: optionsMore?.params || undefined,
          method: options?.method || "GET",
          body: options?.body,
        },
        notify
      )
        .then((newData) => {
          if (resourceRef.current) {
            resourceRef.current.data = mergeFn(
              resourceRef.current.data as T,
              newData as T
            );
          }
          setLoadingMore(false);
        })
        .catch((error) => {
          if (abortController.signal.aborted) {
            return;
          }
          setLoadingMore(false);
        });
    },
    [queryKey]
  );

  return {
    data: resource.data as T,
    refetch,
    fetchMore,
    loadingMore,
  };
};
