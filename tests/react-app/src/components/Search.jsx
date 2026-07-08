import { useQuery } from "react-rest-cache";

export const Search = () => {
  const { data, loading, error } = useQuery("search");

  if (loading) {
    return <div>Loading…</div>;
  }

  if (error) {
    console.error(error);
  }

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
};
