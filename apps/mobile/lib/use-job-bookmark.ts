import { useRef, useState } from 'react';
import { useSaveJob, useUnsaveJob } from './hooks.js';
import { useToast } from './toast.js';

/** Keep each bookmark locked until the mutation and saved-list refresh finish. */
export function useJobBookmark() {
  const save = useSaveJob();
  const unsave = useUnsaveJob();
  const toast = useToast();
  const locks = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const toggle = async (id: string, saved: boolean): Promise<void> => {
    if (locks.current.has(id)) return;
    locks.current.add(id);
    setPending(new Set(locks.current));
    try {
      await (saved ? unsave : save).mutateAsync(id);
      toast.success(
        saved ? 'Removed from your saved jobs.' : 'You can find it in Saved.',
        saved ? 'Job removed' : 'Job saved',
      );
    } catch {
      toast.error(
        'Check your connection and tap the bookmark to try again.',
        saved ? 'Couldn’t remove job' : 'Couldn’t save job',
      );
    } finally {
      locks.current.delete(id);
      setPending(new Set(locks.current));
    }
  };
  return { pending, toggle };
}
