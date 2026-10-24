import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BrandName from './BrandName';

export default function Navbar() {
  const { user, salon, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  // After logging in / signing up, go back to the page the visitor was on (on the auth pages themselves,
  // keep wherever they were originally headed)
  const onAuthPage = ['/login', '/register', '/forgot-password'].includes(location.pathname);
  const returnHere = onAuthPage ? location.state : { from: location.pathname + location.search };

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <>
      <div className="announcement">
        <strong>Book online</strong> · Pick your style, choose a time, and you're set
      </div>
      <header className="navbar">
        <div className="container navbar-inner">
          <Link to="/" className="brand" aria-label={`${salon.name} home`}>
            <span className="brand-mark" aria-hidden="true">
              B&amp;B
            </span>
            <BrandName name={salon.name} />
          </Link>
          <nav className="nav-links">
            <NavLink to="/book">Book</NavLink>
            {user ? (
              <NavLink to="/my-appointments">My Appointments</NavLink>
            ) : (
              <NavLink to="/booking">My booking</NavLink>
            )}
            {user?.role === 'admin' && (
              <>
                <NavLink to="/admin" end>
                  Dashboard
                </NavLink>
                <NavLink to="/admin/services">Services</NavLink>
                <NavLink to="/admin/hours">Hours</NavLink>
                <NavLink to="/admin/pickup">Pickup</NavLink>
              </>
            )}
            {user ? (
              <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                Log out
              </button>
            ) : (
              <>
                <NavLink to="/login" state={returnHere}>
                  Log in
                </NavLink>
                <Link to="/register" state={returnHere} className="btn btn-primary btn-sm">
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}
