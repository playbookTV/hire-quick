import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
const NAV = [
  ['/', 'Overview'],
  ['/verifications', 'Verifications'],
  ['/disputes', 'Disputes'],
  ['/approvals', 'Approvals'],
  ['/bookings', 'Bookings & refunds'],
  ['/ledger', 'Ledger'],
  ['/payment-operations', 'Payment operations'],
  ['/users', 'Users'],
  ['/observability', 'Observability'],
] as const;
export function Layout() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span>HireQuick</span>
          <small>Operations</small>
        </div>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close menu' : 'Menu'}
        </button>
        <nav id="main-nav" aria-label="Main navigation" className={open ? 'nav-open' : ''}>
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {label}
            </NavLink>
          ))}
          <button onClick={logout} className="nav-link logout">
            Log out
          </button>
        </nav>
      </aside>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
