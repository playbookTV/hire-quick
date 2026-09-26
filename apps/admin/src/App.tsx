import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Verifications } from './pages/Verifications';
import { Disputes } from './pages/Disputes';
import { Approvals } from './pages/Approvals';
import { PaymentOperations } from './pages/PaymentOperations';
import { Ledger } from './pages/Ledger';
import { Bookings } from './pages/Bookings';
import { Users } from './pages/Users';
import { Observability } from './pages/Observability';

export function App() {
  const { authed } = useAuth();
  if (!authed) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/verifications" element={<Verifications />} />
        <Route path="/disputes" element={<Disputes />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/payment-operations" element={<PaymentOperations />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/users" element={<Users />} />
        <Route path="/observability" element={<Observability />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
