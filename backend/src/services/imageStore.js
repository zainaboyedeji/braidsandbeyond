const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Where service photos live:
 *  - CLOUDINARY_URL set -> Cloudinary (survives redeploys; use this in production)
 *  - otherwise          -> backend/uploads/services on local disk (fine for development)
 *
 * Both return the value stored in services.image_path: a full https URL for Cloudinary,
 * or a relative /uploads/services/... path for local disk.
 */

const LOCAL_DIR = path.join(config.uploadsDir, 'services');
const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

let cloudinary = null;
if (config.cloudinary.enabled) {
  // The SDK reads CLOUDINARY_URL from the environment (already loaded by config.js)
  cloudinary = require('cloudinary').v2;
  cloudinary.config({ secure: true });
} else {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

async function saveImage(file) {
  if (cloudinary) {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: config.cloudinary.folder,
            resource_type: 'image',
            // Shrink huge phone photos once at upload; serve modern formats automatically
            transformation: [{ width: 1600, height: 1600, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }],
          },
          (err, res) => (err ? reject(err) : resolve(res))
        )
        .end(file.buffer);
    });
    return result.secure_url;
  }

  const name = crypto.randomBytes(16).toString('hex') + EXTENSIONS[file.mimetype];
  await fs.promises.writeFile(path.join(LOCAL_DIR, name), file.buffer);
  return `/uploads/services/${name}`;
}

// https://res.cloudinary.com/<cloud>/image/upload/v123/<folder>/<id>.jpg -> "<folder>/<id>"
function cloudinaryPublicId(url) {
  const prefix = `https://res.cloudinary.com/${cloudinary.config().cloud_name}/image/upload/`;
  if (!url.startsWith(prefix)) return null;
  return url
    .slice(prefix.length)
    .replace(/^v\d+\//, '')
    .replace(/\.[a-z0-9]+$/i, '');
}

// Best-effort: a leftover file is harmless, so failures are only logged
async function removeImage(imagePath) {
  if (!imagePath) return;
  try {
    if (imagePath.startsWith('/uploads/')) {
      await fs.promises.unlink(path.join(LOCAL_DIR, path.basename(imagePath)));
    } else if (cloudinary) {
      const publicId = cloudinaryPublicId(imagePath);
      if (publicId) await cloudinary.uploader.destroy(publicId);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Could not delete image ${imagePath}:`, err.message);
  }
}

module.exports = { saveImage, removeImage };
