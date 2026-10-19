const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { HttpError, asyncHandler, parseId } = require('../utils/http');

const router = express.Router();

const SERVICE_FIELDS =
  'id, name, description, duration_minutes, price_cents, is_active, image_path, created_at, updated_at';
// Same columns, qualified for the UPDATE ... FROM queries below
const SERVICE_FIELDS_S = SERVICE_FIELDS.split(', ')
  .map((f) => `s.${f}`)
  .join(', ');

const IMAGE_DIR = path.join(config.uploadsDir, 'services');
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_IMAGE_MB = 5;

fs.mkdirSync(IMAGE_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: IMAGE_DIR,
    // Random name: never trust the client's filename
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + IMAGE_TYPES[file.mimetype]),
  }),
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(new HttpError(400, 'Image must be a JPG, PNG or WebP file'));
  },
});

// Runs multer and turns its errors (e.g. file too large) into 400s
function uploadImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return next(
        new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? `Image must be under ${MAX_IMAGE_MB} MB` : err.message)
      );
    }
    return next(err);
  });
}

function removeImageFile(imagePath) {
  if (!imagePath) return;
  const file = path.join(IMAGE_DIR, path.basename(imagePath));
  fs.promises.unlink(file).catch(() => {});
}

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

// POST /api/services/:id/image  (admin, multipart/form-data with field "image")
router.post(
  '/:id/image',
  requireAuth,
  requireAdmin,
  uploadImage,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose an image to upload');
    const id = parseId(req.params.id);
    const newPath = `/uploads/services/${req.file.filename}`;

    const { rows } = await db
      .query(
        `UPDATE services s SET image_path = $1
           FROM (SELECT image_path FROM services WHERE id = $2 FOR UPDATE) old
          WHERE s.id = $2
          RETURNING old.image_path AS old_image_path, ${SERVICE_FIELDS_S}`,
        [newPath, id]
      )
      .catch((err) => {
        removeImageFile(newPath);
        throw err;
      });
    if (!rows[0]) {
      removeImageFile(newPath);
      throw new HttpError(404, 'Service not found');
    }

    const { old_image_path: oldPath, ...service } = rows[0];
    removeImageFile(oldPath);
    res.json({ service });
  })
);

// DELETE /api/services/:id/image  (admin)
router.delete(
  '/:id/image',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await db.query(
      `UPDATE services s SET image_path = NULL
         FROM (SELECT image_path FROM services WHERE id = $1 FOR UPDATE) old
        WHERE s.id = $1
        RETURNING old.image_path AS old_image_path, ${SERVICE_FIELDS_S}`,
      [id]
    );
    if (!rows[0]) throw new HttpError(404, 'Service not found');

    const { old_image_path: oldPath, ...service } = rows[0];
    removeImageFile(oldPath);
    res.json({ service });
  })
);

module.exports = router;
