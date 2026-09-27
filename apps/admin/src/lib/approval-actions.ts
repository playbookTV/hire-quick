import { AdminApiError } from './session';

/** Prevent double clicks and require fresh server evidence after an unknown outcome. */
export function createApprovalActions(
  decide: (id: string, decision: 'approve' | 'reject') => Promise<unknown>,
  reload: () => Promise<boolean>,
) {
  const busy = new Set<string>();
  const blocked = new Set<string>();
  let refreshing = false;
  return {
    disabled: (id: string) => refreshing || busy.has(id) || blocked.has(id),
    async submit(id: string, decision: 'approve' | 'reject'): Promise<void> {
      if (refreshing || busy.has(id) || blocked.has(id)) return;
      busy.add(id);
      try {
        await decide(id, decision);
        // Even a confirmed response requires fresh rows before another click.
        blocked.add(id);
        if (await reload()) blocked.delete(id);
      } catch (error) {
        if (error instanceof AdminApiError && error.uncertain) blocked.add(id);
        throw error;
      } finally { busy.delete(id); }
    },
    async reload(this: void): Promise<boolean> {
      if (refreshing || busy.size) return false;
      refreshing = true;
      try {
        const fresh = await reload();
        if (fresh) blocked.clear();
        return fresh;
      }
      finally { refreshing = false; }
    },
  };
}
