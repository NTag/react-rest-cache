import { FetchError } from "./error";

interface ReactRestCacheOptions {
  baseUrl: string;
  fetchOptions?: Partial<RequestInit> & {
    headers?: () => HeadersInit;
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

interface Cache {
  [typename: string]: {
    [id: string]: {
      data: any;
      observers: Set<() => void>;
    };
  };
}

type Observer = () => void;

const addResponseToCacheAndNotifyObservers = (
  cache: Cache,
  data: any,
  observer: Observer,
  observersToCall: Set<Observer>
) => {
  if (data === undefined || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) =>
      addResponseToCacheAndNotifyObservers(
        cache,
        item,
        observer,
        observersToCall
      )
    );
  }

  if (typeof data === "object") {
    if (!("id" in data) || !("__typename" in data)) {
      // console.warn("No id or __typename in", data);
      Object.keys(data).forEach((key) => {
        data[key] = addResponseToCacheAndNotifyObservers(
          cache,
          data[key],
          observer,
          observersToCall
        );
      });
      return data;
    }

    const { id, __typename: typename } = data;

    if (!cache[typename]) {
      cache[typename] = {};
    }

    if (!cache[typename][id]) {
      cache[typename][id] = {
        data,
        observers: new Set([observer]),
      };
    }

    Object.keys(data).forEach((key) => {
      cache[typename][id].data[key] = addResponseToCacheAndNotifyObservers(
        cache,
        data[key],
        observer,
        observersToCall
      );
    });

    cache[typename][id].observers.forEach((obs) => observersToCall.add(obs));
    cache[typename][id].observers.add(observer);

    return cache[typename][id].data;
  }

  return data;
};

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
  const { baseUrl, fetchOptions } = options;

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
      method,
      body: getBody(),
      signal,
      ...(fetchOptions || {}),
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

    const observersToCall = new Set<Observer>();
    const result = addResponseToCacheAndNotifyObservers(
      cache,
      data,
      observer,
      observersToCall
    ) as RestType;
    observersToCall.forEach((obs) => obs());
    return result;
  };

  const unsubscribe = (observer: Observer) => {
    Object.values(cache).forEach((typename) => {
      Object.values(typename).forEach((id) => {
        id.observers.delete(observer);
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
    return cache[__typename]?.[id]?.data;
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

  const ingest = <T>(data: T, observer: Observer): T => {
    const observersToCall = new Set<Observer>();
    const result = addResponseToCacheAndNotifyObservers(
      cache,
      data,
      observer,
      observersToCall
    ) as T;
    observersToCall.forEach((obs) => obs());
    return result;
  };

  return {
    query,
    unsubscribe,
    get,
    getQueryKey,
    prefetchQuery,
    dehydrate,
    hydrate,
    getHydratedData,
    setQueryData,
    ingest,
  };
};

export type RestCacheType = ReturnType<typeof RestCache>;
