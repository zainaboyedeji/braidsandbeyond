import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { formatDuration, formatPrice } from '../utils/format';

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
        <p>
          Open daily {salon.openHour}:00 – {salon.closeHour}:00. Pick a service and grab a slot in seconds.
        </p>
        <Link to="/book" className="btn btn-primary">
          Book an appointment
        </Link>
      </section>

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
