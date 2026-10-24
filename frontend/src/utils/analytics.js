// Google Analytics 4. Off unless VITE_GA_ID (e.g. G-XXXXXXX) is set at build time.
// GA4's enhanced measurement counts React Router page changes on its own.
const GA_ID = import.meta.env.VITE_GA_ID;

export function initAnalytics() {
  if (!GA_ID) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
}

export function trackEvent(name, params) {
  if (GA_ID && window.gtag) window.gtag('event', name, params);
}

// A confirmed booking: mark "booking_completed" as a key event in GA to count conversions
export function trackBookingCompleted(booking) {
  trackEvent('booking_completed', { service_name: booking.service_name });
}
