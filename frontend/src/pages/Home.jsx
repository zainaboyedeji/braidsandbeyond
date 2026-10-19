import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../api/client';
import { useApp } from '../context/AppContext';
import { WEEKDAYS, formatClock, formatDuration, formatPrice } from '../utils/format';

// Monday first
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function Home() {
  const { salon } = useApp();
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/services')
      .then((data) => setServices(data.services))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <section className="hero">
        <h1>Welcome to {salon.name}</h1>
        <p>Pick a service and grab a slot in seconds.</p>
        <Link to="/book" className="btn btn-primary">
          Book an appointment
        </Link>
      </section>

      {salon.hours.length > 0 && (
        <section className="card opening-hours">
          <h2 className="section-title">Opening hours</h2>
          <dl>
            {DISPLAY_ORDER.map((weekday) => {
              const h = salon.hours.find((x) => x.weekday === weekday);
              if (!h) return null;
              return (
                <div key={weekday} className="opening-hours-row">
                  <dt>{WEEKDAYS[weekday]}</dt>
                  <dd className={h.is_open ? '' : 'muted'}>
                    {h.is_open ? `${formatClock(h.open_time)} – ${formatClock(h.close_time)}` : 'Closed'}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}

      <h2 className="section-title">Our services</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <p className="muted">Loading services…</p>
      ) : services.length === 0 ? (
        <p className="muted">No services available yet.</p>
      ) : (
        <div className="grid">
          {services.map((service) => (
            <article key={service.id} className="card service-card">
              {service.image_path && (
                <img className="service-image" src={assetUrl(service.image_path)} alt={service.name} loading="lazy" />
              )}
              <h3>{service.name}</h3>
              {service.description && <p className="muted">{service.description}</p>}
              <div className="service-meta">
                <span>{formatDuration(service.duration_minutes)}</span>
                <strong>{formatPrice(service.price_cents, salon.currency)}</strong>
              </div>
              <Link to={`/book?serviceId=${service.id}`} className="btn btn-outline">
                Book this
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
