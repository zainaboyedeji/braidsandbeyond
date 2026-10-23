import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { WEEKDAYS, formatClock, mapsUrl, telHref } from '../utils/format';

const EMPTY = { name: '', email: '', phone: '', message: '', website: '' };

// Monday first
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function Contact() {
  const { salon, user } = useApp();
  const { phone, whatsappNumber, email, address } = salon;
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  }));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await api.post('/contact', form);
      setSent(true);
      setForm((prev) => ({ ...prev, message: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="contact-page">
      <h1>Contact us</h1>
      <p className="muted">
        Questions about a style, a booking or prices? Get in touch, or{' '}
        <Link to="/book">book an appointment</Link> online.
      </p>

      <div className="contact-grid">
        <section className="card contact-details">
          {phone && (
            <div>
              <h2>Call or text</h2>
              <p>
                <a href={telHref(phone)}>{phone}</a>
              </p>
              <div className="actions">
                <a href={telHref(phone)} className="btn btn-primary btn-sm">
                  Call
                </a>
                <a href={`sms:${telHref(phone).slice(4)}`} className="btn btn-outline btn-sm">
                  Text
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
            </div>
          )}
          {email && (
            <div>
              <h2>Email</h2>
              <p>
                <a href={`mailto:${email}`}>{email}</a>
              </p>
            </div>
          )}
          {address && (
            <div>
              <h2>Visit us</h2>
              <p className="contact-address">{address}</p>
              <a href={mapsUrl(address)} target="_blank" rel="noreferrer" className="small">
                Get directions
              </a>
            </div>
          )}
          {salon.hours.length > 0 && (
            <div>
              <h2>Opening hours</h2>
              <dl className="contact-hours">
                {DISPLAY_ORDER.map((weekday) => {
                  const h = salon.hours.find((x) => x.weekday === weekday);
                  if (!h) return null;
                  return (
                    <div key={weekday}>
                      <dt>{WEEKDAYS[weekday]}</dt>
                      <dd className={h.is_open ? '' : 'muted'}>
                        {h.is_open ? `${formatClock(h.open_time)} – ${formatClock(h.close_time)}` : 'Closed'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Send us a message</h2>
          {sent && (
            <div className="alert alert-success">Thanks! Your message has been sent. We'll get back to you soon.</div>
          )}
          {error && <div className="alert alert-error">{error}</div>}
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Name
              <input value={form.name} onChange={update('name')} autoComplete="name" required minLength={2} />
            </label>
            <div className="form-row">
              <label>
                Email
                <input type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
              </label>
              <label>
                Phone <span className="muted">(optional)</span>
                <input type="tel" value={form.phone} onChange={update('phone')} autoComplete="tel" maxLength={30} />
              </label>
            </div>
            <label>
              Message
              <textarea
                rows={5}
                value={form.message}
                onChange={update('message')}
                required
                minLength={5}
                maxLength={3000}
              />
            </label>
            {/* Hidden from people; bots fill it in and their message is dropped */}
            <input
              className="visually-hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={form.website}
              onChange={update('website')}
              name="website"
            />
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </form>
        </section>
      </div>

      {address && (
        <iframe
          className="contact-map card"
          title={`Map showing ${salon.name}`}
          src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
    </div>
  );
}
