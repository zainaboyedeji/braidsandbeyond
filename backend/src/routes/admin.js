const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const bookingService = require('../services/bookingService');
const { sendStatusEmail } = require('../services/email');
const { sendConfirmationWhatsApp, confirmationLink } = require('../services/whatsapp');
const { refundDeposit } = require('../services/payments');
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

    await bookingService.releaseExpiredHolds(db);
    const { rows } = await db.query(
      `SELECT a.id, a.start_time, a.end_time, a.status, a.notes, a.created_at,
              a.client_id, a.manage_token,
              COALESCE(a.contact_name, u.full_name) AS client_name,
              COALESCE(a.contact_email, u.email)    AS client_email,
              COALESCE(a.contact_phone, u.phone)    AS client_phone,
              ${bookingService.BOOKED_SERVICE_SQL},
              a.pickup_hours, a.pickup_price_cents, a.pickup_address,
              pv.tier AS pickup_tier, pv.name AS pickup_vehicle_name,
              a.deposit_cents, a.deposit_status, a.payment_method, a.refund_cents
         FROM appointments a
         LEFT JOIN users u ON u.id = a.client_id
         JOIN services s ON s.id = a.service_id
         LEFT JOIN pickup_vehicles pv ON pv.id = a.pickup_vehicle_id
        WHERE ${where.join(' AND ')}
        ORDER BY a.start_time ASC`,
      params
    );
    const appointments = rows.map(({ manage_token, ...a }) => ({
      ...a,
      whatsapp_link: a.status === 'confirmed' ? confirmationLink({ ...a, manage_token }) : null,
    }));
    res.json({ appointments });
  })
);

// PATCH /api/admin/appointments/:id/status  { status }
router.patch(
  '/appointments/:id/status',
  asyncHandler(async (req, res) => {
    const appointmentId = parseId(req.params.id);
    const updated = await bookingService.updateBookingStatus({
      appointmentId,
      status: req.body.status,
    });
    const { previousStatus } = updated;
    let { booking } = updated;

    // The salon cancelling gives the client their whole deposit back
    if (booking.status === 'cancelled' && previousStatus !== 'cancelled' && booking.deposit_status === 'paid') {
      booking = await refundDeposit(booking, booking.deposit_cents);
    }

    // Let the customer know when the salon confirms or cancels. Committed already, so send failures are non-fatal.
    let emailSent = false;
    let whatsapp = { sent: false };
    if (booking.status !== previousStatus) {
      [emailSent, whatsapp] = await Promise.all([
        sendStatusEmail(booking).catch((err) => {
          console.error(`Booking #${booking.id} status saved but email sending failed:`, err.message);
          return false;
        }),
        sendConfirmationWhatsApp(booking).catch((err) => {
          console.error(`Booking #${booking.id} status saved but WhatsApp sending failed:`, err.message);
          return { sent: false, reason: err.message };
        }),
      ]);
      if (!whatsapp.sent && booking.status === 'confirmed') whatsapp.link = confirmationLink(booking);
      if (whatsapp.reason) console.warn(`Booking #${booking.id}: no WhatsApp sent, ${whatsapp.reason}`);
    }
    res.json({ booking, emailSent, whatsapp });
  })
);

// PATCH /api/admin/appointments/:id/deposit  { action: 'received' | 'refunded' }
// For money that moves outside Paystack: a bank transfer deposit arriving, or a refund sent by hand
router.patch(
  '/appointments/:id/deposit',
  asyncHandler(async (req, res) => {
    const booking = await bookingService.recordDepositAction({
      appointmentId: parseId(req.params.id),
      action: req.body.action,
    });
    res.json({ booking });
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
         COALESCE(SUM(COALESCE(a.service_price_cents, s.price_cents) + COALESCE(a.pickup_price_cents, 0))
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
