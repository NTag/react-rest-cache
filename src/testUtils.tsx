import type { PropsWithChildren } from "react";
import { vi } from "vitest";

import { Provider } from "./context";
import type { RestCacheType } from "./restCache";

export const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const stubFetch = () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

export const createWrapper =
  (restCache: RestCacheType) =>
  ({ children }: PropsWithChildren) => (
    <Provider restCache={restCache}>{children}</Provider>
  );
