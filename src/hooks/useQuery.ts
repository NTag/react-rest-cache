import { useCallback, useEffect, useState } from "react";

import { useRestCache } from "../context";

export const useQuery = <RestType>(path: string) => {
  const { query, unsubscribe } = useRestCache();
  const [, setIncrement] = useState(0); // Only way to force a re-render
  const [data, setData] = useState<RestType | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const rerender = useCallback(
    () => setIncrement((i) => i + 1),
    [setIncrement]
  );

  useEffect(() => {
    setLoading(true);

    const abortController = new AbortController();
    const signal = abortController.signal;

    query<RestType>({ path, signal }, rerender)
      .then((newData) => {
        setData(newData);
        setLoading(false);
      })
      .catch((error) => {
        if (signal.aborted) {
          // If the request has been cancelled,
          // it’ll raise an error, that we don’t
          // want to display.
          return;
        }

        setError(error);
        setLoading(false);
      });

    return () => {
      abortController.abort();
      unsubscribe(rerender);
    };
  }, [path]);

  return { data, error, loading };
};
