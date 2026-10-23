const express = require('express');
const multer = require('multer');
const db = require('../db');
const { saveImage, removeImage } = require('../services/imageStore');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { HttpError, asyncHandler, parseId } = require('../utils/http');

const router = express.Router();

const SERVICE_FIELDS =
  'id, name, description, duration_minutes, price_cents, is_active, image_path, created_at, updated_at';
// Same columns, qualified for the UPDATE ... FROM queries below
const SERVICE_FIELDS_S = SERVICE_FIELDS.split(', ')
  .map((f) => `s.${f}`)
  .join(', ');

// Each service's gallery photos, oldest first: [{ id, image_path }]
const PHOTOS_SQL = `COALESCE(
  (SELECT json_agg(json_build_object('id', p.id, 'image_path', p.image_path) ORDER BY p.position, p.id)
     FROM service_photos p
    WHERE p.service_id = services.id),
  '[]'
) AS photos`;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_MB = 5;
// Gallery photos per service, not counting the cover; also the most that can be uploaded at once
const MAX_GALLERY_PHOTOS = 12;

// Kept in memory (max 5 MB each) and handed to imageStore, which puts it on Cloudinary or local disk
function imageUploader(maxFiles) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: maxFiles },
    fileFilter: (req, file, cb) => {
      if (IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
      else cb(new HttpError(400, 'Image must be a JPG, PNG or WebP file'));
    },
  });
}

// Runs multer and turns its errors (e.g. file too large) into 400s
function withUploadErrors(middleware) {
  return (req, res, next) =>
    middleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const messages = {
          LIMIT_FILE_SIZE: `Each image must be under ${MAX_IMAGE_MB} MB`,
          LIMIT_FILE_COUNT: `Upload at most ${MAX_GALLERY_PHOTOS} photos at a time`,
        };
        return next(new HttpError(400, messages[err.code] || err.message));
      }
      return next(err);
    });
}

const uploadImage = withUploadErrors(imageUploader(1).single('image'));
const uploadPhotos = withUploadErrors(imageUploader(MAX_GALLERY_PHOTOS).array('photos'));

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
      `SELECT ${SERVICE_FIELDS}, ${PHOTOS_SQL} FROM services WHERE is_active = TRUE ORDER BY name`
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
    const { rows } = await db.query(
      `SELECT ${SERVICE_FIELDS}, ${PHOTOS_SQL} FROM services ORDER BY is_active DESC, name`
    );
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

    // Check first so a bad id doesn't leave an orphaned upload on Cloudinary
    const exists = await db.query('SELECT 1 FROM services WHERE id = $1', [id]);
    if (!exists.rows[0]) throw new HttpError(404, 'Service not found');

    let newPath;
    try {
      newPath = await saveImage(req.file);
    } catch (err) {
      console.error('Image upload failed:', err.message);
      throw new HttpError(502, 'Could not store the image. Please try again.');
    }

    const { rows } = await db
      .query(
        `UPDATE services s SET image_path = $1
           FROM (SELECT image_path FROM services WHERE id = $2 FOR UPDATE) old
          WHERE s.id = $2
          RETURNING old.image_path AS old_image_path, ${SERVICE_FIELDS_S}`,
        [newPath, id]
      )
      .catch((err) => {
        removeImage(newPath);
        throw err;
      });
    if (!rows[0]) {
      removeImage(newPath);
      throw new HttpError(404, 'Service not found');
    }

    const { old_image_path: oldPath, ...service } = rows[0];
    removeImage(oldPath);
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
    removeImage(oldPath);
    res.json({ service });
  })
);

// ---------- Gallery ----------

async function servicePhotos(serviceId) {
  const { rows } = await db.query(
    'SELECT id, image_path FROM service_photos WHERE service_id = $1 ORDER BY position, id',
    [serviceId]
  );
  return rows;
}

// POST /api/services/:id/photos  (admin, multipart/form-data with one or more "photos" files)
router.post(
  '/:id/photos',
  requireAuth,
  requireAdmin,
  uploadPhotos,
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) throw new HttpError(400, 'Choose at least one photo to upload');
    const id = parseId(req.params.id);

    const exists = await db.query('SELECT 1 FROM services WHERE id = $1', [id]);
    if (!exists.rows[0]) throw new HttpError(404, 'Service not found');
    const existing = (await servicePhotos(id)).length;
    if (existing + files.length > MAX_GALLERY_PHOTOS) {
      throw new HttpError(
        400,
        `A service can have up to ${MAX_GALLERY_PHOTOS} gallery photos (it has ${existing}). Remove some first.`
      );
    }

    let paths;
    try {
      paths = await Promise.all(files.map((file) => saveImage(file)));
    } catch (err) {
      console.error('Gallery upload failed:', err.message);
      throw new HttpError(502, 'Could not store the photos. Please try again.');
    }

    await db
      .query(
        `INSERT INTO service_photos (service_id, image_path, position)
         SELECT $1, path, (SELECT COALESCE(MAX(position), 0) FROM service_photos WHERE service_id = $1) + ord
           FROM unnest($2::text[]) WITH ORDINALITY AS t(path, ord)`,
        [id, paths]
      )
      .catch((err) => {
        paths.forEach(removeImage);
        throw err;
      });
    res.status(201).json({ photos: await servicePhotos(id) });
  })
);

// DELETE /api/services/:id/photos/:photoId  (admin)
router.delete(
  '/:id/photos/:photoId',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await db.query(
      'DELETE FROM service_photos WHERE id = $1 AND service_id = $2 RETURNING image_path',
      [parseId(req.params.photoId, 'photoId'), id]
    );
    if (!rows[0]) throw new HttpError(404, 'Photo not found');
    removeImage(rows[0].image_path);
    res.json({ photos: await servicePhotos(id) });
  })
);

// POST /api/services/:id/photos/:photoId/cover  (admin)
// Makes a gallery photo the cover; the old cover (if any) takes its place in the gallery
router.post(
  '/:id/photos/:photoId/cover',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const photoId = parseId(req.params.photoId, 'photoId');
    const service = await db.withTransaction(async (client) => {
      const svc = await client.query('SELECT image_path FROM services WHERE id = $1 FOR UPDATE', [id]);
      if (!svc.rows[0]) throw new HttpError(404, 'Service not found');
      const photo = await client.query(
        'SELECT image_path FROM service_photos WHERE id = $1 AND service_id = $2 FOR UPDATE',
        [photoId, id]
      );
      if (!photo.rows[0]) throw new HttpError(404, 'Photo not found');

      const oldCover = svc.rows[0].image_path;
      if (oldCover) {
        await client.query('UPDATE service_photos SET image_path = $1 WHERE id = $2', [oldCover, photoId]);
      } else {
        await client.query('DELETE FROM service_photos WHERE id = $1', [photoId]);
      }
      const updated = await client.query(
        `UPDATE services SET image_path = $1 WHERE id = $2 RETURNING ${SERVICE_FIELDS}`,
        [photo.rows[0].image_path, id]
      );
      return updated.rows[0];
    });
    res.json({ service, photos: await servicePhotos(id) });
  })
);

module.exports = router;
