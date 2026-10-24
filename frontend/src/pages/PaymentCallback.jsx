import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { trackBookingCompleted } from '../utils/analytics';
import { cancellationPolicy, formatDateTime, formatPickup, formatPrice } from '../utils/format';

// Paystack sends the client here (with ?reference=…) after the deposit checkout
export default function PaymentCallback() {
  const { user, salon } = useApp();
  const [searchParams] = useSearchParams();
  const reference = searchParams.get('reference') || searchParams.get('trxref');

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!reference) {
      setError('No payment reference was found.');
      return;
    }
    api
      .get(`/payments/verify?reference=${encodeURIComponent(reference)}`)
      .then((data) => {
        if (data.paid && !data.expired) trackBookingCompleted(data.booking);
        setResult(data);
      })
      .catch((err) => setError(err.message));
  }, [reference]);

  if (error) {
    return (
      <div className="card confirmation">
        <h1>We couldn't check your payment</h1>
        <div className="alert alert-error">{error}</div>
        <p className="muted">
          If money left your account, don't book again: your booking will update once the payment comes through. Check
          your email or contact the salon.
        </p>
        <Link to="/book" className="btn btn-outline">
          Back to booking
        </Link>
      </div>
    );
  }

  async function retryPayment() {
    setRetrying(true);
    try {
      const data = await api.post(`/appointments/manage/${result.manageToken}/pay`);
      window.location.assign(data.paymentUrl);
    } catch (err) {
      setError(err.message);
      setRetrying(false);
    }
  }

  if (!result) return <p className="muted">Checking your payment…</p>;

  if (!result.paid) {
    return (
      <div className="card confirmation">
        <h1>Payment not completed</h1>
        <p>Your deposit wasn't paid, so the booking isn't confirmed yet.</p>
        <p className="muted">
          Your time is held for {salon.deposits.holdMinutes} minutes from when you booked. After that it's released and
          you'll need to book again.
        </p>
        <div className="actions">
          {result.manageToken && (
            <button type="button" className="btn btn-primary" onClick={retryPayment} disabled={retrying}>
              {retrying ? 'Taking you to payment…' : 'Try payment again'}
            </button>
          )}
          <Link to="/book" className="btn btn-outline">
            Back to booking
          </Link>
        </div>
      </div>
    );
  }

  const b = result.booking;

  if (result.expired) {
    return (
      <div className="card confirmation">
        <h1>Your time slot expired</h1>
        <p>
          The payment came in after the {salon.deposits.holdMinutes}-minute hold on this time ran out, so the booking
          couldn't go ahead.
        </p>
        <p>
          {b.deposit_status === 'refund_failed'
            ? `The salon will refund your ${formatPrice(b.deposit_cents, salon.currency)} deposit.`
            : `Your ${formatPrice(b.deposit_cents, salon.currency)} deposit has been refunded in full.`}
        </p>
        <Link to={`/book?serviceId=${b.service_id}`} className="btn btn-primary">
          Book again
        </Link>
      </div>
    );
  }

  return (
    <div className="card confirmation">
      <div className="confirmation-icon">✓</div>
      <h1>Deposit paid, booking requested!</h1>
      <p>
        <strong>{b.service_name}</strong> on <strong>{formatDateTime(b.start_time, salon.timezone)}</strong>
      </p>
      {b.pickup_vehicle_name && (
        <p>
          {formatPickup(b)} · {formatPrice(b.pickup_price_cents, salon.currency)}
        </p>
      )}
      <p>
        Deposit paid: <strong>{formatPrice(b.deposit_cents, salon.currency)}</strong>
      </p>
      <p>
        <span className="badge badge-pending">pending</span> We'll email you as soon as the salon confirms it.
      </p>
      <p className="muted">Booking #{b.id}</p>
      <p className="muted small">{cancellationPolicy(salon.deposits)}</p>
      <div className="actions">
        <Link to={`/manage/${b.manage_token}`} className="btn btn-primary">
          Manage booking
        </Link>
        {user && (
          <Link to="/my-appointments" className="btn btn-outline">
            My appointments
          </Link>
        )}
      </div>
    </div>
  );
}
