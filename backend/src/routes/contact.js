const express = require('express');
const { sendContactMessage } = require('../services/email');
const { EMAIL_RE, HttpError, asyncHandler } = require('../utils/http');
const { createRateLimiter } = require('../utils/rateLimit');

const router = express.Router();

// Simple flood guard: a handful of messages per visitor per hour is plenty for a contact form
const tooMany = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

// POST /api/contact  { name, email, phone?, message, website? }
// Emails the salon; replying to that email goes straight to the client.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    // "website" is a hidden field people never see; bots that fill it in get a quiet "sent"
    if (req.body.website) return res.json({ sent: true });

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const message = String(req.body.message || '').trim();
    if (name.length < 2 || name.length > 120) throw new HttpError(400, 'Please enter your name');
    if (!EMAIL_RE.test(email) || email.length > 255) throw new HttpError(400, 'Please enter a valid email address');
    if (phone.length > 30) throw new HttpError(400, 'Phone number is too long');
    if (message.length < 5 || message.length > 3000) {
      throw new HttpError(400, 'Please write a message (up to 3000 characters)');
    }
    if (tooMany(req.ip)) throw new HttpError(429, 'Too many messages. Please try again later or call us.');

    try {
      await sendContactMessage({ name, email, phone, message });
    } catch (err) {
      console.error('Contact message email failed:', err.message);
      throw new HttpError(502, "We couldn't send your message. Please try again or call us.");
    }
    res.json({ sent: true });
  })
);

module.exports = router;
