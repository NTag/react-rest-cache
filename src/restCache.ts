interface ReactRestCacheOptions {
  baseUrl: string;
}

interface QueryOptions {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  signal: AbortSignal;
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
    data.forEach((item) =>
      addResponseToCacheAndNotifyObservers(cache, item, observer)
    );
  } else {
    if (!("id" in data) || !("__typename" in data)) {
      console.warn("No id or __typename in", data);
      return;
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
    } else {
      Object.assign(cache[typename][id].data, data);
      cache[typename][id].observers.add(observer);
      cache[typename][id].observers.forEach((obs) => obs());
    }

    Object.values(data).forEach((value) => {
      if (typeof value === "object") {
        addResponseToCacheAndNotifyObservers(cache, value, observer);
      }
    });
  }
};

export const RestCache = (options: ReactRestCacheOptions) => {
  const cache: Cache = {};
  const { baseUrl } = options;

  const query = async <RestType>(
    queryOptions: QueryOptions,
    observer: Observer
  ) => {
    const { path, method = "GET", body, signal } = queryOptions;

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const data = (await response.json()) as RestType;

    addResponseToCacheAndNotifyObservers(cache, data, observer);

    return data;
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
