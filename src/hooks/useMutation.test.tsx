import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchError } from "../error";
import { RestCache } from "../restCache";
import { createWrapper, jsonResponse, stubFetch } from "../testUtils";
import { useMutation } from "./useMutation";
import { useQuery } from "./useQuery";

type User = { __typename: "User"; id: string; name: string };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMutation", () => {
  it("updates cached objects and re-renders components displaying them", async () => {
    const fetchMock = stubFetch().mockResolvedValueOnce(
      jsonResponse([{ __typename: "User", id: "1", name: "John" }])
    );
    const restCache = RestCache({ baseUrl: "" });
    const wrapper = createWrapper(restCache);

    const query = renderHook(() => useQuery<User[]>("/users"), { wrapper });
    await waitFor(() => expect(query.result.current.loading).toBe(false));
    expect(query.result.current.data?.[0]?.name).toBe("John");

    const mutation = renderHook(
      () => useMutation<User>("/users/1", { method: "PUT" }),
      { wrapper }
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ __typename: "User", id: "1", name: "Jane" })
    );

    await act(async () => {
      await mutation.result.current[0]({ body: { name: "Jane" } });
    });

    await waitFor(() => expect(query.result.current.data?.[0]?.name).toBe("Jane"));
    expect(mutation.result.current[1].data?.name).toBe("Jane");
  });

  it("refetches queries listed in invalidateQueries after a successful mutation", async () => {
    const fetchMock = stubFetch()
      .mockResolvedValueOnce(
        jsonResponse([{ __typename: "User", id: "1", name: "John" }])
      )
      .mockResolvedValueOnce(
        jsonResponse({ __typename: "User", id: "2", name: "Jane" })
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { __typename: "User", id: "1", name: "John" },
          { __typename: "User", id: "2", name: "Jane" },
        ])
      );
    const restCache = RestCache({ baseUrl: "" });
    const wrapper = createWrapper(restCache);

    const query = renderHook(() => useQuery<User[]>("/users"), { wrapper });
    await waitFor(() => expect(query.result.current.loading).toBe(false));
    expect(query.result.current.data).toHaveLength(1);

    const mutation = renderHook(
      () =>
        useMutation<User>("/users", {
          method: "POST",
          invalidateQueries: ["/users"],
        }),
      { wrapper }
    );

    await act(async () => {
      await mutation.result.current[0]({ body: { name: "Jane" } });
    });

    await waitFor(() => expect(query.result.current.data).toHaveLength(2));
    expect(query.result.current.data?.[1]?.name).toBe("Jane");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sets the error state and rejects when the API returns an error", async () => {
    stubFetch().mockResolvedValueOnce(jsonResponse({ message: "invalid" }, 422));
    const wrapper = createWrapper(RestCache({ baseUrl: "" }));

    const { result } = renderHook(
      () => useMutation<User>("/users", { method: "POST" }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current[0]({ body: {} })).rejects.toBeInstanceOf(FetchError);
    });

    const error = result.current[1].error as FetchError;
    expect(error.status).toBe(422);
    expect(result.current[1].loading).toBe(false);
  });

  it("runs every call to the end, even several at once", async () => {
    let answerFirst: (response: Response) => void = () => {};
    const fetchMock = stubFetch()
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce(jsonResponse({ __typename: "User", id: "2", name: "Two" }));
    const wrapper = createWrapper(RestCache({ baseUrl: "" }));

    const { result } = renderHook(
      () => useMutation<User>("/users/", { method: "DELETE" }),
      { wrapper }
    );

    let first: Promise<User> = Promise.resolve({} as User);
    act(() => {
      first = result.current[0]({ subPath: "1/" });
    });
    await act(async () => {
      await expect(result.current[0]({ subPath: "2/" })).resolves.toMatchObject({ id: "2" });
    });
    // The first one is still in flight.
    expect(result.current[1].loading).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(false);

    await act(async () => {
      answerFirst(jsonResponse({ __typename: "User", id: "1", name: "One" }));
      await expect(first).resolves.toMatchObject({ id: "1" });
    });
    expect(result.current[1].loading).toBe(false);
  });

  it("still updates the cache when answered after unmount, without touching its state", async () => {
    let answer: (response: Response) => void = () => {};
    stubFetch()
      .mockResolvedValueOnce(jsonResponse([{ __typename: "User", id: "1", name: "John" }]))
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const errors = vi.spyOn(console, "error");
    const wrapper = createWrapper(RestCache({ baseUrl: "" }));

    const query = renderHook(() => useQuery<User[]>("/users"), { wrapper });
    await waitFor(() => expect(query.result.current.loading).toBe(false));
    const mutation = renderHook(
      () => useMutation<User>("/users/1", { method: "PUT" }),
      { wrapper }
    );

    let sent: Promise<User> = Promise.resolve({} as User);
    act(() => {
      sent = mutation.result.current[0]({ body: { name: "Jane" } });
    });
    mutation.unmount();
    await act(async () => {
      answer(jsonResponse({ __typename: "User", id: "1", name: "Jane" }));
      await expect(sent).resolves.toMatchObject({ name: "Jane" });
    });

    expect(query.result.current.data?.[0]?.name).toBe("Jane");
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
