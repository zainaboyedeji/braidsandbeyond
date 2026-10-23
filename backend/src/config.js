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
if (process.env.CLOUDINARY_URL && !/^cloudinary:\/\/\w+:[\w-]+@[\w-]+$/.test(process.env.CLOUDINARY_URL)) {
  console.error('CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>');
  process.exit(1);
}
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

const config = {
  port: toInt('PORT', 5000, { min: 1, max: 65535 }),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Base URL of the website, used for links in emails (e.g. the "manage booking" link)
  publicUrl: (process.env.PUBLIC_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/+$/, ''),
  uploadsDir: path.resolve(__dirname, '..', 'uploads'),

  // Set CLOUDINARY_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>) to store photos on Cloudinary
  cloudinary: {
    enabled: Boolean(process.env.CLOUDINARY_URL),
    folder: process.env.CLOUDINARY_FOLDER || 'braids-and-beyond/services',
  },

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

  // Deposits are taken when booking if at least one way to pay is set up:
  //  - PAYSTACK_SECRET_KEY (sk_test_… while testing, sk_live_… for real money) for paying online
  //  - BANK_NAME + BANK_ACCOUNT_NAME + BANK_ACCOUNT_NUMBER for bank transfer (the admin marks it received);
  //    add BANK2_NAME + BANK2_ACCOUNT_NAME + BANK2_ACCOUNT_NUMBER (BANK3_…) to offer more accounts
  // With neither, bookings are made without any payment.
  payments: {
    enabled: false, // set below
    methods: [], // set below: 'paystack' and/or 'transfer', in the order shown to clients
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
    banks: [], // set below
    depositPercent: toInt('DEPOSIT_PERCENT', 50, { min: 1, max: 100 }),
    // How long an unpaid booking keeps its slot while the client is on the payment page
    holdMinutes: toInt('PAYMENT_HOLD_MINUTES', 30, { min: 5, max: 240 }),
    // Cancelling at least this long before the appointment refunds the whole deposit…
    freeCancellationHours: toInt('FREE_CANCELLATION_HOURS', 24, { min: 0, max: 720 }),
    // …later than that, only this share of the deposit is refunded
    lateCancelRefundPercent: toInt('LATE_CANCEL_REFUND_PERCENT', 50, { min: 0, max: 100 }),
  },

  // Optional: set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID to message customers when a booking is confirmed
  whatsapp: {
    enabled: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || 'braidsandbeyonds_bookingconfirmed',
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
    // Added to local numbers like 0801 234 5678 (no "+", no leading zeros)
    defaultCountryCode: (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '234').replace(/\D/g, ''),
  },
};

const { payments } = config;
if (payments.paystackSecretKey) payments.methods.push('paystack');
for (const prefix of ['BANK', 'BANK2', 'BANK3']) {
  const name = process.env[`${prefix}_NAME`];
  const accountName = process.env[`${prefix}_ACCOUNT_NAME`];
  const accountNumber = process.env[`${prefix}_ACCOUNT_NUMBER`];
  if (name && accountName && accountNumber) payments.banks.push({ name, accountName, accountNumber });
}
if (payments.banks.length > 0) payments.methods.push('transfer');
payments.enabled = payments.methods.length > 0;

module.exports = config;
