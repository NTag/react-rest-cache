import { useRef } from "react";
import { useQuery } from "react-rest-cache";

export const Trips = () => {
  const { data, loading, error } = useQuery("trips");
  const renderCount = useRef(0);
  renderCount.current += 1;

  if (loading) {
    return <div>Loading…</div>;
  }

  if (error) {
    console.error(error);
  }

  return (
    <div>
      (render {renderCount.current})<pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
};
