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

export const DEPOSIT_LABELS = {
  unpaid: 'deposit not paid',
  paid: 'deposit paid',
  refunded: 'deposit refunded',
  partially_refunded: 'deposit partly refunded',
  forfeited: 'deposit kept',
  refund_due: 'refund due',
  refund_failed: 'refund failed',
};

export const PAYMENT_METHODS = { paystack: 'Pay online', transfer: 'Bank transfer' };

// "Deposit ₦7,500.00 paid", "Deposit ₦7,500.00 · ₦3,750.00 refunded", or null when no deposit was taken
export function formatDeposit(booking, currency) {
  if (!booking.deposit_cents) return null;
  const amount = formatPrice(booking.deposit_cents, currency);
  if (booking.refund_cents) {
    const refund = formatPrice(booking.refund_cents, currency);
    if (booking.deposit_status === 'refund_failed') return `Deposit ${amount} · refund of ${refund} failed`;
    if (booking.deposit_status === 'refund_due') return `Deposit ${amount} · refund of ${refund} due by transfer`;
    return `Deposit ${amount} · ${refund} refunded`;
  }
  if (booking.deposit_status === 'unpaid' && booking.payment_method === 'transfer') {
    return `Deposit ${amount} · awaiting transfer`;
  }
  return `Deposit ${amount} · ${DEPOSIT_LABELS[booking.deposit_status]?.replace('deposit ', '') || booking.deposit_status}`;
}

// Deposit for a booking total; mirrors depositFor() on the server
export function depositFor(totalCents, deposits) {
  if (!deposits?.enabled) return 0;
  return Math.round((totalCents * deposits.depositPercent) / 100);
}

// "Free cancellation up to 24 hours before…"
export function cancellationPolicy(deposits) {
  return (
    `Cancel at least ${deposits.freeCancellationHours} hours before your appointment for a full refund of your ` +
    `deposit. Later cancellations get ${deposits.lateCancelRefundPercent}% of the deposit back.`
  );
}

// What a client gets back from a paid deposit if they cancel now; mirrors refundForCancellation() on the server
export function refundIfCancelledNow(booking, deposits) {
  if (booking.deposit_status !== 'paid') return 0;
  const hoursLeft = (new Date(booking.start_time).getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursLeft >= deposits.freeCancellationHours) return booking.deposit_cents;
  return Math.round((booking.deposit_cents * deposits.lateCancelRefundPercent) / 100);
}

// Confirm-dialog text for cancelling, spelling out the refund
export function cancelPrompt(booking, refundCents, currency) {
  if (booking.deposit_status !== 'paid') return 'Cancel this appointment?';
  const deposit = formatPrice(booking.deposit_cents, currency);
  if (refundCents >= booking.deposit_cents) {
    return `Cancel this appointment? Your full deposit of ${deposit} will be refunded.`;
  }
  return (
    `Cancel this appointment? It's less than the free-cancellation window, so you'll get ` +
    `${formatPrice(refundCents, currency)} of your ${deposit} deposit back.`
  );
}

// Length shown for a service: its own, or the range across its options ("1h–2h 30m")
export function serviceDuration(service) {
  const variants = service.variants || [];
  if (variants.length === 0) return formatDuration(service.duration_minutes);
  const mins = variants.map((v) => v.duration_minutes);
  const lo = Math.min(...mins);
  const hi = Math.max(...mins);
  return lo === hi ? formatDuration(lo) : `${formatDuration(lo)}–${formatDuration(hi)}`;
}

// Price shown for a service: its own, or "from" its cheapest option
export function servicePrice(service, currency) {
  const variants = service.variants || [];
  if (variants.length === 0) return formatPrice(service.price_cents, currency);
  const prices = variants.map((v) => v.price_cents);
  const lo = Math.min(...prices);
  return lo === Math.max(...prices) ? formatPrice(lo, currency) : `from ${formatPrice(lo, currency)}`;
}
