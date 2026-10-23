const db = require('../db');
const config = require('../config');
const { HttpError } = require('../utils/http');

// Single salon-wide key: all booking writes are serialized through this lock.
// If you add stylists later, lock per stylist instead: pg_advisory_xact_lock(stylist_id).
const BOOKING_LOCK_KEY = 7340001;

const ACTIVE_STATUSES = `('pending', 'confirmed')`;

const MANAGE_TOKEN_RE = /^[0-9a-f]{64}$/;

// One query that returns everything both email templates need.
// LEFT JOIN: guest bookings have no users row, so contact_* is the only source for them.
const BOOKING_DETAILS_SQL = `
  SELECT
    a.id,
    a.start_time,
    a.end_time,
    a.status,
    a.notes,
    a.created_at,
    a.manage_token,
    a.client_id,
    COALESCE(a.contact_name, u.full_name)  AS client_name,
    COALESCE(a.contact_email, u.email)     AS client_email,
    COALESCE(a.contact_phone, u.phone)     AS client_phone,
    s.id         AS service_id,
    s.name       AS service_name,
    s.duration_minutes,
    s.price_cents
  FROM appointments a
  LEFT JOIN users    u ON u.id = a.client_id
  JOIN      services s ON s.id = a.service_id
  WHERE a.id = $1
`;

function parseStart(startTime) {
  const start = new Date(startTime);
  if (!startTime || Number.isNaN(start.getTime())) {
    throw new HttpError(400, 'startTime must be a valid ISO 8601 date-time');
  }
  return start;
}

/**
 * Checks that [start, start + service duration) is a bookable, free slot and returns its end.
 * Must run inside a transaction that already holds BOOKING_LOCK_KEY.
 * `excludeId` skips that appointment in the overlap check (used when rescheduling it).
 */
async function assertSlotBookable(client, { service, start, excludeId = null }) {
  const end = new Date(start.getTime() + service.duration_minutes * 60 * 1000);

  // Validate against that weekday's business hours in the salon's local timezone.
  // The slot grid is anchored at opening time, so 09:30 opening with 60-min slots gives 09:30, 10:30, …
  const hoursResult = await client.query(
    `SELECT
       $1::timestamptz > NOW()                                         AS in_future,
       ($1::timestamptz AT TIME ZONE $3)::date
         = (($2::timestamptz - INTERVAL '1 microsecond') AT TIME ZONE $3)::date AS same_day,
       COALESCE(h.is_open, FALSE)                                      AS is_open,
       ($1::timestamptz AT TIME ZONE $3)::time >= h.open_time          AS after_open,
       ($2::timestamptz AT TIME ZONE $3)::time <= h.close_time         AS before_close,
       (EXTRACT(EPOCH FROM ($1::timestamptz AT TIME ZONE $3)::time - h.open_time)::int % ($4 * 60)) = 0 AS on_grid,
       to_char(h.open_time, 'HH24:MI')  AS open_time,
       to_char(h.close_time, 'HH24:MI') AS close_time
     FROM (SELECT 1) one
     LEFT JOIN business_hours h ON h.weekday = EXTRACT(DOW FROM ($1::timestamptz AT TIME ZONE $3))`,
    [start.toISOString(), end.toISOString(), config.salon.timezone, config.salon.slotIntervalMinutes]
  );
  const check = hoursResult.rows[0];
  if (!check.in_future) {
    throw new HttpError(400, 'You cannot book a time in the past');
  }
  if (!check.is_open) {
    throw new HttpError(400, 'The salon is closed on that day');
  }
  if (!check.same_day || !check.after_open || !check.before_close) {
    throw new HttpError(400, `Appointments must fit within business hours (${check.open_time}–${check.close_time})`);
  }
  if (!check.on_grid) {
    throw new HttpError(400, `Start time must be on a ${config.salon.slotIntervalMinutes}-minute boundary`);
  }

  const conflictResult = await client.query(
    `SELECT id
       FROM appointments
      WHERE status IN ${ACTIVE_STATUSES}
        AND ($3::int IS NULL OR id <> $3)
        AND tstzrange(start_time, end_time, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
      FOR UPDATE`,
    [start.toISOString(), end.toISOString(), excludeId]
  );
  if (conflictResult.rows.length > 0) {
    throw new HttpError(409, 'That time slot is no longer available. Please pick another.');
  }

  return end;
}

