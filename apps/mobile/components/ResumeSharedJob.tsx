import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../lib/auth-context.js';
import { clearPendingJob, readPendingJob } from '../lib/pending-job.js';

/** Wait until role/profile onboarding has finished before resuming a shared job. */
export function ResumeSharedJob(): null {
  const { status, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const group = segments[0];
  useEffect(() => {
    if (status !== 'authed' || !user || !['(usher)', '(client)'].includes(group ?? '')) return;
    let active = true;
    void readPendingJob()
      .then(async (id) => {
        if (!active || !id) return;
        await clearPendingJob();
        if (active) router.push({ pathname: '/jobs/[id]', params: { id } });
      })
      .catch(() => {
        /* Opening the original link remains available if storage fails. */
      });
    return () => {
      active = false;
    };
  }, [status, user?.id, group, router]);
  return null;
}
