# react-rest-cache [![npm version](https://badge.fury.io/js/react-rest-cache.svg)](https://badge.fury.io/js/react-rest-cache)

This library allows to query a REST API using React hooks, and cache the results in a global cache.
All objects in the API should have:

- a `__typename` string field (e.g. `User`, `Post`, etc…)
- an `id` string field (e.g. `id1`, `id2`, etc…)

The library will synchronize all objects and trigger re-renders when the cache is updated.

It aims to provide a similar experience to Apollo client but with REST APIs.

**Requirements:** React 18 or 19.

## Setup

```tsx
import { Provider, RestCache } from "react-rest-cache";

const restCache = RestCache({
  baseUrl: "https://api.example.com",
});

const App = () => {
  return (
    <Provider restCache={restCache}>
      <MyComponent />
    </Provider>
  );
};
```

## `useQuery`

```tsx
import { useQuery } from "react-rest-cache";

type User = {
  id: string;
  name: string;
  posts: Post[];
};
type Post = {
  id: string;
  title: string;
};

const MyComponent = () => {
  const { data, error, loading } = useQuery<User[]>("/users");
  // The /users endpoint will return something like:
  // [
  //   {
  //     __typename: "User",
  //     id: "id1",
  //     name: "John",
  //     posts: [
  //       {
  //         __typename: "Post",
  //         id: "id2",
  //         title: "Hello world",
  //       },
  //     ],
  //   },
  //   {
  //     __typename: "User",
  //     id: "id2",
  //     name: "Jane",
  //     posts: []
  //   },
  // ]

  if (loading) {
    return <div>Loading…</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      {data.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
};
```

### Options

```tsx
const { data, error, loading, refetch, fetchMore, loadingMore } = useQuery<T>(path, {
  params: { page: "1" },       // URL query parameters
  method: "GET",               // HTTP method (default: "GET")
  body: { ... },               // Request body
  skip: false,                 // Skip fetching (default: false)
  prefetchFromCache: {         // Read from cache while fetching
    singleObject: { __typename: "User", id: "id1" },
  },
});
```

## `useSuspenseQuery`

A Suspense-enabled version of `useQuery`. Instead of returning `loading` and `error`, it integrates with React's `<Suspense>` and Error Boundaries.

- `data` is always `T` (never `undefined`) — the component only renders after data loads.
- Loading state is handled by the nearest `<Suspense>` fallback.
- Errors are caught by the nearest Error Boundary.

```tsx
import { Suspense } from "react";
import { useSuspenseQuery } from "react-rest-cache";

const App = () => {
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <Suspense fallback={<div>Loading…</div>}>
        <UserList />
      </Suspense>
    </ErrorBoundary>
  );
};

const UserList = () => {
  const { data } = useSuspenseQuery<User[]>("/users");

  // No need to check for loading or error —
  // this component only renders when data is available.
  return (
    <div>
      {data.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
};
```

### Options

```tsx
const { data, refetch, fetchMore, loadingMore } = useSuspenseQuery<T>(path, {
  params: { page: "1" },       // URL query parameters
  method: "GET",               // HTTP method (default: "GET")
  body: { ... },               // Request body
});
```

## `useMutation`

```tsx
import { useMutation } from "react-rest-cache";

const MyButton = () => {
  const [mutate, { data, error, loading }] = useMutation<User>(`/users/id2`, {
    method: "PUT",
  });

  return (
    <div>
      {error ? <div>Error: {error.message}</div> : null}
      {loading ? <div>Loading…</div> : null}
      <button onClick={() => mutate({ body: { name: "John" } })}>Update</button>
    </div>
  );
};
```

When a mutation returns an object with the same `__typename` and `id` as a cached object, the cache is updated and all components displaying that object re-render automatically.

## Why

- Why not using Apollo?
  I know you can use Apollo client with REST APIs, but I wanted to have a simpler solution, especially I didn't want to have to write graphql queries when querying the API.
- Why not react-query?
  react-query does not offer this kind of global cache, where objects with the same type and ID are synchronized. It only caches queries by their names, which was not enough for my use case.