/**
 * Creates a pending booking with full double-booking protection:
 *  1. BEGIN
 *  2. pg_advisory_xact_lock  -> serializes concurrent bookings (covers the empty-slot "phantom" case)
 *  3. SELECT ... FOR UPDATE  -> locks any overlapping active appointment rows
 *  4. INSERT                 -> exclusion constraint is the final DB-level guarantee
 *  5. SELECT with JOINs      -> client + service data for emails
 *  6. COMMIT (or ROLLBACK on any error)
 * `clientId` is null for guest bookings; `contact` is always required.
 */
async function createBooking({ clientId, serviceId, startTime, notes, contact }) {
  const start = parseStart(startTime);

  return db.withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [BOOKING_LOCK_KEY]);

    // FOR SHARE: the service can't be deactivated/changed mid-booking
    const serviceResult = await client.query(
      `SELECT id, duration_minutes, is_active FROM services WHERE id = $1 FOR SHARE`,
      [serviceId]
    );
    const service = serviceResult.rows[0];
    if (!service || !service.is_active) {
      throw new HttpError(404, 'Service not found or no longer offered');
    }

    const end = await assertSlotBookable(client, { service, start });

    const insertResult = await client.query(
      `INSERT INTO appointments
         (client_id, service_id, start_time, end_time, status, notes, contact_name, contact_email, contact_phone)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8)
       RETURNING id`,
      [
        clientId,
        serviceId,
        start.toISOString(),
        end.toISOString(),
        notes || null,
        contact.fullName,
        contact.email,
        contact.phone,
      ]
    );

    if (clientId) {
      // Accounts created before phone was required: remember the number for next time
      await client.query(`UPDATE users SET phone = $1 WHERE id = $2 AND phone IS NULL`, [contact.phone, clientId]);
    }

    const detailsResult = await client.query(BOOKING_DETAILS_SQL, [insertResult.rows[0].id]);
    return detailsResult.rows[0];
  });
}

/**
 * Returns open start times for a service on a given salon-local date (YYYY-MM-DD).
 * Read-only: the authoritative check happens again inside createBooking / rescheduleBooking.
 * `excludeId` treats that appointment's own slot as free (so a reschedule can see it).
 */
async function getAvailability({ serviceId, date, excludeId = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    throw new HttpError(400, 'date must be in YYYY-MM-DD format');
  }

  const serviceResult = await db.query(
    'SELECT id, duration_minutes FROM services WHERE id = $1 AND is_active = TRUE',
    [serviceId]
  );
  const service = serviceResult.rows[0];
  if (!service) {
    throw new HttpError(404, 'Service not found');
  }

  const { rows } = await db.query(
    `WITH bounds AS (
       SELECT ($1::date + h.open_time)  AT TIME ZONE $2 AS open_at,
              ($1::date + h.close_time) AT TIME ZONE $2 AS close_at
         FROM business_hours h
        WHERE h.weekday = EXTRACT(DOW FROM $1::date) AND h.is_open
     ),
     slots AS (
       SELECT slot AS start_time, slot + make_interval(mins => $3) AS end_time
         FROM bounds,
              generate_series(open_at, close_at - make_interval(mins => $3), make_interval(mins => $4)) AS slot
     )
     SELECT s.start_time, s.end_time
       FROM slots s
      WHERE s.start_time > NOW()
        AND NOT EXISTS (
          SELECT 1
            FROM appointments a
           WHERE a.status IN ${ACTIVE_STATUSES}
             AND ($5::int IS NULL OR a.id <> $5)
             AND tstzrange(a.start_time, a.end_time, '[)') && tstzrange(s.start_time, s.end_time, '[)')
        )
      ORDER BY s.start_time`,
    [date, config.salon.timezone, service.duration_minutes, config.salon.slotIntervalMinutes, excludeId]
  );

  return {
    date,
    serviceId: service.id,
    durationMinutes: service.duration_minutes,
    timezone: config.salon.timezone,
    slots: rows,
  };
}

async function getBookingById(id) {
  const { rows } = await db.query(BOOKING_DETAILS_SQL, [id]);
  return rows[0] || null;
}

// The manage link is the customer's only credential for a guest booking: treat it like a password
async function getBookingByToken(token) {
  if (!MANAGE_TOKEN_RE.test(String(token || ''))) {
    throw new HttpError(404, 'Booking not found');
  }
  const { rows } = await db.query('SELECT id FROM appointments WHERE manage_token = $1', [token]);
  if (!rows[0]) {
    throw new HttpError(404, 'Booking not found');
  }
  return getBookingById(rows[0].id);
}

/** Locks the appointment row by id or manage token, or throws 404 */
async function lockAppointment(client, { appointmentId, token }) {
  if (token !== undefined && !MANAGE_TOKEN_RE.test(String(token || ''))) {
    throw new HttpError(404, 'Booking not found');
  }
  const { rows } = await client.query(
    `SELECT id, client_id, service_id, status, start_time, end_time
       FROM appointments
      WHERE ${token !== undefined ? 'manage_token = $1' : 'id = $1'}
      FOR UPDATE`,
    [token !== undefined ? token : appointmentId]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Booking not found');
  }
  return rows[0];
}

