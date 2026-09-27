import { useState } from 'react';
import { api } from './api';
import { useAsync } from './useAsync';
export function useRecords<T>(path: string, filters: string) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const url = `${path}?paged=true&limit=50&${filters}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const query = useAsync<{ items: T[]; nextCursor: string | null }>(() => api(url), url);
  return {
    ...query,
    hasPrevious: cursors.length > 0,
    previous: () => setCursors((c) => c.slice(0, -1)),
    next: () => {
      const next = query.data?.nextCursor;
      if (next) setCursors((c) => [...c, next]);
    },
  };
}
