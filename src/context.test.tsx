import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HydrationBoundary, Provider } from "./context";
import { useQuery } from "./hooks/useQuery";
import { RestCache } from "./restCache";
import { jsonResponse, stubFetch } from "./testUtils";

type User = { __typename: "User"; id: string; name: string };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRestCache", () => {
  it("throws a clear error when no Provider is present", () => {
    stubFetch();
    expect(() => renderHook(() => useQuery<User[]>("/users"))).toThrow(
      "react-rest-cache: no RestCache found"
    );
  });
});

describe("HydrationBoundary", () => {
  it("hydrates the contextual cache so queries render with data immediately", async () => {
    // Server side: a per-request cache is populated and dehydrated.
    const serverCache = RestCache({ baseUrl: "" });
    serverCache.setQueryData("/users", [
      { __typename: "User", id: "1", name: "John" },
    ]);
    const state = serverCache.dehydrate();

    // Client side: the boundary hydrates the cache from context.
    const fetchMock = stubFetch().mockResolvedValue(
      jsonResponse([{ __typename: "User", id: "1", name: "John" }])
    );
    const clientCache = RestCache({ baseUrl: "" });

    const List = () => {
      const { data, loading } = useQuery<User[]>("/users");
      if (loading || !data) {
        return <div>loading</div>;
      }
      return <div>{data.map((user) => user.name).join(",")}</div>;
    };

    render(
      <Provider restCache={clientCache}>
        <HydrationBoundary state={state}>
          <List />
        </HydrationBoundary>
      </Provider>
    );

    // Data is available on the very first render — no loading flash —
    // then a background refetch revalidates it.
    expect(screen.getByText("John")).toBeDefined();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
