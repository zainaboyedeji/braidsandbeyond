import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

// Salon policies and terms. The numbers come from the salon's settings, so this page always matches
// what the booking system actually does.
export default function Policies() {
  const { salon } = useApp();
  const { deposits, phone, whatsappNumber } = salon;
  const hasPickup = salon.pickupVehicles?.length > 0;
  const paysOnline = deposits.enabled && deposits.methods.includes('paystack');
  const paysTransfer = deposits.enabled && deposits.methods.includes('transfer');

  return (
    <article className="policies">
      <h1>Policies and Terms</h1>
      <p className="muted">
        Please read these before booking. By booking an appointment with {salon.name}, you agree to them.
      </p>

      <section className="card">
        <h2>Running late</h2>
        <p>
          <strong>Please call or text when you are running late.</strong> We'll do our best to fit you in, but if you're
          very late we may need to shorten your service or move your appointment so other clients aren't kept waiting.
        </p>
        {phone && (
          <div className="actions">
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="btn btn-primary btn-sm">
              Call {phone}
            </a>
            <a href={`sms:${phone.replace(/[^\d+]/g, '')}`} className="btn btn-outline btn-sm">
              Text us
            </a>
            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-whatsapp"
              >
                WhatsApp
              </a>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Booking and confirmation</h2>
        <ul>
          <li>Book online by choosing a service and an available time.</li>
          <li>
            Every booking is a request until the salon confirms it. We'll email you, and may also message you on
            WhatsApp, as soon as it's confirmed.
          </li>
          <li>
            Your confirmation email includes a private link to view, reschedule or cancel your booking. Keep it safe:
            anyone with the link can manage the booking.
          </li>
        </ul>
      </section>

      {deposits.enabled && (
        <section className="card">
          <h2>Deposits and payment</h2>
          <ul>
            <li>
              A <strong>{deposits.depositPercent}% deposit</strong> of the total price
              {hasPickup ? ' (service plus any pickup)' : ''} is required to secure every booking.
            </li>
            <li>The rest of the price is paid at the salon on the day of your appointment.</li>
            {paysOnline && (
              <li>
                <strong>Paying online:</strong> pay securely by card, bank or USSD through Paystack. Your time is held
                for {deposits.holdMinutes} minutes while you pay; if the payment isn't completed by then, the time is
                released for other clients.
              </li>
            )}
            {paysTransfer && (
              <li>
                <strong>Paying by bank transfer:</strong> transfer the deposit to one of our accounts and put your
                booking number (e.g. "Booking 42") in the narration. Your booking is confirmed once we receive it.
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Cancellations and refunds</h2>
        {deposits.enabled ? (
          <ul>
            <li>
              Cancel <strong>at least {deposits.freeCancellationHours} hours before</strong> your appointment and your
              deposit is refunded in full.
            </li>
            <li>
              Cancel <strong>less than {deposits.freeCancellationHours} hours before</strong> and{' '}
              {deposits.lateCancelRefundPercent > 0
                ? `${deposits.lateCancelRefundPercent}% of your deposit is refunded`
                : 'your deposit is not refunded'}
              .
            </li>
            <li>If the salon has to cancel your appointment, your deposit is always refunded in full.</li>
            {paysOnline && (
              <li>Deposits paid online are refunded to your card or account. This can take a few working days.</li>
            )}
            {paysTransfer && <li>Deposits paid by bank transfer are refunded by transfer from the salon.</li>}
          </ul>
        ) : (
          <ul>
            <li>Please cancel as early as possible so we can offer the time to someone else.</li>
            <li>If the salon has to cancel your appointment, we'll let you know straight away.</li>
          </ul>
        )}
        <p className="muted small">
          Cancel from the link in your booking email, or from My appointments if you have an account.
        </p>
      </section>

      <section className="card">
        <h2>Rescheduling</h2>
        <ul>
          <li>You can move an upcoming appointment to another free time from your booking link.</li>
          <li>The new time is a request until the salon confirms it, just like a new booking.</li>
          {deposits.enabled && (
            <li>Your deposit moves with the booking. The deposit must be paid before you can reschedule.</li>
          )}
        </ul>
      </section>

      {hasPickup && (
        <section className="card">
          <h2>Pickup service</h2>
          <ul>
            <li>You can add a pickup (car and driver) to your booking.</li>
            <li>
              The pickup price is added to your total{deposits.enabled ? ' and counts towards the deposit' : ''}.
            </li>
            <li>Please give a full, accurate pickup address and keep your phone on so the driver can reach you.</li>
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Your information</h2>
        <ul>
          <li>
            We use your name, email address and phone number only to manage your bookings and to contact you about
            them, by email and WhatsApp.
          </li>
          {paysOnline && <li>Online payments are handled by Paystack. We never see or store your card details.</li>}
          <li>We don't sell or share your details with anyone else.</li>
        </ul>
      </section>

      <div className="actions">
        <Link to="/book" className="btn btn-primary">
          Book an appointment
        </Link>
      </div>
    </article>
  );
}
