import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function ResetPassword() {
  const { token } = useParams();
  const { resetPassword } = useApp();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const user = await resetPassword(token, password);
      navigate(user.role === 'admin' ? '/admin' : '/book', { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-card card">
      <h1>Choose a new password</h1>
      {error && (
        <div className="alert alert-error">
          {error} {/expired|invalid/i.test(error) && <Link to="/forgot-password">Send a new link</Link>}
        </div>
      )}
      <form onSubmit={handleSubmit} className="form">
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
            autoFocus
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}
