const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { HttpError } = require('../utils/http');

function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

// Verifies the JWT, then loads the user from the DB so role changes / deletions apply immediately
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Authentication required'));
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
  }

  try {
    const { rows } = await db.query(
      'SELECT id, full_name, email, phone, role FROM users WHERE id = $1',
      [Number(payload.sub)]
    );
    if (!rows[0]) {
      return next(new HttpError(401, 'Account no longer exists'));
    }
    req.user = rows[0];
    return next();
  } catch (err) {
    return next(err);
  }
}

// Like requireAuth, but lets the request through as a guest (req.user = null) when there is no
// valid token. Used where signing in is optional, e.g. booking.
function optionalAuth(req, res, next) {
  if (!req.headers.authorization) {
    req.user = null;
    return next();
  }
  return requireAuth(req, res, (err) => {
    if (err && err.status === 401) {
      req.user = null;
      return next();
    }
    return next(err);
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(new HttpError(403, 'Admin access required'));
  }
  return next();
}

module.exports = { signToken, requireAuth, optionalAuth, requireAdmin };
