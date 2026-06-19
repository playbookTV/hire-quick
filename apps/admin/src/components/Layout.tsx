import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const NAV = [
  ['/', 'Dashboard'],
  ['/verifications', 'Verifications'],
  ['/disputes', 'Disputes'],
  ['/approvals', 'Approvals'],
  ['/ledger', 'Ledger'],
  ['/users', 'Users'],
] as const;

export function Layout() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      <aside className="flex w-56 flex-col bg-slate-900 text-slate-100">
        <div className="px-5 py-4 text-lg font-semibold">
          HireQuick <span className="text-sm text-slate-400">admin</span>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-700' : 'hover:bg-slate-800'}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          className="m-3 rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
        >
          Log out
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
