import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Opening a new page starts at the top (React Router keeps the old scroll position otherwise).
// In-page links like #services are left alone.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}
