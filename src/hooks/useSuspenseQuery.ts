import { useCallback, useEffect, useRef, useState } from "react";

import { useRestCache } from "../context";
import type { HttpMethod, RestCacheType } from "../restCache";
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
  promise: Promise<T>;
  status: "pending" | "resolved" | "rejected";
  data?: T;
  error?: Error;
}

// Suspense resources live outside of components, keyed by query key and
// scoped per RestCache instance: React discards all hook state (including
// refs) when a component suspends during its initial render, so a resource
// stored in a ref would be recreated — and its fetch restarted — on every
// retry, suspending forever. Sharing by key also means two components
// rendering the same query reuse a single request.
const resourceCaches = new WeakMap<
  RestCacheType,
  Map<string, SuspenseResource<any>>
>();

const getResourceCache = (restCache: RestCacheType) => {
  let resources = resourceCaches.get(restCache);
  if (!resources) {
    resources = new Map();
    resourceCaches.set(restCache, resources);
  }
  return resources;
};

export const useSuspenseQuery = <T>(
  path: string,
  options?: SuspenseQueryOptions
): UseSuspenseQueryResult<T> => {
  const restCache = useRestCache();
  const { query, unsubscribe, getQueryKey, getHydratedData, ingest } =
    restCache;
  const notify = useCacheSubscription();
  const [loadingMore, setLoadingMore] = useState(false);
  const ingestedKeyRef = useRef<string | null>(null);

  const queryKey = getQueryKey(path, {
    params: options?.params,
    method: options?.method,
    body: options?.body,
  });

  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;

  const resources = getResourceCache(restCache);
  let resource = resources.get(queryKey) as SuspenseResource<T> | undefined;

  if (!resource) {
    const hydratedData = getHydratedData<T>(queryKey);
    if (hydratedData !== undefined) {
      resource = {
        promise: Promise.resolve(hydratedData),
        status: "resolved",
        data: hydratedData,
      };
    } else {
      const newResource: SuspenseResource<T> = {
        promise: undefined as any,
        status: "pending",
      };
      newResource.promise = query<T>(
        {
          path,
          signal: new AbortController().signal,
          params: options?.params,
          method: options?.method || "GET",
          body: options?.body,
        },
        notify
      )
        .then((data) => {
          newResource.status = "resolved";
          newResource.data = data as T;
          return data as T;
        })
        .catch((error) => {
          newResource.status = "rejected";
          newResource.error = error;
          throw error;
        });
      // Consume the rejection on the side so an error doesn't surface as an
      // unhandled rejection when no component is suspended on the promise.
      newResource.promise.catch(() => {});
      resource = newResource;
    }
    resources.set(queryKey, resource);
  }

  // Subscribe this component to the entities in the resource's data so cache
  // updates trigger re-renders. Runs after every render: each component
  // sharing a resource (including hydrated ones) must register its own
  // observer, and again when the query key changes.
  useEffect(() => {
    const current = resources.get(queryKey) as SuspenseResource<T> | undefined;
    if (
      current?.status === "resolved" &&
      current.data !== undefined &&
      ingestedKeyRef.current !== queryKey
    ) {
      ingest(current.data, notify);
      ingestedKeyRef.current = queryKey;
    }
  });

  // Cleanup on unmount. A rejected resource is evicted here — not during the
  // render that throws it, which React replays and would restart the fetch —
  // so a later remount (e.g. after an error boundary reset) retries the query
  // instead of replaying the cached rejection forever.
  useEffect(() => {
    return () => {
      const current = resources.get(queryKeyRef.current);
      if (current?.status === "rejected") {
        resources.delete(queryKeyRef.current);
      }
      unsubscribe(notify);
    };
  }, []);

  const refetch = useCallback(() => {
    query<T>(
      {
        path,
        signal: new AbortController().signal,
        params: options?.params,
        method: options?.method || "GET",
        body: options?.body,
      },
      notify
    )
      .then((data) => {
        const current = resources.get(queryKey) as
          | SuspenseResource<T>
          | undefined;
        if (current) {
          current.data = data as T;
        }
        notify();
      })
      .catch((error) => {
        const current = resources.get(queryKey) as
          | SuspenseResource<T>
          | undefined;
        if (current) {
          current.status = "rejected";
          current.error = error;
        }
        notify();
      });
  }, [queryKey]);

  const fetchMore = useCallback(
    (
      mergeFn: MergeFn<T>,
      optionsMore?: Pick<SuspenseQueryOptions, "params">
    ) => {
      setLoadingMore(true);

      query<T>(
        {
          path,
          signal: new AbortController().signal,
          params: optionsMore?.params || undefined,
          method: options?.method || "GET",
          body: options?.body,
        },
        notify
      )
        .then((newData) => {
          const current = resources.get(queryKey) as
            | SuspenseResource<T>
            | undefined;
          if (current) {
            current.data = mergeFn(current.data as T, newData as T);
          }
          setLoadingMore(false);
        })
        .catch((error) => {
          setLoadingMore(false);
          const current = resources.get(queryKey) as
            | SuspenseResource<T>
            | undefined;
          if (current) {
            current.status = "rejected";
            current.error = error;
          }
          notify();
        });
    },
    [queryKey]
  );

  // Suspend: throw promise while pending
  if (resource.status === "pending") {
    throw resource.promise;
  }

  // Error Boundary: throw error if rejected
  if (resource.status === "rejected") {
    throw resource.error;
  }

  return {
    data: resource.data as T,
    refetch,
    fetchMore,
    loadingMore,
  };
};
