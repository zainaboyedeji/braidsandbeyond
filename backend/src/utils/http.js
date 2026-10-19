class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Forwards rejected promises from async route handlers to the error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts +, spaces, dashes, dots and brackets; requires 7–15 digits (E.164 max)
function normalizePhone(value) {
  const phone = String(value || '').trim();
  const digits = phone.replace(/\D/g, '');
  if (!/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
    return null;
  }
  return phone;
}

/** Validates { fullName, email, phone } and returns the cleaned values, or throws a 400 */
function parseContact(body) {
  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const phone = normalizePhone(body.phone);

  if (fullName.length < 2 || fullName.length > 120) {
    throw new HttpError(400, 'Full name must be 2–120 characters');
  }
  if (!EMAIL_RE.test(email) || email.length > 255) {
    throw new HttpError(400, 'A valid email is required');
  }
  if (!phone) {
    throw new HttpError(400, 'A valid phone number is required (e.g. +234 801 234 5678)');
  }
  return { fullName, email, phone };
}

function parseId(value, name = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return id;
}

module.exports = { HttpError, asyncHandler, EMAIL_RE, parseId, parseContact };
