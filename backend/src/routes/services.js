const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { HttpError, asyncHandler, parseId } = require('../utils/http');

const router = express.Router();

const SERVICE_FIELDS = 'id, name, description, duration_minutes, price_cents, is_active, created_at, updated_at';

function validateService(body, { partial = false } = {}) {
  const out = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 120) throw new HttpError(400, 'Name must be 2–120 characters');
    out.name = name;
  }
  if (body.description !== undefined) {
    out.description = String(body.description || '').trim() || null;
  }
  if (!partial || body.durationMinutes !== undefined) {
    const d = Number(body.durationMinutes);
    if (!Number.isInteger(d) || d <= 0 || d > 480) {
      throw new HttpError(400, 'durationMinutes must be an integer between 1 and 480');
    }
    out.duration_minutes = d;
  }
  if (!partial || body.priceCents !== undefined) {
    const p = Number(body.priceCents);
    if (!Number.isInteger(p) || p < 0) throw new HttpError(400, 'priceCents must be a non-negative integer');
    out.price_cents = p;
  }
  if (body.isActive !== undefined) {
    out.is_active = Boolean(body.isActive);
  }
  return out;
}

// GET /api/services  (public: active only)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT ${SERVICE_FIELDS} FROM services WHERE is_active = TRUE ORDER BY name`
    );
    res.json({ services: rows });
  })
);

// GET /api/services/all  (admin: includes inactive)
router.get(
  '/all',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT ${SERVICE_FIELDS} FROM services ORDER BY is_active DESC, name`);
    res.json({ services: rows });
  })
);

// POST /api/services  (admin)
router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const s = validateService(req.body);
    const { rows } = await db.query(
      `INSERT INTO services (name, description, duration_minutes, price_cents, is_active)
       VALUES ($1, $2, $3, $4, COALESCE($5, TRUE))
       RETURNING ${SERVICE_FIELDS}`,
      [s.name, s.description ?? null, s.duration_minutes, s.price_cents, s.is_active ?? null]
    );
    res.status(201).json({ service: rows[0] });
  })
);

// PATCH /api/services/:id  (admin)
router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = validateService(req.body, { partial: true });
    const keys = Object.keys(s);
    if (keys.length === 0) throw new HttpError(400, 'No fields to update');

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const { rows } = await db.query(
      `UPDATE services SET ${setClause} WHERE id = $${keys.length + 1} RETURNING ${SERVICE_FIELDS}`,
      [...keys.map((k) => s[k]), id]
    );
    if (!rows[0]) throw new HttpError(404, 'Service not found');
    res.json({ service: rows[0] });
  })
);

// DELETE /api/services/:id  (admin) - soft delete so past appointments keep their service
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await db.query(
      `UPDATE services SET is_active = FALSE WHERE id = $1 RETURNING ${SERVICE_FIELDS}`,
      [id]
    );
    if (!rows[0]) throw new HttpError(404, 'Service not found');
    res.json({ service: rows[0] });
  })
);

module.exports = router;
