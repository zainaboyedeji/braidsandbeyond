import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function Navbar() {
  const { user, salon, logout } = useApp();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="brand">
          ✂️ {salon.name}
        </Link>
        <nav className="nav-links">
          <NavLink to="/book">Book</NavLink>
          {user && <NavLink to="/my-appointments">My Appointments</NavLink>}
          {user?.role === 'admin' && (
            <>
              <NavLink to="/admin" end>
                Dashboard
              </NavLink>
              <NavLink to="/admin/services">Services</NavLink>
              <NavLink to="/admin/hours">Hours</NavLink>
            </>
          )}
          {user ? (
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <Link to="/register" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
