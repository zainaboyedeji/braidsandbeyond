const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const bookingService = require('../services/bookingService');
const { sendStatusEmail } = require('../services/email');
const { sendConfirmationWhatsApp } = require('../services/whatsapp');
const { getBusinessHours, setBusinessHours } = require('../services/businessHours');
const { getPickupVehicles, setPickupVehicles } = require('../services/pickup');
const { HttpError, asyncHandler, parseId } = require('../utils/http');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// GET /api/admin/appointments?date=2026-10-20&status=confirmed
// date is a salon-local calendar day; omit it to get all upcoming appointments
router.get(
  '/appointments',
  asyncHandler(async (req, res) => {
    const { date, status } = req.query;
    const params = [];
    const where = [];

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
      params.push(date, config.salon.timezone);
      where.push(`(a.start_time AT TIME ZONE $2)::date = $1::date`);
    } else {
      where.push(`a.start_time >= NOW() - INTERVAL '1 day'`);
    }

    if (status) {
      const allowed = ['pending', 'confirmed', 'cancelled', 'completed'];
      if (!allowed.includes(status)) throw new HttpError(400, `status must be one of: ${allowed.join(', ')}`);
      params.push(status);
      where.push(`a.status = $${params.length}`);
    }

    const { rows } = await db.query(
      `SELECT a.id, a.start_time, a.end_time, a.status, a.notes, a.created_at,
              a.client_id,
              COALESCE(a.contact_name, u.full_name) AS client_name,
              COALESCE(a.contact_email, u.email)    AS client_email,
              COALESCE(a.contact_phone, u.phone)    AS client_phone,
              s.id AS service_id, s.name AS service_name, s.duration_minutes, s.price_cents,
              a.pickup_hours, a.pickup_price_cents, a.pickup_address,
              pv.tier AS pickup_tier, pv.name AS pickup_vehicle_name
         FROM appointments a
         LEFT JOIN users u ON u.id = a.client_id
         JOIN services s ON s.id = a.service_id
         LEFT JOIN pickup_vehicles pv ON pv.id = a.pickup_vehicle_id
        WHERE ${where.join(' AND ')}
        ORDER BY a.start_time ASC`,
      params
    );
    res.json({ appointments: rows });
  })
);

// PATCH /api/admin/appointments/:id/status  { status }
router.patch(
  '/appointments/:id/status',
  asyncHandler(async (req, res) => {
    const appointmentId = parseId(req.params.id);
    const { booking, previousStatus } = await bookingService.updateBookingStatus({
      appointmentId,
      status: req.body.status,
    });

    // Let the customer know when the salon confirms or cancels. Committed already, so send failures are non-fatal.
    let emailSent = false;
    let whatsappSent = false;
    if (booking.status !== previousStatus) {
      [emailSent, whatsappSent] = await Promise.all([
        sendStatusEmail(booking).catch((err) => {
          console.error(`Booking #${booking.id} status saved but email sending failed:`, err.message);
          return false;
        }),
        sendConfirmationWhatsApp(booking).catch((err) => {
          console.error(`Booking #${booking.id} status saved but WhatsApp sending failed:`, err.message);
          return false;
        }),
      ]);
    }
    res.json({ booking, emailSent, whatsappSent });
  })
);

// GET /api/admin/stats
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE (a.start_time AT TIME ZONE $1)::date = (NOW() AT TIME ZONE $1)::date
                            AND a.status IN ('pending', 'confirmed'))                      AS today_count,
         COUNT(*) FILTER (WHERE a.start_time >= NOW() AND a.status IN ('pending', 'confirmed')) AS upcoming_count,
         COUNT(*) FILTER (WHERE a.start_time >= NOW() AND a.status = 'pending')                 AS pending_count,
         COALESCE(SUM(s.price_cents + COALESCE(a.pickup_price_cents, 0))
                  FILTER (WHERE a.status = 'completed'), 0)                              AS revenue_cents,
         -- Registered clients plus guests (counted once per email address)
         (SELECT COUNT(*) FROM (
            SELECT LOWER(email) FROM users WHERE role = 'client'
            UNION
            SELECT LOWER(contact_email) FROM appointments WHERE client_id IS NULL
          ) clients)                                                                      AS client_count
       FROM appointments a
       JOIN services s ON s.id = a.service_id`,
      [config.salon.timezone]
    );
    const r = rows[0];
    res.json({
      todayCount: Number(r.today_count),
      upcomingCount: Number(r.upcoming_count),
      pendingCount: Number(r.pending_count),
      revenueCents: Number(r.revenue_cents),
      clientCount: Number(r.client_count),
    });
  })
);

// GET /api/admin/business-hours
router.get(
  '/business-hours',
  asyncHandler(async (req, res) => {
    res.json({ hours: await getBusinessHours() });
  })
);

// PUT /api/admin/business-hours  { hours: [{ weekday, isOpen, openTime, closeTime }, ...7] }
router.put(
  '/business-hours',
  asyncHandler(async (req, res) => {
    res.json({ hours: await setBusinessHours(req.body.hours) });
  })
);

// GET /api/admin/pickup-vehicles  (includes switched-off ones)
router.get(
  '/pickup-vehicles',
  asyncHandler(async (req, res) => {
    res.json({ vehicles: await getPickupVehicles() });
  })
);

// PUT /api/admin/pickup-vehicles  { vehicles: [{ id, name, price6hCents, price12hCents, isActive }, ...] }
router.put(
  '/pickup-vehicles',
  asyncHandler(async (req, res) => {
    res.json({ vehicles: await setPickupVehicles(req.body.vehicles) });
  })
);

module.exports = router;
