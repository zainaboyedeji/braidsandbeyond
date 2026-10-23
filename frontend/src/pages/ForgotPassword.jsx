import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-card card">
      <h1>Forgot password</h1>
      {message ? (
        <>
          <div className="alert alert-success">{message}</div>
          <p className="muted">Check your inbox (and spam folder). The link expires in 1 hour.</p>
        </>
      ) : (
        <>
          <p className="muted">Enter the email you signed up with and we'll send you a link to choose a new password.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit} className="form">
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </>
      )}
      <p className="muted">
        Remembered it? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
