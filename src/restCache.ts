interface ReactRestCacheOptions {
  baseUrl: string;
  fetchOptions?: Partial<RequestInit>;
}

interface QueryOptions {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
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
  observer: Observer
) => {
  if (Array.isArray(data)) {
    return data.map((item) =>
      addResponseToCacheAndNotifyObservers(cache, item, observer)
    );
  } else if (typeof data === "object") {
    if (!("id" in data) || !("__typename" in data)) {
      console.warn("No id or __typename in", data);
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
        observer
      );
    });

    cache[typename][id].observers.forEach((obs) => obs());
    cache[typename][id].observers.add(observer);

    return cache[typename][id].data;
  }

  return data;
};

export const RestCache = (options: ReactRestCacheOptions) => {
  const cache: Cache = {};
  const { baseUrl, fetchOptions } = options;

  const query = async <RestType>(
    queryOptions: QueryOptions,
    observer: Observer
  ) => {
    const { path, method = "GET", body, signal, params } = queryOptions;

    const response = await fetch(
      `${baseUrl}${path}${params ? `?${new URLSearchParams(params)}` : ""}`,
      {
        method,
        body: body ? JSON.stringify(body) : undefined,
        signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        ...(fetchOptions || {}),
      }
    );

    if (!response.ok) {
      throw new Error(await response.json());
    }

    const data = (await response.json()) as RestType;

    return addResponseToCacheAndNotifyObservers(
      cache,
      data,
      observer
    ) as RestType;
  };

  const unsubscribe = (observer: Observer) => {
    Object.values(cache).forEach((typename) => {
      Object.values(typename).forEach((id) => {
        id.observers.delete(observer);
      });
    });
  };

  return { query, unsubscribe };
};

export type RestCacheType = ReturnType<typeof RestCache>;
