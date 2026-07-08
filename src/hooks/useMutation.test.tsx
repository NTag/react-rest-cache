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
});
