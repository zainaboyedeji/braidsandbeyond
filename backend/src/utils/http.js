const { parsePhoneNumberFromString } = require('libphonenumber-js/mobile');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Forwards rejected promises from async route handlers to the error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Must be a real mobile number (it's where WhatsApp messages go). Local numbers ("0801…") are read as Nigerian.
// Returns it in international form ("+234 801 234 5678"), or null.
function normalizePhone(value) {
  const phone = parsePhoneNumberFromString(String(value || '').trim(), 'NG');
  return phone?.isValid() ? phone.formatInternational() : null;
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
    throw new HttpError(400, 'Enter a valid WhatsApp mobile number with its country code (e.g. +234 801 234 5678)');
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
