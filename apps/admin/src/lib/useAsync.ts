import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>): {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  reloadFresh: () => Promise<boolean>;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  // fn is recreated each render; we intentionally run on mount + manual reload.
  const run = useCallback(() => {
    const current = ++generation.current;
    setLoading(true);
    return fn()
      .then((d) => {
        if (generation.current !== current) return false;
        setData(d);
        setError(null);
        return true;
      })
      .catch((e: unknown) => {
        if (generation.current === current) setError(e instanceof Error ? e.message : 'error');
        return false;
      })
      .finally(() => { if (generation.current === current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void run(); return () => { generation.current += 1; }; }, [run]);
  return { data, error, loading, reload: () => { void run(); }, reloadFresh: run };
}
