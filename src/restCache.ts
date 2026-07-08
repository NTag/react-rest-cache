import { FetchError } from "./error";

interface ReactRestCacheOptions {
  baseUrl: string;
  fetchOptions?: Omit<RequestInit, "headers"> & {
    headers?: Record<string, string> | (() => Record<string, string>);
  };
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface QueryOptions {
  path: string;
  method?: HttpMethod;
  body?: any;
  signal: AbortSignal;
  params?: Record<string, string>;
}

type Observer = () => void;

// A cached entity. `data` holds the normalized fields: scalars as-is, plain
// containers rebuilt, nested entities as CacheEntry references. Snapshots
// are immutable plain objects derived from `data`; a snapshot is rebuilt
// (new identity) whenever the entity or any entity it references changed,
// and reused otherwise, so React.memo / useMemo / React Compiler
// memoization stays correct.
class CacheEntry {
  data: Record<string, unknown> = {};
  version = 0;
  snapshot: Record<string, unknown> | undefined;
  snapshotVersion = -1;
  snapshotDeps = new Map<CacheEntry, unknown>();
  observers = new Set<Observer>();
}

interface Cache {
  [typename: string]: {
    [id: string]: CacheEntry;
  };
}

interface ActiveQuery {
  queryKey: string;
  path: string;
  refetch: () => void;
}

const isPlainObjectLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const removeUndefinedParams = (params: Record<string, string>) => {
  return Object.fromEntries(
    Object.entries(params).filter(([_, value]) => value !== undefined)
  );
};

export interface DehydratedState {
  queries: Record<string, any>;
}

export const RestCache = (options: ReactRestCacheOptions) => {
  const cache: Cache = {};
  const queryCache: Record<string, any> = {};
  // Maps every snapshot this cache ever built back to its entry, so data
  // that came out of the cache can be re-read (materialize) or re-ingested
  // without risking a stale write.
  const snapshotToEntry = new WeakMap<object, CacheEntry>();
  const activeQueries = new Set<ActiveQuery>();
  // Suspense resources of useSuspenseQuery, keyed by query key. Owned by the
  // cache so invalidateQueries can drop them; treat as internal.
  const suspenseResources = new Map<string, unknown>();
  const { baseUrl, fetchOptions } = options;

  const areNormalizedEqual = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) {
      return true;
    }
    if (a instanceof CacheEntry || b instanceof CacheEntry) {
      return false;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return (
        a.length === b.length &&
        a.every((item, i) => areNormalizedEqual(item, b[i]))
      );
    }
    if (isPlainObjectLike(a) && isPlainObjectLike(b)) {
      const aKeys = Object.keys(a);
      return (
        aKeys.length === Object.keys(b).length &&
        aKeys.every((key) => key in b && areNormalizedEqual(a[key], b[key]))
      );
    }
    return false;
  };

  const addObserverToReachable = (
    value: unknown,
    observer: Observer,
    seen: Set<CacheEntry>
  ): void => {
    if (value instanceof CacheEntry) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
      value.observers.add(observer);
      Object.values(value.data).forEach((field) =>
        addObserverToReachable(field, observer, seen)
      );
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => addObserverToReachable(item, observer, seen));
      return;
    }
    if (isPlainObjectLike(value)) {
      Object.values(value).forEach((field) =>
        addObserverToReachable(field, observer, seen)
      );
    }
  };

  const normalize = (
    value: unknown,
    observer: Observer,
    notified: Set<Observer>
  ): unknown => {
    if (value === null || typeof value !== "object") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => normalize(item, observer, notified));
    }

    // Data that came out of this cache maps straight back to its entry: it
    // cannot be newer than the cache, so merging it could only write stale
    // values back. Just subscribe the observer.
    const existingEntry = snapshotToEntry.get(value);
    if (existingEntry) {
      addObserverToReachable(existingEntry, observer, new Set());
      return existingEntry;
    }

    const record = value as Record<string, unknown>;
    if (!("id" in record) || !("__typename" in record)) {
      const normalized: Record<string, unknown> = {};
      Object.keys(record).forEach((key) => {
        normalized[key] = normalize(record[key], observer, notified);
      });
      return normalized;
    }

    const typename = String(record.__typename);
    const id = String(record.id);
    let byId = cache[typename];
    if (!byId) {
      byId = {};
      cache[typename] = byId;
    }
    let entry = byId[id];
    let changed = false;
    if (!entry) {
      entry = new CacheEntry();
      byId[id] = entry;
      changed = true;
    }

    const newFields: Record<string, unknown> = {};
    Object.keys(record).forEach((key) => {
      const normalizedField = normalize(record[key], observer, notified);
      newFields[key] = normalizedField;
      if (!areNormalizedEqual(entry.data[key], normalizedField)) {
        changed = true;
      }
    });

    // Merge semantics: fields missing from this response are kept.
    if (changed) {
      entry.data = { ...entry.data, ...newFields };
      entry.version++;
      entry.observers.forEach((obs) => notified.add(obs));
    }
    entry.observers.add(observer);

    return entry;
  };

  const materializeValue = (
    value: unknown,
    pass: Map<CacheEntry, Record<string, unknown>>,
    deps?: Map<CacheEntry, unknown>
  ): unknown => {
    if (value instanceof CacheEntry) {
      const snapshot = materializeEntry(value, pass);
      deps?.set(value, snapshot);
      return snapshot;
    }
    if (Array.isArray(value)) {
      return value.map((item) => materializeValue(item, pass, deps));
    }
    if (isPlainObjectLike(value)) {
      // A snapshot passed back in (re-reading previously returned data)
      // resolves to the current state of its entry.
      const entry = snapshotToEntry.get(value);
      if (entry) {
        const snapshot = materializeEntry(entry, pass);
        deps?.set(entry, snapshot);
        return snapshot;
      }
      const result: Record<string, unknown> = {};
      Object.keys(value).forEach((key) => {
        result[key] = materializeValue(value[key], pass, deps);
      });
      return result;
    }
    return value;
  };

  const materializeEntry = (
    entry: CacheEntry,
    pass: Map<CacheEntry, Record<string, unknown>>
  ): Record<string, unknown> => {
    const passResult = pass.get(entry);
    if (passResult) {
      return passResult;
    }

    // Reuse the previous snapshot if neither this entity nor any entity it
    // references changed since it was built (structural sharing). The entry
    // is registered in the pass before validating so reference cycles
    // terminate.
    if (entry.snapshot && entry.snapshotVersion === entry.version) {
      pass.set(entry, entry.snapshot);
      let reusable = true;
      for (const [dep, depSnapshot] of entry.snapshotDeps) {
        if (materializeEntry(dep, pass) !== depSnapshot) {
          reusable = false;
          break;
        }
      }
      if (reusable) {
        return entry.snapshot;
      }
      pass.delete(entry);
    }

    const snapshot: Record<string, unknown> = {};
    pass.set(entry, snapshot);
    const deps = new Map<CacheEntry, unknown>();
    Object.keys(entry.data).forEach((key) => {
      snapshot[key] = materializeValue(entry.data[key], pass, deps);
    });
    entry.snapshot = snapshot;
    entry.snapshotVersion = entry.version;
    entry.snapshotDeps = deps;
    snapshotToEntry.set(snapshot, entry);
    return snapshot;
  };

  // Returns the current immutable view of any data previously returned by
  // the cache (or of a normalized tree). Unchanged entities keep their
  // identity; changed ones get a new snapshot.
  const materialize = <T>(data: T): T => {
    return materializeValue(data, new Map()) as T;
  };

  const ingest = <T>(data: T, observer: Observer): T => {
    const notified = new Set<Observer>();
    const normalized = normalize(data, observer, notified);
    notified.forEach((obs) => obs());
    return materialize(normalized) as T;
  };

  const query = async <RestType>(
    queryOptions: QueryOptions,
    observer: Observer
  ) => {
    const { path, method = "GET", body, signal, params } = queryOptions;

    const url = `${baseUrl}${path}${
      params ? `?${new URLSearchParams(removeUndefinedParams(params))}` : ""
    }`;
    const getBody = () => {
      if (body instanceof FormData) {
        return body;
      }

      if (body) {
        return JSON.stringify(body);
      }

      return body;
    };

    const response = await fetch(url, {
      ...(fetchOptions || {}),
      method,
      body: getBody(),
      signal,
      headers: {
        ...(body instanceof FormData
          ? {}
          : {
              "Content-Type": "application/json",
              Accept: "application/json",
            }),
        ...(typeof fetchOptions?.headers === "function"
          ? fetchOptions.headers()
          : fetchOptions?.headers || {}),
      },
    });

    if (!response.ok) {
      const error = new FetchError(response);
      await error.process();
      throw error;
    }

    // We check the content type to avoid parsing errors
    // when the response is not a valid JSON.
    if (!response.headers.get("content-type")?.includes("json")) {
      return;
    }

    const data = (await response.json()) as RestType;

    return ingest(data, observer) as RestType;
  };

  const unsubscribe = (observer: Observer) => {
    Object.values(cache).forEach((byId) => {
      Object.values(byId).forEach((entry) => {
        entry.observers.delete(observer);
      });
    });
  };

  const get = <T>({
    __typename,
    id,
  }: {
    __typename: string;
    id: string;
  }): T | undefined => {
    const entry = cache[__typename]?.[id];
    return entry ? (materialize(entry) as T) : undefined;
  };

  // Removes an entity from the cache and notifies the components observing
  // it. Queries already holding the entity keep displaying its last state
  // until they refetch: combine with invalidateQueries for delete flows.
  const evict = ({
    __typename,
    id,
  }: {
    __typename: string;
    id: string;
  }): boolean => {
    const byId = cache[__typename];
    const entry = byId?.[id];
    if (!byId || !entry) {
      return false;
    }
    delete byId[id];
    entry.observers.forEach((obs) => obs());
    return true;
  };

  const getQueryKey = (
    path: string,
    queryOptions?: {
      params?: Record<string, string>;
      method?: HttpMethod;
      body?: any;
    }
  ) => {
    return JSON.stringify({
      path,
      params: queryOptions?.params,
      method: queryOptions?.method || "GET",
      body: queryOptions?.body,
    });
  };

  // Hooks register their active queries so invalidateQueries can refetch
  // them. Returns an unregister function.
  const registerQuery = (activeQuery: ActiveQuery) => {
    activeQueries.add(activeQuery);
    return () => {
      activeQueries.delete(activeQuery);
    };
  };

  const matchesPath = (queryPath: string, path?: string) =>
    path === undefined ||
    queryPath === path ||
    queryPath.startsWith(path.endsWith("/") ? path : `${path}/`);

  // Refetches every active query whose path matches (exactly, or as a
  // "/path/..." prefix), and drops matching cached hydrated data and
  // inactive suspense results so future mounts fetch fresh data. Called
  // without argument, it invalidates everything.
  const invalidateQueries = (path?: string) => {
    const activeKeys = new Set<string>();
    activeQueries.forEach((activeQuery) => {
      if (matchesPath(activeQuery.path, path)) {
        activeKeys.add(activeQuery.queryKey);
        activeQuery.refetch();
      }
    });
    Object.keys(queryCache).forEach((key) => {
      if (matchesPath((JSON.parse(key) as { path: string }).path, path)) {
        delete queryCache[key];
      }
    });
    [...suspenseResources.keys()].forEach((key) => {
      if (
        !activeKeys.has(key) &&
        matchesPath((JSON.parse(key) as { path: string }).path, path)
      ) {
        suspenseResources.delete(key);
      }
    });
  };

  const prefetchQuery = async <T>(
    path: string,
    prefetchOptions?: {
      params?: Record<string, string>;
      method?: HttpMethod;
      body?: any;
    }
  ): Promise<T | undefined> => {
    const key = getQueryKey(path, prefetchOptions);
    const abortController = new AbortController();
    const noop = () => {};
    const data = await query<T>(
      {
        path,
        method: prefetchOptions?.method || "GET",
        body: prefetchOptions?.body,
        signal: abortController.signal,
        params: prefetchOptions?.params,
      },
      noop
    );
    queryCache[key] = data;
    return data;
  };

  const dehydrate = (): DehydratedState => {
    return { queries: { ...queryCache } };
  };

  const hydrate = (state: DehydratedState) => {
    Object.assign(queryCache, state.queries);
  };

  const getHydratedData = <T>(key: string): T | undefined => {
    if (key in queryCache) {
      return queryCache[key] as T;
    }
    return undefined;
  };

  const setQueryData = <T>(
    path: string,
    data: T,
    setQueryDataOptions?: {
      params?: Record<string, string>;
      method?: HttpMethod;
      body?: any;
    }
  ) => {
    const key = getQueryKey(path, setQueryDataOptions);
    queryCache[key] = data;
  };

  return {
    query,
    unsubscribe,
    get,
    evict,
    getQueryKey,
    registerQuery,
    invalidateQueries,
    prefetchQuery,
    dehydrate,
    hydrate,
    getHydratedData,
    setQueryData,
    ingest,
    materialize,
    suspenseResources,
  };
};

export type RestCacheType = ReturnType<typeof RestCache>;