/**
 * Cancels a booking, identified either by id (logged-in owner or admin) or by manage token (anyone holding the link).
 * Customers can only cancel future bookings; admins can cancel any.
 * Locked with FOR UPDATE so a concurrent status change can't interleave.
 */
async function cancelBooking({ appointmentId, token, user = null }) {
  const isAdmin = user?.role === 'admin';

  return db.withTransaction(async (client) => {
    const appt = await lockAppointment(client, { appointmentId, token });

    if (token === undefined && !isAdmin && appt.client_id !== user?.id) {
      throw new HttpError(404, 'Booking not found');
    }
    if (appt.status === 'cancelled') {
      throw new HttpError(400, 'Appointment is already cancelled');
    }
    if (appt.status === 'completed') {
      throw new HttpError(400, 'Completed appointments cannot be cancelled');
    }
    if (!isAdmin && new Date(appt.start_time) <= new Date()) {
      throw new HttpError(400, 'Past appointments cannot be cancelled');
    }

    await client.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [appt.id]);
    const details = await client.query(BOOKING_DETAILS_SQL, [appt.id]);
    return details.rows[0];
  });
}

/**
 * Moves an upcoming booking (found by manage token) to a new start time.
 * Same lock + validation as a new booking; the booking goes back to 'pending'
 * because the salon has to approve the new time.
 */
async function rescheduleBooking({ token, startTime }) {
  const start = parseStart(startTime);

  return db.withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [BOOKING_LOCK_KEY]);
    const appt = await lockAppointment(client, { token });

    if (!['pending', 'confirmed'].includes(appt.status)) {
      throw new HttpError(400, `A ${appt.status} appointment cannot be rescheduled`);
    }
    if (new Date(appt.start_time) <= new Date()) {
      throw new HttpError(400, 'Past appointments cannot be rescheduled');
    }
    if (start.getTime() === new Date(appt.start_time).getTime()) {
      throw new HttpError(400, 'Pick a different time from your current booking');
    }

    const serviceResult = await client.query(
      `SELECT id, duration_minutes, is_active FROM services WHERE id = $1 FOR SHARE`,
      [appt.service_id]
    );
    const service = serviceResult.rows[0];
    if (!service || !service.is_active) {
      throw new HttpError(400, 'This service is no longer offered. Please cancel and book a different one.');
    }

    const end = await assertSlotBookable(client, { service, start, excludeId: appt.id });

    await client.query(
      `UPDATE appointments SET start_time = $1, end_time = $2, status = 'pending' WHERE id = $3`,
      [start.toISOString(), end.toISOString(), appt.id]
    );
    const details = await client.query(BOOKING_DETAILS_SQL, [appt.id]);
    return { booking: details.rows[0], previousStart: appt.start_time };
  });
}

/**
 * Admin status change. Re-activating a cancelled booking goes through the same
 * lock + conflict check as a new booking so it can't overlap a newer one.
 * Returns the booking plus the status it had before, so callers can tell whether it changed.
 */
async function updateBookingStatus({ appointmentId, status }) {
  const allowed = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!allowed.includes(status)) {
    throw new HttpError(400, `status must be one of: ${allowed.join(', ')}`);
  }

  return db.withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [BOOKING_LOCK_KEY]);
    const appt = await lockAppointment(client, { appointmentId });

    const becomingActive = ['pending', 'confirmed'].includes(status) && !['pending', 'confirmed'].includes(appt.status);
    if (becomingActive) {
      const conflict = await client.query(
        `SELECT id
           FROM appointments
          WHERE id <> $1
            AND status IN ${ACTIVE_STATUSES}
            AND tstzrange(start_time, end_time, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
          FOR UPDATE`,
        [appt.id, appt.start_time, appt.end_time]
      );
      if (conflict.rows.length > 0) {
        throw new HttpError(409, 'Cannot re-activate: that time slot has since been booked');
      }
    }

    await client.query('UPDATE appointments SET status = $1 WHERE id = $2', [status, appt.id]);
    const details = await client.query(BOOKING_DETAILS_SQL, [appt.id]);
    return { booking: details.rows[0], previousStatus: appt.status };
  });
}

module.exports = {
  BOOKING_DETAILS_SQL,
  createBooking,
  getAvailability,
  getBookingById,
  getBookingByToken,
  cancelBooking,
  rescheduleBooking,
  updateBookingStatus,
};
