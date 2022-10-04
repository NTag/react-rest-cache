import React, { PropsWithChildren } from "react";
import { RestCache, RestCacheType } from "./restCache";

const defaultCache = RestCache({ baseUrl: "/api/" });

const Context = React.createContext<RestCacheType>(defaultCache);

export const Provider = ({
  restCache,
  children,
}: PropsWithChildren<{ restCache: RestCacheType }>) => (
  <Context.Provider value={restCache}>{children}</Context.Provider>
);

export const useRestCache = () => React.useContext(Context);
