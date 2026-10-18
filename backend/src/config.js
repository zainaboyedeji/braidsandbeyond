const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
  'ADMIN_EMAIL',
];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required env vars in backend/.env: ${missing.join(', ')}`);
  process.exit(1);
}

function toInt(name, fallback, { min, max }) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`Env var ${name} must be an integer between ${min} and ${max} (got "${raw}")`);
    process.exit(1);
  }
  return value;
}

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezone = process.env.SALON_TIMEZONE || 'UTC';
if (!isValidTimeZone(timezone)) {
  console.error(`SALON_TIMEZONE "${timezone}" is not a valid IANA timezone (e.g. America/New_York)`);
  process.exit(1);
}

const openHour = toInt('BUSINESS_OPEN_HOUR', 9, { min: 0, max: 23 });
const closeHour = toInt('BUSINESS_CLOSE_HOUR', 18, { min: 1, max: 23 });
if (closeHour <= openHour) {
  console.error('BUSINESS_CLOSE_HOUR must be greater than BUSINESS_OPEN_HOUR');
  process.exit(1);
}

const config = {
  port: toInt('PORT', 5000, { min: 1, max: 65535 }),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  db: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  salon: {
    name: process.env.SALON_NAME || 'Our Salon',
    currency: (process.env.SALON_CURRENCY || 'USD').toUpperCase(),
    timezone,
    openHour,
    closeHour,
    slotIntervalMinutes: toInt('SLOT_INTERVAL_MINUTES', 15, { min: 5, max: 120 }),
  },

  email: {
    host: process.env.SMTP_HOST,
    port: toInt('SMTP_PORT', 465, { min: 1, max: 65535 }),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM,
    adminEmail: process.env.ADMIN_EMAIL,
  },
};

module.exports = config;
