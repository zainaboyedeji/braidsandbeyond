const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/email');
const { HttpError, asyncHandler, parseContact } = require('../utils/http');

const router = express.Router();

const PUBLIC_USER_FIELDS = 'id, full_name, email, phone, role, created_at';

const RESET_TTL_MINUTES = 60;
// One reset email per account per minute, so the form can't be used to flood someone's inbox
const RESET_COOLDOWN_SECONDS = 60;

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { fullName, email, phone } = parseContact(req.body);
    const password = req.body.password || '';
    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
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

// POST /api/auth/forgot-password  { email }
// Always answers the same way, so it can't be used to find out which emails have accounts.
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) throw new HttpError(400, 'Email is required');

    const { rows } = await db.query('SELECT id, full_name, email FROM users WHERE LOWER(email) = $1', [email]);
    const user = rows[0];
    if (user) {
      const recent = await db.query(
        `SELECT 1 FROM password_resets WHERE user_id = $1 AND created_at > NOW() - make_interval(secs => $2)`,
        [user.id, RESET_COOLDOWN_SECONDS]
      );
      if (recent.rows.length === 0) {
        const token = crypto.randomBytes(32).toString('hex');
        // A new link replaces any older ones
        await db.withTransaction(async (client) => {
          await client.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);
          await client.query(
            `INSERT INTO password_resets (user_id, token_hash, expires_at)
             VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
            [user.id, hashResetToken(token), RESET_TTL_MINUTES]
          );
        });
        // Not awaited: answering at the same speed either way keeps account existence private
        sendPasswordResetEmail(user, `${config.publicUrl}/reset-password/${token}`).catch((err) => {
          console.error(`Password reset email to user #${user.id} failed:`, err.message);
        });
      }
    }

    res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
  })
);

// POST /api/auth/reset-password  { token, password }
// Sets the new password, uses up the link and logs the user in.
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const token = String(req.body.token || '');
    const password = req.body.password || '';
    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `DELETE FROM password_resets
          WHERE token_hash = $1 AND expires_at > NOW()
          RETURNING user_id`,
        [hashResetToken(token)]
      );
      if (!rows[0]) {
        throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.');
      }
      const updated = await client.query(
        `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING ${PUBLIC_USER_FIELDS}`,
        [passwordHash, rows[0].user_id]
      );
      await client.query('DELETE FROM password_resets WHERE user_id = $1', [rows[0].user_id]);
      return updated.rows[0];
    });

    res.json({ token: signToken(user), user });
  })
);

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
