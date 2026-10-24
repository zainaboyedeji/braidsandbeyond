import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import TransferDetails from '../components/TransferDetails';
import { useApp } from '../context/AppContext';
import {
  addDays,
  cancelPrompt,
  cancellationPolicy,
  formatDateTime,
  formatDeposit,
  formatPickup,
  formatPrice,
  formatTime,
  firstBookableDay,
} from '../utils/format';

const BOOKING_WINDOW_DAYS = 60;

// Reached from the private link in the booking emails: works for guests and signed-in customers alike
export default function ManageBooking() {
  const { token } = useParams();
  const { salon } = useApp();
  // After the same-day cutoff this is tomorrow
  const today = firstBookableDay(salon);

  const [booking, setBooking] = useState(null);
  const [refundIfCancelled, setRefundIfCancelled] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    api
      .get(`/appointments/manage/${token}`)
      .then((data) => {
        setBooking(data.booking);
        setRefundIfCancelled(data.refundIfCancelled);
      })
      .catch((err) => setError(err.status === 404 ? 'This booking link is invalid or has expired.' : err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    try {
      const data = await api.get(`/appointments/manage/${token}/availability?date=${date}`);
      setSlots(data.slots);
    } catch (err) {
      setError(err.message);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [token, date]);

  useEffect(() => {
    if (!rescheduling) return;
    setSelectedSlot(null);
    loadSlots();
  }, [rescheduling, loadSlots]);

  async function reschedule() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await api.patch(`/appointments/manage/${token}/reschedule`, { startTime: selectedSlot.start_time });
      setBooking(data.booking);
      setRescheduling(false);
      setNotice(
        data.emailsSent
          ? "Your new time is saved. It's pending until the salon confirms it, and we've emailed you the details."
          : "Your new time is saved and pending until the salon confirms it. (We couldn't send the email.)"
      );
    } catch (err) {
      setError(err.message);
      if (err.status === 409) loadSlots();
    } finally {
      setBusy(false);
    }
  }

  async function payDeposit() {
    setBusy(true);
    setError('');
    try {
      const data = await api.post(`/appointments/manage/${token}/pay`);
      window.location.assign(data.paymentUrl);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm(cancelPrompt(booking, refundIfCancelled, salon.currency))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await api.patch(`/appointments/manage/${token}/cancel`);
      setBooking(data.booking);
      setRescheduling(false);
      const b = data.booking;
      setNotice(
        b.deposit_status === 'refund_failed'
          ? `Your appointment has been cancelled. The salon will refund ${formatPrice(b.refund_cents, salon.currency)} of your deposit.`
          : b.refund_cents
            ? `Your appointment has been cancelled and ${formatPrice(b.refund_cents, salon.currency)} of your deposit is being refunded. It can take a few working days to reach you.`
            : 'Your appointment has been cancelled.'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  if (!booking) {
    return (
      <div className="card">
        <div className="alert alert-error">{error}</div>
        <Link to="/book" className="btn btn-primary">
          Book an appointment
        </Link>
      </div>
    );
  }

  const isUpcoming = new Date(booking.start_time) > new Date() && ['pending', 'confirmed'].includes(booking.status);
  const awaitingDeposit = isUpcoming && booking.deposit_status === 'unpaid';
  const deposit = formatDeposit(booking, salon.currency);

  return (
    <>
      <h1>Your booking</h1>
      {notice && <div className="alert alert-success">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card book-form">
        <div className="list-item">
          <div>
            <strong>{booking.service_name}</strong>
            <div>{formatDateTime(booking.start_time, salon.timezone)}</div>
            {booking.pickup_vehicle_name && (
              <div className="small">
                {formatPickup(booking)} · {formatPrice(booking.pickup_price_cents, salon.currency)}
                <div className="muted">Pickup from: {booking.pickup_address}</div>
              </div>
            )}
            <div className="muted">
              #{booking.id} · {formatPrice(booking.price_cents, salon.currency)} · {booking.client_name}
            </div>
            {deposit && <div className="small">{deposit}</div>}
          </div>
          <span className={`badge badge-${booking.status}`}>{booking.status}</span>
        </div>

        {awaitingDeposit && booking.payment_method === 'transfer' ? (
          <>
            {salon.deposits.banks?.length > 0 && (
              <TransferDetails booking={booking} banks={salon.deposits.banks} currency={salon.currency} />
            )}
            <div className="actions">
              <button type="button" className="btn btn-ghost" onClick={cancel} disabled={busy}>
                Cancel booking
              </button>
            </div>
          </>
        ) : awaitingDeposit ? (
          <>
            <div className="alert alert-warning">
              Your {formatPrice(booking.deposit_cents, salon.currency)} deposit hasn't been paid yet. The time is only
              held for {salon.deposits.holdMinutes} minutes after booking.
            </div>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={payDeposit} disabled={busy}>
                {busy ? 'Taking you to payment…' : `Pay ${formatPrice(booking.deposit_cents, salon.currency)} deposit`}
              </button>
              <button type="button" className="btn btn-ghost" onClick={cancel} disabled={busy}>
                Cancel booking
              </button>
            </div>
          </>
        ) : (
          booking.status === 'pending' && (
            <p className="muted small">The salon hasn't confirmed this booking yet. We'll email you when they do.</p>
          )
        )}

        {isUpcoming && booking.deposit_status === 'paid' && (
          <p className="muted small">{cancellationPolicy(salon.deposits)}</p>
        )}

        {isUpcoming && !awaitingDeposit && !rescheduling && (
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => setRescheduling(true)} disabled={busy}>
              Reschedule
            </button>
            <button type="button" className="btn btn-danger" onClick={cancel} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel appointment'}
            </button>
          </div>
        )}

        {booking.status === 'cancelled' && (
          <div className="actions">
            <Link to={`/book?serviceId=${booking.service_id}`} className="btn btn-primary">
              Book again
            </Link>
          </div>
        )}

        {rescheduling && (
          <>
            <h3>Pick a new time</h3>
            <label>
              Date
              <input
                type="date"
                value={date}
                min={today}
                max={addDays(today, BOOKING_WINDOW_DAYS)}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            </label>
            {loadingSlots ? (
              <p className="muted">Checking availability…</p>
            ) : slots.length === 0 ? (
              <p className="muted">No open slots on this day. Try another date.</p>
            ) : (
              <div className="slot-grid">
                {slots.map((slot) => (
                  <button
                    type="button"
                    key={slot.start_time}
                    className={`slot ${selectedSlot?.start_time === slot.start_time ? 'slot-selected' : ''}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {formatTime(slot.start_time, salon.timezone)}
                  </button>
                ))}
              </div>
            )}
            <p className="muted small">Your new time will be pending until the salon confirms it.</p>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={reschedule} disabled={!selectedSlot || busy}>
                {busy
                  ? 'Saving…'
                  : selectedSlot
                    ? `Move to ${formatTime(selectedSlot.start_time, salon.timezone)}`
                    : 'Choose a time'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRescheduling(false)} disabled={busy}>
                Keep current time
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
