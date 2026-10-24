import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

// /booking and /booking/:id: guests open their booking with its number and the email they booked with
export default function FindBooking() {
  const { id } = useParams();
  const { user } = useApp();
  const navigate = useNavigate();

  const [bookingId, setBookingId] = useState(id || '');
  const [email, setEmail] = useState(user?.email || '');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSearching(true);
    try {
      const data = await api.post('/appointments/lookup', { bookingId, email });
      navigate(`/manage/${data.manageToken}`);
    } catch (err) {
      setError(err.message);
      setSearching(false);
    }
  }

  return (
    <div className="auth-card card">
      <h1>Find my booking</h1>
      <p className="muted">
        Enter your booking number and the email you booked with to view, reschedule or cancel it. No account needed.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit} className="form">
        <label>
          Booking number
          <input
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 42"
            required
            autoFocus={!id}
          />
        </label>
        <label>
          Email address
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus={Boolean(id)}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={searching}>
          {searching ? 'Finding…' : 'View my booking'}
        </button>
      </form>
      <p className="muted small">
        Your booking number is in your confirmation email (e.g. "Booking #42"). The email also has a direct link to
        your booking.
      </p>
      {user ? (
        <p className="muted">
          You're logged in: all your bookings are in <Link to="/my-appointments">My appointments</Link>.
        </p>
      ) : (
        <p className="muted">
          Don't have the details? <Link to="/contact">Contact us</Link> and we'll help.
        </p>
      )}
    </div>
  );
}
