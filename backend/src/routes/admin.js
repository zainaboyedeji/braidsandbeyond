const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const bookingService = require('../services/bookingService');
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
              u.id AS client_id, u.full_name AS client_name, u.email AS client_email, u.phone AS client_phone,
              s.id AS service_id, s.name AS service_name, s.duration_minutes, s.price_cents
         FROM appointments a
         JOIN users u    ON u.id = a.client_id
         JOIN services s ON s.id = a.service_id
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
    const booking = await bookingService.updateBookingStatus({ appointmentId, status: req.body.status });
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
         COALESCE(SUM(s.price_cents) FILTER (WHERE a.status = 'completed'), 0)            AS revenue_cents,
         (SELECT COUNT(*) FROM users WHERE role = 'client')                               AS client_count
       FROM appointments a
       JOIN services s ON s.id = a.service_id`,
      [config.salon.timezone]
    );
    const r = rows[0];
    res.json({
      todayCount: Number(r.today_count),
      upcomingCount: Number(r.upcoming_count),
      revenueCents: Number(r.revenue_cents),
      clientCount: Number(r.client_count),
    });
  })
);

module.exports = router;
