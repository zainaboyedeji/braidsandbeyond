const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendBookingEmails } = require('../services/email');
const bookingService = require('../services/bookingService');
const { HttpError, asyncHandler, parseId, parseContact } = require('../utils/http');

const router = express.Router();

// GET /api/appointments/availability?serviceId=1&date=2026-10-20  (public)
router.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const serviceId = parseId(req.query.serviceId, 'serviceId');
    const result = await bookingService.getAvailability({ serviceId, date: req.query.date });
    res.json(result);
  })
);

// POST /api/appointments  { serviceId, startTime, notes? }
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const serviceId = parseId(req.body.serviceId, 'serviceId');
    const notes = req.body.notes ? String(req.body.notes).trim().slice(0, 500) : null;
    if (!req.body.startTime) {
      throw new HttpError(400, 'startTime is required');
    }
    const contact = parseContact(req.body.contact || {});

    const booking = await bookingService.createBooking({
      clientId: req.user.id,
      serviceId,
      startTime: req.body.startTime,
      notes,
      contact,
    });

    // Booking is COMMITTED at this point. Email failure must not undo it.
    let emailsSent = true;
    try {
      await sendBookingEmails(booking);
    } catch (err) {
      emailsSent = false;
      console.error(`Booking #${booking.id} saved but email sending failed:`, err.message);
    }

    res.status(201).json({ booking, emailsSent });
  })
);

// GET /api/appointments/mine
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT a.id, a.start_time, a.end_time, a.status, a.notes, a.created_at,
              s.id AS service_id, s.name AS service_name, s.duration_minutes, s.price_cents
         FROM appointments a
         JOIN services s ON s.id = a.service_id
        WHERE a.client_id = $1
        ORDER BY a.start_time DESC`,
      [req.user.id]
    );
    res.json({ appointments: rows });
  })
);

// PATCH /api/appointments/:id/cancel
router.patch(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const appointmentId = parseId(req.params.id);
    const booking = await bookingService.cancelBooking({ appointmentId, user: req.user });
    res.json({ booking });
  })
);

module.exports = router;
