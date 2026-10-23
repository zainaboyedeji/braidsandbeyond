export function formatPrice(cents, currency = 'USD') {
  // narrowSymbol: "₦15,000.00" rather than "NGN 15,000.00"
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(
    cents / 100
  );
}

export function formatTime(iso, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function formatDateTime(iso, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

// "Today" as YYYY-MM-DD in the salon's timezone (not the browser's)
export function todayInZone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "13:30" -> "1:30 PM"
export function formatClock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// Weekday (0 = Sunday) of a YYYY-MM-DD calendar date
export function weekdayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const PICKUP_TIERS = { luxury: 'Luxury', basic: 'Basic' };

// "Luxury pickup · Toyota Prado 2024 · 6 hours", or null when the booking has no pickup
export function formatPickup(booking) {
  if (!booking.pickup_hours) return null;
  return `${PICKUP_TIERS[booking.pickup_tier] || ''} pickup · ${booking.pickup_vehicle_name} · ${booking.pickup_hours} hours`;
}
