import { useEffect, useRef, type ReactNode } from 'react';

export function Page({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page">
      <header className="page-heading">
        <h1>{title}</h1>
        {actions}
      </header>
      {children}
    </div>
  );
}
export function Btn({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`btn btn-${variant}`}>
      {children}
    </button>
  );
}
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Records table, scroll horizontally for more columns"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function State({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  if (error)
    return (
      <div className="notice notice-error" role="alert">
        <p>{error}</p>
        {onRetry && (
          <Btn variant="ghost" disabled={loading} onClick={onRetry}>
            {loading ? 'Retrying…' : 'Try again'}
          </Btn>
        )}
      </div>
    );
  if (loading)
    return (
      <p className="notice" role="status">
        Loading current records…
      </p>
    );
  return null;
}
export function EmptyRow({ columns, children }: { columns: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={columns} className="empty-row">
        {children}
      </td>
    </tr>
  );
}
export function Pagination({
  hasNext,
  hasPrevious,
  loading,
  onNext,
  onPrevious,
}: {
  hasNext: boolean;
  hasPrevious: boolean;
  loading: boolean;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <nav className="pagination" aria-label="Record pages">
      <Btn variant="ghost" disabled={loading || !hasPrevious} onClick={onPrevious}>
        Newer records
      </Btn>
      <Btn variant="ghost" disabled={loading || !hasNext} onClick={onNext}>
        Older records
      </Btn>
    </nav>
  );
}

export function ReviewPanel({
  children,
  'aria-label': label,
}: {
  children: ReactNode;
  'aria-label': string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <section ref={ref} tabIndex={-1} className="review-panel" aria-label={label}>
      {children}
    </section>
  );
}
