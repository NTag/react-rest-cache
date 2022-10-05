# react-rest-cache [![npm version](https://badge.fury.io/js/react-rest-cache.svg)](https://badge.fury.io/js/react-rest-cache)

This library allows to query a REST API using React hooks, and cache the results in a global cache.
All objects in the API should have:

- a `__typename` string field (e.g. `User`, `Post`, etc…)
- an `id` string field (e.g. `id1`, `id2`, etc…)

The library will synchronize all objects and trigger re-renders when the cache is updated.

It aims to provide a similar experience to Apollo client but with REST APIs.

## Usage

```tsx
import { Provider, RestCache } from "react-rest-cache";

const restCache = new RestCache({
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

```tsx
import { useQuery } from "react-rest-cache";

type Post = {
  id: string;
  title: string;
};
type User = {
  id: string;
  name: string;
  posts: Post[];
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

## Roadmap

This project is currently a big WIP. I don’t recommand you use it yet.

Features will be added progressively, while staying as simple as possible. This library won’t offer as much control or features as Apollo provides. If you need more control, you should use Apollo.

What I plan to add:

- `useMutation`: to mutate the API on-demand;
- support for query params;
- basic support for pagination;
- maybe simple cache control;
- a refetch option.

## Why

- Why not using Apollo?  
  I know you can use Apollo client with REST APIs, but I wanted to have a simpler solution, especially I didn't want to have to write graphql queries when querying the API.
- Why not react-query?  
  react-query does not offer this kind of global cache, where objects with the same type and ID are synchronized. It only cache queries by their names, which was not enough for my use case.
