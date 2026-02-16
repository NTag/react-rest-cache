import { createContext, useContext, type PropsWithChildren } from "react";
import { RestCache, RestCacheType } from "./restCache";

const defaultCache = RestCache({ baseUrl: "/api/" });

const Context = createContext<RestCacheType>(defaultCache);

export const Provider = ({
  restCache,
  children,
}: PropsWithChildren<{ restCache: RestCacheType }>) => (
  <Context.Provider value={restCache}>{children}</Context.Provider>
);

export const useRestCache = () => useContext(Context);
