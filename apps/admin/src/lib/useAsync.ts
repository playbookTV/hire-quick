import { useCallback, useEffect, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>): {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // fn is recreated each render; we intentionally run on mount + manual reload.
  const run = useCallback(() => {
    setLoading(true);
    fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(run, [run]);
  return { data, error, loading, reload: run };
}
