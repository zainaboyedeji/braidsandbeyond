const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { sendBookingEmails, sendRescheduleEmails, sendCustomerCancelledEmail } = require('../services/email');
const bookingService = require('../services/bookingService');
const { parsePickup } = require('../services/pickup');
const { HttpError, asyncHandler, parseId, parseContact } = require('../utils/http');

const router = express.Router();

// The change is COMMITTED before this runs, so an email failure must not undo it
async function trySend(label, send) {
  try {
    await send();
    return true;
  } catch (err) {
    console.error(`${label} saved but email sending failed:`, err.message);
    return false;
  }
}

// GET /api/appointments/availability?serviceId=1&date=2026-10-20  (public)
router.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const serviceId = parseId(req.query.serviceId, 'serviceId');
    const result = await bookingService.getAvailability({ serviceId, date: req.query.date });
    res.json(result);
  })
);

// POST /api/appointments  { serviceId, startTime, notes?, contact: { fullName, email, phone }, pickup?: { vehicleId, hours, address } }
// Signing in is optional: guests book with just their contact details.
router.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const serviceId = parseId(req.body.serviceId, 'serviceId');
    const notes = req.body.notes ? String(req.body.notes).trim().slice(0, 500) : null;
    if (!req.body.startTime) {
      throw new HttpError(400, 'startTime is required');
    }
    const contact = parseContact(req.body.contact || {});
    const pickup = parsePickup(req.body.pickup);

    const booking = await bookingService.createBooking({
      clientId: req.user ? req.user.id : null,
      serviceId,
      startTime: req.body.startTime,
      notes,
      contact,
      pickup,
    });

    const emailsSent = await trySend(`Booking #${booking.id}`, () => sendBookingEmails(booking));
    res.status(201).json({ booking, emailsSent });
  })
);

// GET /api/appointments/mine
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT a.id, a.start_time, a.end_time, a.status, a.notes, a.created_at, a.manage_token,
              s.id AS service_id, s.name AS service_name, s.duration_minutes, s.price_cents,
              a.pickup_hours, a.pickup_price_cents, a.pickup_address,
              pv.tier AS pickup_tier, pv.name AS pickup_vehicle_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         LEFT JOIN pickup_vehicles pv ON pv.id = a.pickup_vehicle_id
        WHERE a.client_id = $1
        ORDER BY a.start_time DESC`,
      [req.user.id]
    );
    res.json({ appointments: rows });
  })
);

// ---------- Manage by private link (guests and signed-in customers alike) ----------

// GET /api/appointments/manage/:token
router.get(
  '/manage/:token',
  asyncHandler(async (req, res) => {
    res.json({ booking: await bookingService.getBookingByToken(req.params.token) });
  })
);

// GET /api/appointments/manage/:token/availability?date=2026-10-20
// Same as /availability for the booking's service, but its current slot counts as free
router.get(
  '/manage/:token/availability',
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getBookingByToken(req.params.token);
    const result = await bookingService.getAvailability({
      serviceId: booking.service_id,
      date: req.query.date,
      excludeId: booking.id,
    });
    res.json(result);
  })
);

// PATCH /api/appointments/manage/:token/reschedule  { startTime }
router.patch(
  '/manage/:token/reschedule',
  asyncHandler(async (req, res) => {
    const { booking, previousStart } = await bookingService.rescheduleBooking({
      token: req.params.token,
      startTime: req.body.startTime,
    });
    const emailsSent = await trySend(`Reschedule of booking #${booking.id}`, () =>
      sendRescheduleEmails(booking, previousStart)
    );
    res.json({ booking, emailsSent });
  })
);

// PATCH /api/appointments/manage/:token/cancel
router.patch(
  '/manage/:token/cancel',
  asyncHandler(async (req, res) => {
    const booking = await bookingService.cancelBooking({ token: req.params.token });
    await trySend(`Cancellation of booking #${booking.id}`, () => sendCustomerCancelledEmail(booking));
    res.json({ booking });
  })
);

// PATCH /api/appointments/:id/cancel  (signed-in owner or admin)
router.patch(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const appointmentId = parseId(req.params.id);
    const booking = await bookingService.cancelBooking({ appointmentId, user: req.user });
    if (req.user.role !== 'admin') {
      await trySend(`Cancellation of booking #${booking.id}`, () => sendCustomerCancelledEmail(booking));
    }
    res.json({ booking });
  })
);

module.exports = router;
