import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../api/client';
import PhotoGallery, { servicePhotoPaths } from '../components/PhotoGallery';
import { useApp } from '../context/AppContext';
import { WEEKDAYS, formatClock, formatDuration, formatPrice } from '../utils/format';

// Monday first
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function Home() {
  const { salon } = useApp();
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState(null);

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
        <span className="hero-eyebrow">Braids · Wigs · Styling · Beyond</span>
        <h1>
          Your crown, <em>beautifully</em> done
        </h1>
        <p>
          Braids, cornrows, wig installation, revamps, styling and everything hair at {salon.name}. Choose your
          service and book a time that suits you.
        </p>
        <div className="actions">
          <Link to="/book" className="btn btn-dark">
            Book an appointment
          </Link>
          <a href="#services" className="btn btn-outline">
            View services
          </a>
        </div>
      </section>

      <div className="section-head" id="services">
        <h2>Our services</h2>
        <p>Every style, done with care</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <p className="muted">Loading services…</p>
      ) : services.length === 0 ? (
        <p className="muted">No services available yet.</p>
      ) : (
        <div className="grid">
          {services.map((service) => (
            <article key={service.id} className="card service-card">
              {service.image_path ? (
                <button
                  type="button"
                  className="service-image-button"
                  onClick={() => setGallery(service)}
                  aria-label={`See photos of ${service.name}`}
                >
                  <img className="service-image" src={assetUrl(service.image_path)} alt={service.name} loading="lazy" />
                  {service.photos?.length > 0 && (
                    <span className="photo-count">+{service.photos.length} photos</span>
                  )}
                </button>
              ) : (
                <div className="service-image-placeholder" aria-hidden="true">
                  {service.name.charAt(0)}
                </div>
              )}
              <h3>{service.name}</h3>
              {service.description && <p className="muted">{service.description}</p>}
              <div className="service-meta">
                <span>{formatDuration(service.duration_minutes)}</span>
                <strong>{formatPrice(service.price_cents, salon.currency)}</strong>
              </div>
              <Link to={`/book?serviceId=${service.id}`} className="btn btn-primary">
                Book now
              </Link>
            </article>
          ))}
        </div>
      )}

      {gallery && (
        <PhotoGallery title={gallery.name} paths={servicePhotoPaths(gallery)} onClose={() => setGallery(null)} />
      )}

      {salon.hours.length > 0 && (
        <>
          <div className="section-head">
            <h2>Visit us</h2>
            <p>Bookings are available during these hours</p>
          </div>
          <section className="card opening-hours">
            <h2>Opening hours</h2>
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
        </>
      )}
    </>
  );
}
