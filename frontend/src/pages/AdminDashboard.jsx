import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import {
  addDays,
  formatDateTime,
  formatDeposit,
  formatPickup,
  formatPrice,
  formatTime,
  todayInZone,
} from '../utils/format';

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

// What each stat card opens in the list below it ('day' is the single-day list with the date picker)
const VIEW_TITLES = {
  pending: 'Awaiting confirmation',
  upcoming: 'Upcoming appointments',
  completed: 'Completed appointments',
  clients: 'Clients',
};

export default function AdminDashboard() {
  const { salon } = useApp();
  const [date, setDate] = useState(todayInZone(salon.timezone));
  const [view, setView] = useState('day');
  const [appointments, setAppointments] = useState([]);
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listRequest =
        view === 'clients'
          ? api.get('/admin/clients')
          : api.get(view === 'day' ? `/admin/appointments?date=${date}` : `/admin/appointments?view=${view}`);
      const [list, s] = await Promise.all([listRequest, api.get('/admin/stats')]);
      if (view === 'clients') setClients(list.clients);
      else setAppointments(list.appointments);
      setStats(s);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date, view]);

  // A stat card was clicked: show its list and bring it into view
  function openView(next) {
    setView(next);
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function showDay(next) {
    setView('day');
    setDate(next);
  }

  useEffect(() => {
    load();
  }, [load]);

  async function depositAction(id, action) {
    setBusyId(id);
    setError('');
    try {
      await api.patch(`/admin/appointments/${id}/deposit`, { action });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(id, status) {
    setBusyId(id);
    setError('');
    setNotice(null);
    try {
      const { booking, whatsapp } = await api.patch(`/admin/appointments/${id}/status`, { status });
      if (whatsapp?.sent) {
        setNotice({ type: 'success', text: `Booking #${booking.id} details sent to ${booking.client_name} on WhatsApp.` });
      } else if (whatsapp?.link) {
        setNotice({
          type: 'warning',
          text: `Booking #${booking.id} confirmed. Send ${booking.client_name} the details on WhatsApp:`,
          link: whatsapp.link,
        });
      } else if (whatsapp?.reason) {
        setNotice({ type: 'warning', text: `Booking #${booking.id} confirmed, but no WhatsApp was sent: ${whatsapp.reason}` });
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1>Dashboard</h1>

      {stats && (
        <div className="stats">
          {[
            ['today', 'Today', stats.todayCount],
            ['pending', 'Awaiting confirmation', stats.pendingCount],
            ['upcoming', 'Upcoming', stats.upcomingCount],
            ['clients', 'Clients', stats.clientCount],
            ['completed', 'Revenue (completed)', formatPrice(stats.revenueCents, salon.currency)],
          ].map(([key, label, value]) => {
            const today = todayInZone(salon.timezone);
            const active = key === 'today' ? view === 'day' && date === today : view === key;
            return (
              <button
                type="button"
                key={key}
                className={`card stat stat-link ${active ? 'stat-active' : ''}`}
                aria-pressed={active}
                onClick={() => {
                  if (key === 'today') setDate(today);
                  openView(key === 'today' ? 'day' : key);
                }}
              >
                <span className="muted">{label}</span>
                <strong>{value}</strong>
              </button>
            );
          })}
        </div>
      )}

      <div className="day-nav" ref={listRef}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => showDay(addDays(date, -1))}>
          ← Prev
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && showDay(e.target.value)} />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => showDay(addDays(date, 1))}>
          Next →
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => showDay(todayInZone(salon.timezone))}>
          Today
        </button>
      </div>

      {view !== 'day' && (
        <h2 className="list-title">
          {VIEW_TITLES[view]}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView('day')}>
            Back to day view
          </button>
        </h2>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className={`alert alert-${notice.type} alert-row`}>
          <span>{notice.text}</span>
          {notice.link && (
            <a className="btn btn-sm btn-whatsapp" href={notice.link} target="_blank" rel="noreferrer">
              Send on WhatsApp
            </a>
          )}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : view === 'clients' ? (
        clients.length === 0 ? (
          <p className="muted">No clients yet.</p>
        ) : (
          <div className="table-wrap card">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Bookings</th>
                  <th>Last booking</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.email}>
                    <td>
                      {c.name}
                      {!c.has_account && <span className="muted small"> (guest)</span>}
                    </td>
                    <td className="small">
                      <a href={`mailto:${c.email}`}>{c.email}</a>
                      {c.phone && <div className="muted">{c.phone}</div>}
                    </td>
                    <td>{c.booking_count}</td>
                    <td className="small">
                      {c.last_booking ? formatDateTime(c.last_booking, salon.timezone) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : appointments.length === 0 ? (
        <p className="muted">{view === 'day' ? 'No appointments on this day.' : 'Nothing here right now.'}</p>
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Client</th>
                <th>Service</th>
                <th>Notes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} className={a.status === 'cancelled' ? 'row-muted' : ''}>
                  <td>
                    {view === 'day'
                      ? `${formatTime(a.start_time, salon.timezone)} – ${formatTime(a.end_time, salon.timezone)}`
                      : formatDateTime(a.start_time, salon.timezone)}
                  </td>
                  <td>
                    <div>
                      {a.client_name}
                      {!a.client_id && <span className="muted small"> (guest)</span>}
                    </div>
                    <div className="muted small">
                      <a href={`mailto:${a.client_email}`}>{a.client_email}</a>
                      {a.client_phone && ` · ${a.client_phone}`}
                    </div>
                  </td>
                  <td>
                    {a.service_name}
                    <div className="muted small">{formatPrice(a.price_cents, salon.currency)}</div>
                    {a.deposit_cents && (
                      <div className={`small ${['refund_failed', 'refund_due'].includes(a.deposit_status) ? 'text-danger' : ''}`}>
                        {formatDeposit(a, salon.currency)}
                        {a.deposit_status === 'refund_failed' && ' (refund it in Paystack)'}
                      </div>
                    )}
                    {a.deposit_status === 'unpaid' && a.payment_method === 'transfer' && a.status !== 'cancelled' && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busyId === a.id}
                        onClick={() => depositAction(a.id, 'received')}
                      >
                        Deposit received
                      </button>
                    )}
                    {['refund_due', 'refund_failed'].includes(a.deposit_status) && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busyId === a.id}
                        onClick={() => {
                          if (window.confirm(`Have you sent ${a.client_name} their refund?`)) {
                            depositAction(a.id, 'refunded');
                          }
                        }}
                      >
                        Mark refunded
                      </button>
                    )}
                    {a.pickup_vehicle_name && (
                      <div className="small">
                        {formatPickup(a)} · {formatPrice(a.pickup_price_cents, salon.currency)}
                        <div className="muted">From: {a.pickup_address}</div>
                      </div>
                    )}
                  </td>
                  <td className="small">{a.notes || '—'}</td>
                  <td>
                    <div className="actions">
                      <select
                        value={a.status}
                        disabled={busyId === a.id}
                        onChange={(e) => changeStatus(a.id, e.target.value)}
                        className={`badge-select badge-${a.status}`}
                        aria-label={`Status of booking #${a.id}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      {a.whatsapp_link && (
                        <a
                          className="btn btn-sm btn-whatsapp"
                          href={a.whatsapp_link}
                          target="_blank"
                          rel="noreferrer"
                          title={`Send booking details to ${a.client_name} on WhatsApp`}
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
