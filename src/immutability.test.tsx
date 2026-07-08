import { act, render, screen, waitFor } from "@testing-library/react";
import { memo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Provider } from "./context";
import { useQuery } from "./hooks/useQuery";
import { RestCache } from "./restCache";
import { jsonResponse, stubFetch } from "./testUtils";

type Post = { __typename: "Post"; id: string; title: string };
type User = { __typename: "User"; id: string; name: string; posts?: Post[] };

const noop = () => {};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("immutable cache snapshots", () => {
  it("keeps the identity of unchanged entities and replaces changed ones", () => {
    const cache = RestCache({ baseUrl: "" });
    const list = cache.ingest<User[]>(
      [
        { __typename: "User", id: "1", name: "John" },
        { __typename: "User", id: "2", name: "Bob" },
      ],
      noop
    );

    cache.ingest<User>({ __typename: "User", id: "2", name: "Bobby" }, noop);

    const rereadList = cache.materialize(list);
    expect(rereadList[0]).toBe(list[0]);
    expect(rereadList[1]).not.toBe(list[1]);
    expect(rereadList[1]?.name).toBe("Bobby");
  });

  it("rebuilds parents when a nested entity changes", () => {
    const cache = RestCache({ baseUrl: "" });
    cache.ingest<User>(
      {
        __typename: "User",
        id: "1",
        name: "John",
        posts: [{ __typename: "Post", id: "p1", title: "Hello" }],
      },
      noop
    );
    const before = cache.get<User>({ __typename: "User", id: "1" });

    cache.ingest<Post>(
      { __typename: "Post", id: "p1", title: "Hello world" },
      noop
    );

    const after = cache.get<User>({ __typename: "User", id: "1" });
    expect(after).not.toBe(before);
    expect(after?.posts?.[0]?.title).toBe("Hello world");
  });

  it("notifies observers only when the data actually changed", () => {
    const cache = RestCache({ baseUrl: "" });
    const observer = vi.fn();
    const user: User = { __typename: "User", id: "1", name: "John" };

    cache.ingest(user, observer);
    cache.ingest({ ...user }, noop);
    expect(observer).not.toHaveBeenCalled();

    cache.ingest({ ...user, name: "Johnny" }, noop);
    expect(observer).toHaveBeenCalledTimes(1);
  });

  it("evict removes the entity and notifies its observers", () => {
    const cache = RestCache({ baseUrl: "" });
    const observer = vi.fn();
    cache.ingest<User>({ __typename: "User", id: "1", name: "John" }, observer);

    expect(cache.evict({ __typename: "User", id: "1" })).toBe(true);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(cache.get({ __typename: "User", id: "1" })).toBeUndefined();
    expect(cache.evict({ __typename: "User", id: "1" })).toBe(false);
  });
});

describe("React.memo integration", () => {
  const renderCounts: Record<string, number> = {};

  beforeEach(() => {
    Object.keys(renderCounts).forEach((key) => delete renderCounts[key]);
  });

  const UserCard = memo(({ user }: { user: User }) => {
    renderCounts[user.id] = (renderCounts[user.id] ?? 0) + 1;
    return <div>{user.name}</div>;
  });

  const UserList = () => {
    const { data, loading } = useQuery<User[]>("/users");
    if (loading || !data) {
      return <div>loading</div>;
    }
    return (
      <>
        {data.map((user) => (
          <UserCard key={user.id} user={user} />
        ))}
      </>
    );
  };

  it("re-renders memoized components when their entity changes, and only those", async () => {
    stubFetch().mockResolvedValueOnce(
      jsonResponse([
        { __typename: "User", id: "1", name: "John" },
        { __typename: "User", id: "2", name: "Bob" },
      ])
    );
    const restCache = RestCache({ baseUrl: "" });

    render(
      <Provider restCache={restCache}>
        <UserList />
      </Provider>
    );
    await screen.findByText("John");
    expect(renderCounts).toEqual({ "1": 1, "2": 1 });

    act(() => {
      restCache.ingest<User>(
        { __typename: "User", id: "1", name: "Johnny" },
        noop
      );
    });

    await waitFor(() => expect(screen.getByText("Johnny")).toBeDefined());
    // John's card re-rendered with the new snapshot; Bob's kept its identity
    // and was skipped by React.memo.
    expect(renderCounts).toEqual({ "1": 2, "2": 1 });
    expect(screen.getByText("Bob")).toBeDefined();
  });
});
