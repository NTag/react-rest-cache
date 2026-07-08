import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchError } from "../error";
import { RestCache } from "../restCache";
import { createWrapper, jsonResponse, stubFetch } from "../testUtils";
import { useQuery } from "./useQuery";

type Item = { __typename: "Item"; id: string; label: string };

const item = (id: string, label: string): Item => ({ __typename: "Item", id, label });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useQuery", () => {
  it("fetches and returns data", async () => {
    const fetchMock = stubFetch().mockResolvedValueOnce(jsonResponse([item("1", "one")]));
    const wrapper = createWrapper(RestCache({ baseUrl: "" }));

    const { result } = renderHook(() => useQuery<Item[]>("/items"), { wrapper });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([item("1", "one")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accumulates pages across successive fetchMore calls", async () => {
    stubFetch()
      .mockResolvedValueOnce(jsonResponse([item("1", "one")]))
      .mockResolvedValueOnce(jsonResponse([item("2", "two")]))
      .mockResolvedValueOnce(jsonResponse([item("3", "three")]));
    const wrapper = createWrapper(RestCache({ baseUrl: "" }));

    const { result } = renderHook(() => useQuery<Item[]>("/items"), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const merge = (prev: Item[], next: Item[]) => [...prev, ...next];

    act(() => result.current.fetchMore(merge, { params: { page: "2" } }));
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.error).toBeUndefined();
    expect(result.current.data?.map((i) => i.id)).toEqual(["1", "2"]);

    act(() => result.current.fetchMore(merge, { params: { page: "3" } }));
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.data?.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("exposes a FetchError with status and body on HTTP errors", async () => {
    stubFetch().mockResolvedValueOnce(jsonResponse({ message: "nope" }, 500));
    const wrapper = createWrapper(RestCache({ baseUrl: "" }));

    const { result } = renderHook(() => useQuery<Item[]>("/items"), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    const error = result.current.error as FetchError;
    expect(error).toBeInstanceOf(FetchError);
    expect(error.status).toBe(500);
    expect(error.data).toEqual({ message: "nope" });
  });
});
