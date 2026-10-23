import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api, assetUrl } from '../api/client';
import { useApp } from '../context/AppContext';
import {
  PICKUP_TIERS,
  addDays,
  formatDateTime,
  formatDuration,
  formatPickup,
  formatPrice,
  formatTime,
  todayInZone,
  weekdayOf,
} from '../utils/format';

const BOOKING_WINDOW_DAYS = 60;
const PICKUP_HOURS = [6, 12];
const NO_PICKUP = { vehicleId: null, hours: 6, address: '' };

export default function Book() {
  const { user, salon } = useApp();
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
  const [pickup, setPickup] = useState(NO_PICKUP);

  // Pre-fill contact details from the account; the customer can still edit them for this booking
  useEffect(() => {
    if (user) setContact({ fullName: user.full_name || '', email: user.email || '', phone: user.phone || '' });
  }, [user]);

  function updateContact(field) {
    return (e) => setContact((prev) => ({ ...prev, [field]: e.target.value }));
  }

  // The form is long, so the customer is scrolled down when they submit: bring the confirmation into view
  useEffect(() => {
    if (confirmation) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [confirmation]);

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

  const pickupVehicles = salon.pickupVehicles || [];
  const pickupVehicle = pickupVehicles.find((v) => v.id === pickup.vehicleId);
  const pickupPrice = (vehicle, hours) => (hours === 6 ? vehicle.price_6h_cents : vehicle.price_12h_cents);
  const pickupPriceCents = pickupVehicle ? pickupPrice(pickupVehicle, pickup.hours) : 0;

  async function handleBook(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await api.post('/appointments', {
        serviceId: Number(serviceId),
        startTime: selectedSlot.start_time,
        notes: notes.trim() || undefined,
        contact,
        pickup: pickupVehicle ? { vehicleId: pickupVehicle.id, hours: pickup.hours, address: pickup.address } : undefined,
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
        <h1>Booking request sent!</h1>
        <p>
          <strong>{b.service_name}</strong> on <strong>{formatDateTime(b.start_time, salon.timezone)}</strong>
        </p>
        {b.pickup_hours && (
          <p>
            {formatPickup(b)} · {formatPrice(b.pickup_price_cents, salon.currency)}
          </p>
        )}
        <p>
          <span className="badge badge-pending">pending</span> We'll email you as soon as the salon confirms it.
        </p>
        <p className="muted">Booking #{b.id}</p>
        {confirmation.emailsSent ? (
          <p className="muted">
            We've sent the details and a link to manage your booking to {b.client_email}.
          </p>
        ) : (
          <div className="alert alert-warning">
            Your booking is saved, but we couldn't send the email. Save the "Manage booking" link below to reschedule or
            cancel later.
          </div>
        )}
        <div className="actions">
          <Link to={`/manage/${b.manage_token}`} className="btn btn-primary">
            Manage booking
          </Link>
          {user && (
            <Link to="/my-appointments" className="btn btn-outline">
              My appointments
            </Link>
          )}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setConfirmation(null);
              setNotes('');
              setPickup(NO_PICKUP);
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
              {!user && (
                <p className="muted small">
                  No account needed.{' '}
                  <Link to="/login" state={{ from: location.pathname + location.search }}>
                    Log in
                  </Link>{' '}
                  if you'd like to keep all your bookings in one place.
                </p>
              )}
            </fieldset>
            {pickupVehicles.length > 0 && (
              <fieldset className="contact-fields">
                <legend>
                  Pickup <span className="muted">(optional add-on)</span>
                </legend>
                <div className="pickup-options">
                  <button
                    type="button"
                    className={`slot ${!pickupVehicle ? 'slot-selected' : ''}`}
                    onClick={() => setPickup((p) => ({ ...p, vehicleId: null }))}
                  >
                    No pickup
                  </button>
                  {pickupVehicles.map((v) => (
                    <button
                      type="button"
                      key={v.id}
                      className={`slot ${pickup.vehicleId === v.id ? 'slot-selected' : ''}`}
                      onClick={() => setPickup((p) => ({ ...p, vehicleId: v.id }))}
                    >
                      {PICKUP_TIERS[v.tier] || v.tier}
                      <div className="small">{v.name}</div>
                    </button>
                  ))}
                </div>
                {pickupVehicle && (
                  <>
                    <div className="pickup-options">
                      {PICKUP_HOURS.map((hours) => (
                        <button
                          type="button"
                          key={hours}
                          className={`slot ${pickup.hours === hours ? 'slot-selected' : ''}`}
                          onClick={() => setPickup((p) => ({ ...p, hours }))}
                        >
                          {hours} hours
                          <div className="small">{formatPrice(pickupPrice(pickupVehicle, hours), salon.currency)}</div>
                        </button>
                      ))}
                    </div>
                    <label>
                      Pickup address
                      <textarea
                        rows={2}
                        required
                        minLength={5}
                        maxLength={300}
                        value={pickup.address}
                        onChange={(e) => setPickup((p) => ({ ...p, address: e.target.value }))}
                        placeholder="Where should we pick you up?"
                      />
                    </label>
                  </>
                )}
              </fieldset>
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
            {pickupVehicle && (
              <p className="pickup-total">
                Total: {formatPrice(selectedService.price_cents + pickupPriceCents, salon.currency)}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Request booking'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
