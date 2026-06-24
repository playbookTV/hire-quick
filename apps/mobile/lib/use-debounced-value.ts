/**
 * Returns `value` after it has stopped changing for `delayMs`. Lets a controlled
 * TextInput stay instant while deferring the work it drives — e.g. the discover
 * search defers its `/api/ushers` query so we fire one request per pause, not
 * one per keystroke.
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
