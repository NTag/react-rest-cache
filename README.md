# react-rest-cache

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

type User = {
  id: string;
  name: string;
};

const MyComponent = () => {
  const { data, error, loading } = useQuery<User[]>("/users");

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
