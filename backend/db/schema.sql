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

-- ---------- APPOINTMENTS ----------
CREATE TABLE IF NOT EXISTS appointments (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER            NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  service_id  INTEGER            NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  start_time  TIMESTAMPTZ        NOT NULL,
  end_time    TIMESTAMPTZ        NOT NULL,
  status      appointment_status NOT NULL DEFAULT 'confirmed',
  notes       TEXT,
  created_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT appointments_valid_range CHECK (end_time > start_time),

  -- Last line of defense: Postgres itself refuses overlapping active bookings
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);

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

DROP TRIGGER IF EXISTS appointments_set_updated_at ON appointments;
CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
