import { useState } from 'react';
import { naira, shortDate } from '../lib/api';
import { useRecords } from '../lib/useRecords';
import { Page, State, Table, Badge, Btn, EmptyRow, Pagination } from '../components/ui';
interface Entry {
  id: string;
  entryType: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
  booking: { id: string; event: { title: string } } | null;
}
export function Ledger() {
  const [booking, setBooking] = useState('');
  const [filters, setFilters] = useState('');
  return (
    <Page title="Escrow ledger">
      <p className="muted mb-5">
        Every entry is a permanent record. Amounts below include their credit or debit sign.
      </p>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(
            booking.trim() ? new URLSearchParams({ bookingId: booking.trim() }).toString() : '',
          );
        }}
      >
        <label>
          Booking ID
          <input
            value={booking}
            onChange={(e) => setBooking(e.target.value)}
            placeholder="All bookings"
          />
        </label>
        <Btn type="submit">Filter ledger</Btn>
      </form>
      <LedgerRecords key={filters} filters={filters} />
    </Page>
  );
}
function LedgerRecords({ filters }: { filters: string }) {
  const q = useRecords<Entry>('/api/admin/ledger', filters);
  return (
    <>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      <Table head={['When', 'Type', 'Amount', 'Balance after', 'Booking']}>
        {q.data?.items.map((e) => (
          <tr key={e.id}>
            <td>{shortDate(e.createdAt)}</td>
            <td>
              <Badge>{e.entryType}</Badge>
            </td>
            <td className="whitespace-nowrap">
              {e.amount > 0 ? '+' : ''}
              {naira(e.amount)}
            </td>
            <td className="whitespace-nowrap">{naira(e.balanceAfter)}</td>
            <td>
              {e.booking?.event.title ?? 'Platform'}
              {e.booking && <small className="block muted">{e.booking.id}</small>}
            </td>
          </tr>
        ))}
        {q.data?.items.length === 0 && (
          <EmptyRow columns={5}>No ledger entries match this booking.</EmptyRow>
        )}
      </Table>
      <Pagination
        hasNext={!!q.data?.nextCursor && !q.error}
        hasPrevious={q.hasPrevious}
        loading={q.loading}
        onNext={q.next}
        onPrevious={q.previous}
      />
    </>
  );
}
