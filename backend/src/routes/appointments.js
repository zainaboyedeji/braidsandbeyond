const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { sendBookingEmails, sendRescheduleEmails, sendCustomerCancelledEmail } = require('../services/email');
const bookingService = require('../services/bookingService');
const { startDepositPayment, refundDeposit } = require('../services/payments');
const { parsePickup } = require('../services/pickup');
const config = require('../config');
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

// GET /api/appointments/availability?serviceId=1&variantId=3&date=2026-10-20  (public)
// variantId is required for services that have variations
router.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const serviceId = parseId(req.query.serviceId, 'serviceId');
    const variantId = req.query.variantId ? parseId(req.query.variantId, 'variantId') : null;
    const result = await bookingService.getAvailability({ serviceId, variantId, date: req.query.date });
    res.json(result);
  })
);

// POST /api/appointments  { serviceId, variantId?, startTime, notes?, contact: { fullName, email, phone },
//                          pickup?: { vehicleId, hours, address }, paymentMethod?: 'paystack' | 'transfer' }
// Signing in is optional: guests book with just their contact details.
router.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const serviceId = parseId(req.body.serviceId, 'serviceId');
    const variantId = req.body.variantId ? parseId(req.body.variantId, 'variantId') : null;
    const notes = req.body.notes ? String(req.body.notes).trim().slice(0, 500) : null;
    if (!req.body.startTime) {
      throw new HttpError(400, 'startTime is required');
    }
    const contact = parseContact(req.body.contact || {});
    const pickup = parsePickup(req.body.pickup);
    const { methods } = config.payments;
    const paymentMethod = req.body.paymentMethod || methods[0] || null;
    if (methods.length > 0 && !methods.includes(paymentMethod)) {
      throw new HttpError(400, `paymentMethod must be one of: ${methods.join(', ')}`);
    }

    const booking = await bookingService.createBooking({
      clientId: req.user ? req.user.id : null,
      serviceId,
      variantId,
      startTime: req.body.startTime,
      notes,
      contact,
      pickup,
      paymentMethod,
    });

    // Paying online: the emails go out once Paystack confirms the payment (see services/payments.js).
    // Paying by transfer: the emails go out now, with the bank details, and the admin marks the money received.
    if (booking.deposit_status === 'unpaid' && booking.payment_method === 'paystack') {
      let paymentUrl;
      try {
        paymentUrl = await startDepositPayment(booking);
      } catch (err) {
        console.error(`Booking #${booking.id}: could not start payment:`, err.message);
        await bookingService.cancelBooking({ appointmentId: booking.id, user: { role: 'admin' } });
        throw new HttpError(502, "We couldn't start the payment. Please try again in a moment.");
      }
      return res.status(201).json({ booking, paymentUrl });
    }

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
              ${bookingService.BOOKED_SERVICE_SQL},
              a.pickup_hours, a.pickup_price_cents, a.pickup_address,
              pv.tier AS pickup_tier, pv.name AS pickup_vehicle_name,
              a.deposit_cents, a.deposit_status, a.payment_method, a.refund_cents
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
// refundIfCancelled: what the client would get back from their deposit if they cancelled right now
router.get(
  '/manage/:token',
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getBookingByToken(req.params.token);
    const refundIfCancelled = bookingService.refundForCancellation(booking, { byClient: true });
    res.json({ booking, refundIfCancelled });
  })
);

// POST /api/appointments/manage/:token/pay
// Back to Paystack for a booking whose deposit isn't paid yet (e.g. the client closed the payment page)
router.post(
  '/manage/:token/pay',
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getBookingByToken(req.params.token);
    if (booking.deposit_status !== 'unpaid' || booking.payment_method !== 'paystack') {
      throw new HttpError(400, 'This booking has no deposit left to pay online');
    }
    const holdEnds = new Date(booking.created_at).getTime() + config.payments.holdMinutes * 60 * 1000;
    if (booking.status !== 'pending' || Date.now() > holdEnds) {
      throw new HttpError(400, 'The time to pay for this booking has run out. Please book again.');
    }
    res.json({ paymentUrl: await startDepositPayment(booking) });
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
      durationMinutes: booking.duration_minutes,
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

// Cancels, then refunds whatever the cancellation policy allows from a paid deposit
async function cancelAndRefund(params) {
  const { booking, refundCents } = await bookingService.cancelBooking(params);
  return booking.deposit_status === 'paid' ? refundDeposit(booking, refundCents) : booking;
}

// PATCH /api/appointments/manage/:token/cancel
router.patch(
  '/manage/:token/cancel',
  asyncHandler(async (req, res) => {
    const booking = await cancelAndRefund({ token: req.params.token });
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
    const booking = await cancelAndRefund({ appointmentId, user: req.user });
    if (req.user.role !== 'admin') {
      await trySend(`Cancellation of booking #${booking.id}`, () => sendCustomerCancelledEmail(booking));
    }
    res.json({ booking });
  })
);

module.exports = router;
