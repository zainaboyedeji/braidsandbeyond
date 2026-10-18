import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { addDays, formatPrice, formatTime, todayInZone } from '../utils/format';

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

export default function AdminDashboard() {
  const { salon } = useApp();
  const [date, setDate] = useState(todayInZone(salon.timezone));
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  async function changeStatus(id, status) {
    setBusyId(id);
    setError('');
    try {
      await api.patch(`/admin/appointments/${id}/status`, { status });
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
                    <div>{a.client_name}</div>
                    <div className="muted small">
                      <a href={`mailto:${a.client_email}`}>{a.client_email}</a>
                      {a.client_phone && ` · ${a.client_phone}`}
                    </div>
                  </td>
                  <td>
                    {a.service_name}
                    <div className="muted small">{formatPrice(a.price_cents, salon.currency)}</div>
                  </td>
                  <td className="small">{a.notes || '—'}</td>
                  <td>
                    <select
                      value={a.status}
                      disabled={busyId === a.id}
                      onChange={(e) => changeStatus(a.id, e.target.value)}
                      className={`badge-select badge-${a.status}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
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
