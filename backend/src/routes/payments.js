const express = require('express');
const config = require('../config');
const { completeDepositPayment, isValidWebhook } = require('../services/payments');
const { HttpError, asyncHandler } = require('../utils/http');

const router = express.Router();

router.use((req, res, next) => {
  if (!config.payments.methods.includes('paystack')) {
    return next(new HttpError(404, 'Online payments are not enabled'));
  }
  return next();
});

// GET /api/payments/verify?reference=…
// Called by the page Paystack sends the client back to after paying
router.get(
  '/verify',
  asyncHandler(async (req, res) => {
    res.json(await completeDepositPayment(req.query.reference));
  })
);

// POST /api/payments/webhook  (set this URL in Paystack → Settings → API Keys & Webhooks)
// Catches payments even when the client closes the tab before being redirected back.
// The Paystack account can be shared with another site that forwards its webhooks here
// (same body + x-paystack-signature header): only deposit payments (reference "bb-…") are handled.
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    if (!isValidWebhook(req.rawBody, req.headers['x-paystack-signature'])) {
      throw new HttpError(401, 'Invalid signature');
    }
    // Answer straight away: Paystack retries if it doesn't hear back quickly
    res.sendStatus(200);
    if (req.body.event === 'charge.success' && String(req.body.data?.reference || '').startsWith('bb-')) {
      completeDepositPayment(req.body.data?.reference).catch((err) => {
        console.error(`Paystack webhook for ${req.body.data?.reference} failed:`, err.message);
      });
    }
  })
);

module.exports = router;
