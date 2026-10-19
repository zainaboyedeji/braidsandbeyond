import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, assetUrl } from '../api/client';
import { useApp } from '../context/AppContext';
import {
  addDays,
  formatDateTime,
  formatDuration,
  formatPrice,
  formatTime,
  todayInZone,
  weekdayOf,
} from '../utils/format';

const BOOKING_WINDOW_DAYS = 60;

export default function Book() {
  const { user, salon } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const today = todayInZone(salon.timezone);
  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState(searchParams.get('serviceId') || '');
  const [date, setDate] = useState(() => {
    const fromUrl = searchParams.get('date');
    return fromUrl && fromUrl >= today ? fromUrl : today;
  });
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [contact, setContact] = useState({ fullName: '', email: '', phone: '' });

  // Pre-fill contact details from the account; the customer can still edit them for this booking
  useEffect(() => {
    if (user) setContact({ fullName: user.full_name || '', email: user.email || '', phone: user.phone || '' });
  }, [user]);

  function updateContact(field) {
    return (e) => setContact((prev) => ({ ...prev, [field]: e.target.value }));
  }

  useEffect(() => {
    api
      .get('/services')
      .then((data) => setServices(data.services))
      .catch((err) => setError(err.message));
  }, []);

  const loadSlots = useCallback(async () => {
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    try {
      const data = await api.get(`/appointments/availability?serviceId=${serviceId}&date=${date}`);
      setSlots(data.slots);
    } catch (err) {
      setError(err.message);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [serviceId, date]);

  useEffect(() => {
    setSelectedSlot(null);
    loadSlots();
  }, [loadSlots]);

  const selectedService = services.find((s) => String(s.id) === String(serviceId));
  const isClosedDay = salon.hours.some((h) => h.weekday === weekdayOf(date) && !h.is_open);

  async function handleBook(e) {
    e.preventDefault();
    if (!user) {
      // Customers must have an account; bring them back to this slot afterwards
      navigate('/register', { state: { from: location.pathname + location.search } });
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const data = await api.post('/appointments', {
        serviceId: Number(serviceId),
        startTime: selectedSlot.start_time,
        notes: notes.trim() || undefined,
        contact,
      });
      setConfirmation(data);
    } catch (err) {
      setError(err.message);
      if (err.status === 409) {
        // Someone else got the slot first: refresh the grid
        setSelectedSlot(null);
        loadSlots();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    const b = confirmation.booking;
    return (
      <div className="card confirmation">
        <div className="confirmation-icon">✓</div>
        <h1>You're booked!</h1>
        <p>
          <strong>{b.service_name}</strong> on <strong>{formatDateTime(b.start_time, salon.timezone)}</strong>
        </p>
        <p className="muted">Booking #{b.id}</p>
        {confirmation.emailsSent ? (
          <p className="muted">A confirmation email has been sent to {b.client_email}.</p>
        ) : (
          <div className="alert alert-warning">
            Your booking is saved, but we couldn't send the confirmation email. It's still visible in My Appointments.
          </div>
        )}
        <div className="actions">
          <Link to="/my-appointments" className="btn btn-primary">
            View my appointments
          </Link>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setConfirmation(null);
              setNotes('');
              loadSlots();
            }}
          >
            Book another
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1>Book an appointment</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card book-form">
        <div className="form-row">
          <label>
            Service
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Select a service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatDuration(s.duration_minutes)} · {formatPrice(s.price_cents, salon.currency)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              value={date}
              min={today}
              max={addDays(today, BOOKING_WINDOW_DAYS)}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>

        {selectedService && (
          <div className="book-service">
            {selectedService.image_path && (
              <img src={assetUrl(selectedService.image_path)} alt={selectedService.name} />
            )}
            <div>
              <strong>{selectedService.name}</strong>
              {selectedService.description && <div className="muted">{selectedService.description}</div>}
              <div className="small">
                {formatDuration(selectedService.duration_minutes)} ·{' '}
                {formatPrice(selectedService.price_cents, salon.currency)}
              </div>
            </div>
          </div>
        )}

        {serviceId && (
          <>
            <h3>
              Available times <span className="muted">({salon.timezone})</span>
            </h3>
            {loadingSlots ? (
              <p className="muted">Checking availability…</p>
            ) : slots.length === 0 ? (
              <p className="muted">
                {isClosedDay ? "We're closed on this day." : 'No open slots on this day.'} Try another date.
              </p>
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
          </>
        )}

        {selectedSlot && selectedService && (
          <form className="summary" onSubmit={handleBook}>
            <p>
              <strong>{selectedService.name}</strong> · {formatTime(selectedSlot.start_time, salon.timezone)} –{' '}
              {formatTime(selectedSlot.end_time, salon.timezone)} ·{' '}
              {formatPrice(selectedService.price_cents, salon.currency)}
            </p>
            {user ? (
              <fieldset className="contact-fields">
                <legend>Your details</legend>
                <div className="form-row">
                  <label>
                    Full name
                    <input
                      value={contact.fullName}
                      onChange={updateContact('fullName')}
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Email address
                    <input
                      type="email"
                      value={contact.email}
                      onChange={updateContact('email')}
                      autoComplete="email"
                      required
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={updateContact('phone')}
                      autoComplete="tel"
                      placeholder="+234 801 234 5678"
                      pattern="\+?[0-9\s\(\)\.\-]{7,20}"
                      title="Enter a valid phone number, e.g. +234 801 234 5678"
                      required
                    />
                  </label>
                </div>
              </fieldset>
            ) : (
              <p className="muted">
                You need an account to book. Sign up (or{' '}
                <Link to="/login" state={{ from: location.pathname + location.search }}>
                  log in
                </Link>
                ) and we'll bring you right back to this time.
              </p>
            )}
            <label>
              Notes <span className="muted">(optional)</span>
              <textarea
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything we should know?"
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Booking…' : user ? 'Confirm booking' : 'Sign up to book'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
