import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { addDays, formatDeposit, formatPickup, formatPrice, formatTime, todayInZone } from '../utils/format';

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

export default function AdminDashboard() {
  const { salon } = useApp();
  const [date, setDate] = useState(todayInZone(salon.timezone));
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appts, s] = await Promise.all([api.get(`/admin/appointments?date=${date}`), api.get('/admin/stats')]);
      setAppointments(appts.appointments);
      setStats(s);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

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
          <div className="card stat">
            <span className="muted">Today</span>
            <strong>{stats.todayCount}</strong>
          </div>
          <div className="card stat">
            <span className="muted">Awaiting confirmation</span>
            <strong>{stats.pendingCount}</strong>
          </div>
          <div className="card stat">
            <span className="muted">Upcoming</span>
            <strong>{stats.upcomingCount}</strong>
          </div>
          <div className="card stat">
            <span className="muted">Clients</span>
            <strong>{stats.clientCount}</strong>
          </div>
          <div className="card stat">
            <span className="muted">Revenue (completed)</span>
            <strong>{formatPrice(stats.revenueCents, salon.currency)}</strong>
          </div>
        </div>
      )}

      <div className="day-nav">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setDate(addDays(date, -1))}>
          ← Prev
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setDate(addDays(date, 1))}>
          Next →
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDate(todayInZone(salon.timezone))}>
          Today
        </button>
      </div>

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
      ) : appointments.length === 0 ? (
        <p className="muted">No appointments on this day.</p>
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
                    {formatTime(a.start_time, salon.timezone)} – {formatTime(a.end_time, salon.timezone)}
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
