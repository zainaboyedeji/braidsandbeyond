import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { WEEKDAYS, formatClock } from '../utils/format';
import BrandName from './BrandName';

export default function Footer() {
  const { salon } = useApp();
  const open = salon.hours.filter((h) => h.is_open);

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              B&amp;B
            </span>
            <BrandName name={salon.name} />
          </Link>
          <p>Braids, wigs, styling and everything hair. Book your next look online in seconds.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <ul>
            <li>
              <Link to="/">Services</Link>
            </li>
            <li>
              <Link to="/book">Book an appointment</Link>
            </li>
            <li>
              <Link to="/my-appointments">My appointments</Link>
            </li>
            <li>
              <Link to="/policies">Policies and Terms</Link>
            </li>
          </ul>
        </div>
        {open.length > 0 && (
          <div>
            <h4>Opening hours</h4>
            <ul>
              {/* Monday first */}
              {[...open]
                .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
                .map((h) => (
                  <li key={h.weekday}>
                    {WEEKDAYS[h.weekday].slice(0, 3)} · {formatClock(h.open_time)} – {formatClock(h.close_time)}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
      <div className="footer-bottom">
        © {new Date().getFullYear()} {salon.name}. All rights reserved.
      </div>
    </footer>
  );
}
