const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { HttpError, asyncHandler, EMAIL_RE } = require('../utils/http');

const router = express.Router();

const PUBLIC_USER_FIELDS = 'id, full_name, email, phone, role, created_at';

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const fullName = (req.body.fullName || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const phone = (req.body.phone || '').trim() || null;
    const password = req.body.password || '';

    if (fullName.length < 2 || fullName.length > 120) {
      throw new HttpError(400, 'Full name must be 2–120 characters');
    }
    if (!EMAIL_RE.test(email)) {
      throw new HttpError(400, 'A valid email is required');
    }
    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }
    if (phone && phone.length > 30) {
      throw new HttpError(400, 'Phone number is too long');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const { rows } = await db.query(
        `INSERT INTO users (full_name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, 'client')
         RETURNING ${PUBLIC_USER_FIELDS}`,
        [fullName, email, phone, passwordHash]
      );
      const user = rows[0];
      res.status(201).json({ token: signToken(user), user });
    } catch (err) {
      if (err.code === '23505') {
        throw new HttpError(409, 'An account with that email already exists');
      }
      throw err;
    }
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (!email || !password) {
      throw new HttpError(400, 'Email and password are required');
    }

    const { rows } = await db.query(
      `SELECT ${PUBLIC_USER_FIELDS}, password_hash FROM users WHERE LOWER(email) = $1`,
      [email]
    );
    const found = rows[0];
    const valid = found ? await bcrypt.compare(password, found.password_hash) : false;
    if (!valid) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const { password_hash: _omit, ...user } = found;
    res.json({ token: signToken(user), user });
  })
);

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
