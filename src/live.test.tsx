import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLiveUpdates } from "./hooks/useLiveUpdates";
import { useQuery } from "./hooks/useQuery";
import { connectLiveUpdates, type EventSourceLike } from "./live";
import { RestCache } from "./restCache";
import { createWrapper, jsonResponse, stubFetch } from "./testUtils";

type Job = { __typename: "Job"; id: string; state: string };

class FakeEventSource implements EventSourceLike {
  listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  closed = false;
  constructor(
    public url: string,
    public init: EventSourceInit
  ) {}
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    const event = new MessageEvent(type, {
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

const fakeSource = () => {
  const sources: FakeEventSource[] = [];
  const eventSource = (url: string, init: EventSourceInit) => {
    const source = new FakeEventSource(url, init);
    sources.push(source);
    return source;
  };
  return { sources, eventSource };
};

const JobView = () => {
  const { data } = useQuery<Job>("/jobs/1");
  return <div>{data ? `${data.id}:${data.state}` : "loading"}</div>;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connectLiveUpdates", () => {
  it("opens the stream from the cache's baseUrl, with credentials if asked", () => {
    const cache = RestCache({ baseUrl: "https://api.test" });
    const { sources, eventSource } = fakeSource();

    connectLiveUpdates(cache, "/events", { eventSource, withCredentials: true });
    connectLiveUpdates(cache, "https://live.test/stream", { eventSource });

    expect(sources[0]!.url).toBe("https://api.test/events");
    expect(sources[0]!.init.withCredentials).toBe(true);
    expect(sources[1]!.url).toBe("https://live.test/stream");
    expect(sources[1]!.init.withCredentials).toBe(false);
  });

  it("merges pushed entities into what components show, without a request", async () => {
    const fetchMock = stubFetch().mockResolvedValueOnce(
      jsonResponse({ __typename: "Job", id: "1", state: "waiting" })
    );
    const cache = RestCache({ baseUrl: "" });
    const { sources, eventSource } = fakeSource();
    connectLiveUpdates(cache, "/events", { eventSource });

    render(<JobView />, { wrapper: createWrapper(cache) });
    await screen.findByText("1:waiting");

    act(() => {
      sources[0]!.emit("entities", [{ __typename: "Job", id: "1", state: "running" }]);
    });

    expect(screen.getByText("1:running")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches the queries under the paths it's told to invalidate", async () => {
    const fetchMock = stubFetch()
      .mockResolvedValueOnce(jsonResponse({ __typename: "Job", id: "1", state: "waiting" }))
      .mockResolvedValueOnce(jsonResponse({ __typename: "Job", id: "1", state: "failed" }));
    const cache = RestCache({ baseUrl: "" });
    const { sources, eventSource } = fakeSource();
    connectLiveUpdates(cache, "/events", { eventSource });

    render(<JobView />, { wrapper: createWrapper(cache) });
    await screen.findByText("1:waiting");

    act(() => {
      sources[0]!.emit("invalidate", ["/other"]);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      sources[0]!.emit("invalidate", ["/jobs"]);
    });
    await screen.findByText("1:failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts the entities it's told are gone", () => {
    const cache = RestCache({ baseUrl: "" });
    const { sources, eventSource } = fakeSource();
    connectLiveUpdates(cache, "/events", { eventSource });

    cache.write({ __typename: "Job", id: "1", state: "failed" });
    expect(cache.get<Job>({ __typename: "Job", id: "1" })?.state).toBe("failed");

    sources[0]!.emit("evict", [{ __typename: "Job", id: "1" }]);
    expect(cache.get({ __typename: "Job", id: "1" })).toBeUndefined();
  });

  it("refetches everything when the stream comes back after an error, not on the first open", async () => {
    const fetchMock = stubFetch()
      .mockResolvedValueOnce(jsonResponse({ __typename: "Job", id: "1", state: "waiting" }))
      .mockResolvedValueOnce(jsonResponse({ __typename: "Job", id: "1", state: "done" }));
    const cache = RestCache({ baseUrl: "" });
    const { sources, eventSource } = fakeSource();
    connectLiveUpdates(cache, "/events", { eventSource });

    render(<JobView />, { wrapper: createWrapper(cache) });
    await screen.findByText("1:waiting");

    act(() => {
      sources[0]!.emit("open");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      sources[0]!.emit("error");
      sources[0]!.emit("open");
    });
    await screen.findByText("1:done");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports messages it can't read, and carries on", () => {
    const cache = RestCache({ baseUrl: "" });
    const { sources, eventSource } = fakeSource();
    const onError = vi.fn();
    connectLiveUpdates(cache, "/events", { eventSource, onError });

    sources[0]!.emit("entities", "{not json");
    sources[0]!.emit("invalidate", { path: "/jobs" });
    sources[0]!.emit("entities", { __typename: "Job", id: "2", state: "waiting" });

    expect(onError).toHaveBeenCalledTimes(2);
    expect(cache.get<Job>({ __typename: "Job", id: "2" })?.state).toBe("waiting");
  });

  it("closes the stream when asked", () => {
    const cache = RestCache({ baseUrl: "" });
    const { sources, eventSource } = fakeSource();
    const close = connectLiveUpdates(cache, "/events", { eventSource });

    close();
    expect(sources[0]!.closed).toBe(true);
  });
});

describe("write", () => {
  it("merges entities without subscribing anything to them", () => {
    const cache = RestCache({ baseUrl: "" });
    const observer = vi.fn();
    cache.ingest({ __typename: "Job", id: "1", state: "waiting" }, observer);

    cache.write({ __typename: "Job", id: "1", state: "running" });
    expect(observer).toHaveBeenCalledTimes(1);
    expect(cache.get<Job>({ __typename: "Job", id: "1" })?.state).toBe("running");

    // Writing the same values again changes nothing, so notifies no one.
    cache.write({ __typename: "Job", id: "1", state: "running" });
    expect(observer).toHaveBeenCalledTimes(1);

    // Nothing but the query's observer was subscribed.
    cache.unsubscribe(observer);
    cache.write({ __typename: "Job", id: "1", state: "done" });
    expect(observer).toHaveBeenCalledTimes(1);
  });
});

describe("useLiveUpdates", () => {
  it("connects while mounted and closes on unmount", async () => {
    const cache = RestCache({ baseUrl: "https://api.test" });
    const { sources, eventSource } = fakeSource();

    const { unmount } = renderHook(() => useLiveUpdates("/events", { eventSource }), {
      wrapper: createWrapper(cache),
    });
    await waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0]!.url).toBe("https://api.test/events");

    unmount();
    expect(sources[0]!.closed).toBe(true);
  });

  it("doesn't connect when skipped", () => {
    const cache = RestCache({ baseUrl: "" });
    const { sources, eventSource } = fakeSource();

    renderHook(() => useLiveUpdates("/events", { eventSource, skip: true }), {
      wrapper: createWrapper(cache),
    });
    expect(sources).toHaveLength(0);
  });
});
