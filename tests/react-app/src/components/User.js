import { useMutation } from "react-rest-cache";

export const User = () => {
  const [mutate, { data, loading, error }] = useMutation("users", {
    method: "POST",
  });

  const onClick = async () => {
    try {
      await mutate({ body: { name: "User name" } });
    } catch (e) {
      console.error(error);
    }
  };

  if (error) {
    console.error(error);
  }

  return (
    <div>
      <button onClick={() => onClick()}>POST user</button>
      {loading ? <div>Loading…</div> : null}
      <pre>{JSON.stringify(data)}</pre>
    </div>
  );
};
