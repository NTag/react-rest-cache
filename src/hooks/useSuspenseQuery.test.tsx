import { act, render, screen } from "@testing-library/react";
import { Component, Suspense, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Provider } from "../context";
import { RestCache, type RestCacheType } from "../restCache";
import { jsonResponse, stubFetch } from "../testUtils";
import { useSuspenseQuery } from "./useSuspenseQuery";

type Obj = { __typename: "Obj"; id: string; name: string };

class ErrorBoundary extends Component<PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div>failed: {this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

let lastRefetch: () => void;

const Name = ({ path }: { path: string }) => {
  const { data, refetch } = useSuspenseQuery<Obj>(path);
  lastRefetch = refetch;
  return <div>{data.name}</div>;
};

const tree = (restCache: RestCacheType, path: string) => (
  <Provider restCache={restCache}>
    <ErrorBoundary>
      <Suspense fallback={<div>loading</div>}>
        <Name path={path} />
      </Suspense>
    </ErrorBoundary>
  </Provider>
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSuspenseQuery", () => {
  it("suspends then renders the data, fetching exactly once", async () => {
    // React discards hook state on suspended initial renders, so a resource
    // held in component state restarts the fetch on every retry: this used
    // to loop forever (thousands of requests) without ever leaving the
    // fallback.
    const fetchMock = stubFetch().mockImplementation(async () =>
      jsonResponse({ __typename: "Obj", id: "1", name: "John" })
    );

    render(tree(RestCache({ baseUrl: "" }), "/user"));

    expect(screen.getByText("loading")).toBeDefined();
    expect(await screen.findByText("John")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one request between components rendering the same query", async () => {
    const fetchMock = stubFetch().mockImplementation(async () =>
      jsonResponse({ __typename: "Obj", id: "1", name: "John" })
    );
    const restCache = RestCache({ baseUrl: "" });

    render(
      <Provider restCache={restCache}>
        <Suspense fallback={<div>loading</div>}>
          <Name path="/user" />
          <Name path="/user" />
        </Suspense>
      </Provider>
    );

    const names = await screen.findAllByText("John");
    expect(names).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates refetch errors to the error boundary", async () => {
    const fetchMock = stubFetch().mockResolvedValueOnce(
      jsonResponse({ __typename: "Obj", id: "1", name: "John" })
    );

    render(tree(RestCache({ baseUrl: "" }), "/user"));
    await screen.findByText("John");

    fetchMock.mockRejectedValueOnce(new Error("boom"));
    act(() => lastRefetch());

    expect(await screen.findByText("failed: boom")).toBeDefined();
  });

  it("subscribes hydrated data to cache updates after a query key change", async () => {
    const fetchMock = stubFetch();
    const restCache = RestCache({ baseUrl: "" });
    restCache.setQueryData("/a", { __typename: "Obj", id: "1", name: "A" });
    restCache.setQueryData("/b", { __typename: "Obj", id: "2", name: "B" });

    const view = render(tree(restCache, "/a"));
    expect(screen.getByText("A")).toBeDefined();

    view.rerender(tree(restCache, "/b"));
    expect(screen.getByText("B")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();

    // An unrelated query returns a newer version of the entity displayed by /b:
    // the component must have subscribed to it and re-render.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ __typename: "Obj", id: "2", name: "B2" })
    );
    await act(async () => {
      await restCache.prefetchQuery("/obj-2-refresh");
    });

    expect(await screen.findByText("B2")).toBeDefined();
  });
});
