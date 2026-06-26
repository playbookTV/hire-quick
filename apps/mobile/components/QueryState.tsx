/**
 * QueryState — one place for the loading → error → empty → content ladder that
 * screens previously hand-rolled (and often skipped the error rung, so a failed
 * fetch rendered as "nothing here" or an infinite spinner — C4/C6/C13).
 *
 * Usage:
 *   <QueryState query={events} isEmpty={(e) => e.length === 0} empty={<EmptyState … />}>
 *     {(data) => <List data={data} />}
 *   </QueryState>
 */
import type { ReactNode } from 'react';
import { Box } from '../theme/restyle.js';
import { Loading } from './Loading.js';
import { EmptyState } from './EmptyState.js';

interface QueryLike<T> {
  isLoading: boolean;
  isError: boolean;
  data: T | undefined;
  refetch: () => unknown;
}

interface QueryStateProps<T> {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  /** Custom loading slot (e.g. skeleton rows). Defaults to a centred spinner. */
  loading?: ReactNode;
  /** Predicate for the empty state, e.g. `(d) => d.length === 0`. */
  isEmpty?: (data: T) => boolean;
  /** Node shown when `isEmpty(data)` is true. */
  empty?: ReactNode;
  errorTitle?: string;
  errorSubtitle?: string;
}

export function QueryState<T>({
  query,
  children,
  loading,
  isEmpty,
  empty,
  errorTitle = 'Something went wrong',
  errorSubtitle = 'Check your connection and try again.',
}: QueryStateProps<T>): React.JSX.Element {
  if (query.isLoading) return <>{loading ?? <Loading />}</>;
  if (query.isError || query.data === undefined) {
    return (
      <Box style={{ paddingTop: 40 }}>
        <EmptyState
          icon="alert-circle"
          title={errorTitle}
          subtitle={errorSubtitle}
          actionLabel="Try again"
          onAction={() => {
            void query.refetch();
          }}
        />
      </Box>
    );
  }
  if (isEmpty?.(query.data) && empty !== undefined) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
