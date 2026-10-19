import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function Register() {
  const { user, register } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || '/book';

  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      await register(form);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-card card">
      <h1>Create an account</h1>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit} className="form">
        <label>
          Full name
          <input
            value={form.fullName}
            onChange={update('fullName')}
            autoComplete="name"
            required
            minLength={2}
            autoFocus
          />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
        </label>
        <label>
          Phone number
          <input
            type="tel"
            value={form.phone}
            onChange={update('phone')}
            autoComplete="tel"
            placeholder="+234 801 234 5678"
            pattern="\+?[0-9\s\(\)\.\-]{7,20}"
            title="Enter a valid phone number, e.g. +234 801 234 5678"
            required
          />
        </label>
        <label>
          Password <span className="muted">(min 8 characters)</span>
          <input type="password" value={form.password} onChange={update('password')} required minLength={8} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="muted">
        Already have an account?{' '}
        <Link to="/login" state={location.state}>
          Log in
        </Link>
      </p>
    </div>
  );
}
