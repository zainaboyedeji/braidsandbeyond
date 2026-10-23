import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import {
  cancelPrompt,
  formatDateTime,
  formatDeposit,
  formatPickup,
  formatPrice,
  refundIfCancelledNow,
} from '../utils/format';

export default function MyAppointments() {
  const { salon } = useApp();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const data = await api.get('/appointments/mine');
      setAppointments(data.appointments);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cancel(a) {
    const refund = refundIfCancelledNow(a, salon.deposits);
    if (!window.confirm(cancelPrompt(a, refund, salon.currency))) return;
    const id = a.id;
    setBusyId(id);
    setError('');
    try {
      await api.patch(`/appointments/${id}/cancel`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const now = new Date();
  const upcoming = appointments
    .filter((a) => new Date(a.start_time) > now && ['pending', 'confirmed'].includes(a.status))
    .reverse();
  const past = appointments.filter((a) => !upcoming.includes(a));

  return (
    <>
      <h1>My appointments</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : appointments.length === 0 ? (
        <div className="card">
          <p>You don't have any appointments yet.</p>
          <Link to="/book" className="btn btn-primary">
            Book now
          </Link>
        </div>
      ) : (
        <>
          <h2 className="section-title">Upcoming</h2>
          {upcoming.length === 0 && <p className="muted">Nothing upcoming.</p>}
          <div className="list">
            {upcoming.map((a) => (
              <div key={a.id} className="card list-item">
                <div>
                  <strong>{a.service_name}</strong>
                  <div>{formatDateTime(a.start_time, salon.timezone)}</div>
                  {a.pickup_hours && <div className="small">{formatPickup(a)}</div>}
                  {a.deposit_cents && <div className="small">{formatDeposit(a, salon.currency)}</div>}
                  <div className="muted">
                    #{a.id} · {formatPrice(a.price_cents, salon.currency)}{' '}
                    <span className={`badge badge-${a.status}`}>{a.status}</span>
                  </div>
                </div>
                <div className="actions">
                  <Link to={`/manage/${a.manage_token}`} className="btn btn-outline btn-sm">
                    Reschedule
                  </Link>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => cancel(a)}
                    disabled={busyId === a.id}
                  >
                    {busyId === a.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {past.length > 0 && (
            <>
              <h2 className="section-title">History</h2>
              <div className="list">
                {past.map((a) => (
                  <div key={a.id} className="card list-item list-item-muted">
                    <div>
                      <strong>{a.service_name}</strong>
                      <div>{formatDateTime(a.start_time, salon.timezone)}</div>
                      {a.deposit_cents && <div className="small">{formatDeposit(a, salon.currency)}</div>}
                    </div>
                    <span className={`badge badge-${a.status}`}>{a.status}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
