import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import type { DehydratedState, RestCacheType } from "./restCache";

const Context = createContext<RestCacheType | null>(null);

export const Provider = ({
  restCache,
  children,
}: PropsWithChildren<{ restCache: RestCacheType }>) => (
  <Context.Provider value={restCache}>{children}</Context.Provider>
);

export const useRestCache = (): RestCacheType => {
  const restCache = useContext(Context);
  if (!restCache) {
    throw new Error(
      "react-rest-cache: no RestCache found. Wrap your app in <Provider restCache={RestCache({ baseUrl })}>."
    );
  }
  return restCache;
};

/**
 * Hydrates the RestCache from context with a dehydrated state, during render
 * (not in an effect) so children can read the data in the same pass — on the
 * server and on the first client render.
 */
export const HydrationBoundary = ({
  state,
  children,
}: PropsWithChildren<{ state?: DehydratedState }>) => {
  const restCache = useRestCache();
  useMemo(() => {
    if (state) {
      restCache.hydrate(state);
    }
  }, [restCache, state]);
  return <>{children}</>;
};
