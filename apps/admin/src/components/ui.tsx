import type { ReactNode } from 'react';

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'default',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'ghost';
  disabled?: boolean;
}) {
  const c =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : variant === 'ghost'
        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
        : 'bg-slate-900 hover:bg-slate-800 text-white';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${c}`}
    >
      {children}
    </button>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{children}</span>;
}

export function State({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return null;
}
