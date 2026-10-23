-- =========================================================
-- Salon Booking App - Database Schema (idempotent)
-- Run: npm run db:init   (or: psql "$DATABASE_URL" -f backend/db/schema.sql)
-- =========================================================

BEGIN;

-- Needed for the overlap-prevention exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- ENUM TYPES ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('client', 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
  END IF;
END$$;

-- ---------- USERS ----------
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  phone          VARCHAR(30),
  password_hash  VARCHAR(255) NOT NULL,
  role           user_role    NOT NULL DEFAULT 'client',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique email (Jane@x.com == jane@x.com)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq ON users (LOWER(email));

-- ---------- SERVICES ----------
CREATE TABLE IF NOT EXISTS services (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(120) NOT NULL UNIQUE,
  description       TEXT,
  duration_minutes  INTEGER      NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  price_cents       INTEGER      NOT NULL CHECK (price_cents >= 0),
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Relative URL of the uploaded photo, e.g. /uploads/services/abc.jpg
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_path TEXT;

-- Deleted services that have past bookings are archived (deleted_at set) rather than removed, so those
-- bookings keep their service; they're hidden everywhere else. Names only have to be unique among live services.
ALTER TABLE services ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS services_name_live_uniq ON services (name) WHERE deleted_at IS NULL;

-- Gallery: extra photos of a service, shown after its cover photo (services.image_path)
CREATE TABLE IF NOT EXISTS service_photos (
  id          SERIAL PRIMARY KEY,
  service_id  INTEGER     NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  image_path  TEXT        NOT NULL,
  position    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS service_photos_service_idx ON service_photos (service_id, position);

-- ---------- BUSINESS HOURS (one row per weekday, 0 = Sunday) ----------
CREATE TABLE IF NOT EXISTS business_hours (
  weekday     SMALLINT PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  is_open     BOOLEAN  NOT NULL DEFAULT TRUE,
  open_time   TIME     NOT NULL DEFAULT '09:00',
  close_time  TIME     NOT NULL DEFAULT '18:00',
  CONSTRAINT business_hours_valid_range CHECK (close_time > open_time)
);

-- ---------- APPOINTMENTS ----------
CREATE TABLE IF NOT EXISTS appointments (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER            NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  service_id  INTEGER            NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  start_time  TIMESTAMPTZ        NOT NULL,
  end_time    TIMESTAMPTZ        NOT NULL,
  status      appointment_status NOT NULL DEFAULT 'pending',
  notes       TEXT,
  created_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT appointments_valid_range CHECK (end_time > start_time),

  -- Last line of defense: Postgres itself refuses overlapping active bookings
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);

-- Contact details the customer confirmed on the booking form (may differ from their account).
-- NULL on older bookings, which fall back to the users row.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS contact_name  VARCHAR(120);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30);

-- Guest bookings: no account, so client_id is NULL and the contact_* columns are the only record of the customer
ALTER TABLE appointments ALTER COLUMN client_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_has_customer') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_has_customer
      CHECK (client_id IS NOT NULL OR contact_email IS NOT NULL);
  END IF;
END$$;

-- New bookings wait for the salon to confirm them (pending still holds the slot)
ALTER TABLE appointments ALTER COLUMN status SET DEFAULT 'pending';

-- Secret for the "manage your booking" link (view / reschedule / cancel without logging in).
-- Two UUIDv4s = 244 random bits; gen_random_uuid() is built into Postgres 13+.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manage_token VARCHAR(64);
UPDATE appointments
   SET manage_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 WHERE manage_token IS NULL;
ALTER TABLE appointments
  ALTER COLUMN manage_token SET DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  ALTER COLUMN manage_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_manage_token_uniq ON appointments (manage_token);

-- ---------- PICKUP ADD-ON (optional car pickup, booked for 6 or 12 hours) ----------
CREATE TABLE IF NOT EXISTS pickup_vehicles (
  id               SERIAL PRIMARY KEY,
  tier             VARCHAR(20)  NOT NULL UNIQUE CHECK (tier IN ('luxury', 'basic')),
  name             VARCHAR(120) NOT NULL,
  price_6h_cents   INTEGER      NOT NULL DEFAULT 0 CHECK (price_6h_cents >= 0),
  price_12h_cents  INTEGER      NOT NULL DEFAULT 0 CHECK (price_12h_cents >= 0),
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- pickup_price_cents is the price at booking time, so later price changes don't rewrite old bookings
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pickup_vehicle_id  INTEGER REFERENCES pickup_vehicles(id) ON DELETE RESTRICT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pickup_hours       SMALLINT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pickup_price_cents INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pickup_address     TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_pickup_complete') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_pickup_complete CHECK (
      (pickup_vehicle_id IS NULL AND pickup_hours IS NULL AND pickup_price_cents IS NULL AND pickup_address IS NULL)
      OR (pickup_vehicle_id IS NOT NULL AND pickup_hours IN (6, 12) AND pickup_price_cents >= 0 AND pickup_address IS NOT NULL)
    );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS appointments_client_idx     ON appointments (client_id);
CREATE INDEX IF NOT EXISTS appointments_service_idx    ON appointments (service_id);
CREATE INDEX IF NOT EXISTS appointments_start_time_idx ON appointments (start_time);

-- ---------- AUTO-UPDATE updated_at ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS services_set_updated_at ON services;
CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS pickup_vehicles_set_updated_at ON pickup_vehicles;
CREATE TRIGGER pickup_vehicles_set_updated_at
  BEFORE UPDATE ON pickup_vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS appointments_set_updated_at ON appointments;
CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- SERVICE VARIATIONS (e.g. Small / Medium / Large, each with its own price and length) ----------
-- A service with variations is always booked as one of them; without any, its own price and length are used.
CREATE TABLE IF NOT EXISTS service_variants (
  id                SERIAL PRIMARY KEY,
  service_id        INTEGER      NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name              VARCHAR(60)  NOT NULL,
  duration_minutes  INTEGER      NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  price_cents       INTEGER      NOT NULL CHECK (price_cents >= 0),
  position          INTEGER      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS service_variants_service_idx ON service_variants (service_id, position);

-- What was booked, frozen at booking time so later price / option changes don't rewrite old bookings.
-- NULL on older bookings, which fall back to the service's current price.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS variant_id          INTEGER REFERENCES service_variants(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS variant_name        VARCHAR(60);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_price_cents INTEGER CHECK (service_price_cents >= 0);

-- ---------- DEPOSITS (paid online through Paystack, or by bank transfer, when booking) ----------
-- deposit_status NULL = no deposit was asked for (booked before deposits existed, or payments switched off).
-- 'unpaid' Paystack bookings hold their slot only for a short while (PAYMENT_HOLD_MINUTES) before being cancelled;
-- 'unpaid' transfer bookings wait for the admin to mark the money received (or cancel).
-- refund_cents is what was (or, for 'refund_due' / 'refund_failed', still has to be) sent back on cancellation.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_cents     INTEGER CHECK (deposit_cents > 0);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_status    VARCHAR(20);
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_deposit_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_deposit_status_check CHECK (deposit_status IN
  ('unpaid', 'paid', 'refunded', 'partially_refunded', 'forfeited', 'refund_due', 'refund_failed'));
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method    VARCHAR(20) CHECK (payment_method IN ('paystack', 'transfer'));
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_paid_at   TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS refund_cents      INTEGER CHECK (refund_cents >= 0);

-- ---------- PASSWORD RESETS ("forgot password" links, single use, 1 hour) ----------
-- Only a SHA-256 of the emailed token is stored, so a DB leak can't be used to reset passwords.
CREATE TABLE IF NOT EXISTS password_resets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  CHAR(64)    NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);

COMMIT;
