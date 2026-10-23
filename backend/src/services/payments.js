const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { HttpError } = require('../utils/http');
const { markDepositPaid } = require('./bookingService');
const { sendBookingEmails } = require('./email');

const PAYSTACK_API = 'https://api.paystack.co';

// Amounts are stored in the currency's smallest unit (kobo for NGN), which is what Paystack expects
async function paystack(method, path, body) {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.payments.paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    throw new Error(`Paystack ${res.status}: ${data.message || res.statusText}`);
  }
  return data.data;
}

/**
 * Starts a Paystack checkout for the booking's deposit and returns the page to send the client to.
 * Paystack sends them back to /payment/callback?reference=… when they're done.
 */
async function startDepositPayment(booking) {
  const reference = `bb-${booking.id}-${crypto.randomBytes(6).toString('hex')}`;
  const checkout = await paystack('POST', '/transaction/initialize', {
    email: booking.client_email,
    amount: booking.deposit_cents,
    currency: config.salon.currency,
    reference,
    callback_url: `${config.publicUrl}/payment/callback`,
    metadata: {
      appointment_id: booking.id,
      cancel_action: `${config.publicUrl}/manage/${booking.manage_token}`,
    },
  });
  await db.query('UPDATE appointments SET payment_reference = $1 WHERE id = $2', [reference, booking.id]);
  return checkout.authorization_url;
}

/**
 * Sends `amountCents` of a paid deposit back to the client and records the outcome.
 * A zero amount (late cancellation with no refund) just marks the deposit as kept.
 * Bank transfer deposits can't be refunded through Paystack: they're marked 'refund_due' for the salon.
 * Never throws: a failed refund is saved as 'refund_failed' so the salon can do it by hand.
 */
async function refundDeposit(booking, amountCents) {
  let status = 'forfeited';
  if (amountCents > 0 && booking.payment_method === 'transfer') {
    status = 'refund_due';
  } else if (amountCents > 0) {
    try {
      await paystack('POST', '/refund', { transaction: booking.payment_reference, amount: amountCents });
      status = amountCents < booking.deposit_cents ? 'partially_refunded' : 'refunded';
    } catch (err) {
      console.error(`Refund of booking #${booking.id} deposit failed:`, err.message);
      status = 'refund_failed';
    }
  }
  await db.query('UPDATE appointments SET deposit_status = $1, refund_cents = $2 WHERE id = $3', [
    status,
    amountCents,
    booking.id,
  ]);
  return { ...booking, deposit_status: status, refund_cents: amountCents };
}

/**
 * Checks a payment with Paystack and, if it succeeded, marks the deposit paid and sends the booking emails.
 * Safe to call more than once for the same payment (redirect + webhook).
 */
async function completeDepositPayment(reference) {
  if (!/^[\w-]{1,100}$/.test(String(reference || ''))) {
    throw new HttpError(400, 'Invalid payment reference');
  }
  const payment = await paystack('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  const appointmentId = Number(payment.metadata?.appointment_id);
  if (!appointmentId) throw new HttpError(404, 'Booking not found for this payment');
  if (payment.status !== 'success') {
    // The manage token lets the client retry the payment (only someone holding the reference gets it)
    const { rows } = await db.query('SELECT manage_token FROM appointments WHERE id = $1', [appointmentId]);
    return { paid: false, paymentStatus: payment.status, manageToken: rows[0]?.manage_token };
  }
  if (payment.currency !== config.salon.currency) {
    throw new HttpError(400, 'Payment was made in the wrong currency');
  }

  let { booking, newlyPaid, lateForSlot } = await markDepositPaid({
    appointmentId,
    reference,
    paidCents: payment.amount,
  });

  let emailsSent = false;
  if (lateForSlot) {
    // The slot was released before the money came in: give it all back
    booking = await refundDeposit(booking, booking.deposit_cents);
  } else if (newlyPaid) {
    emailsSent = await sendBookingEmails(booking)
      .then(() => true)
      .catch((err) => {
        console.error(`Booking #${booking.id} paid but email sending failed:`, err.message);
        return false;
      });
  }
  return { paid: true, booking, expired: booking.status === 'cancelled', emailsSent };
}

/**
 * Safety net for payments that neither the redirect back nor a webhook reported (the client closed the tab,
 * or the Paystack account's one webhook URL belongs to another site): asks Paystack about recent unpaid
 * bookings. server.js runs this every few minutes.
 */
async function reconcileUnpaidDeposits() {
  const { rows } = await db.query(
    `SELECT payment_reference
       FROM appointments
      WHERE deposit_status = 'unpaid'
        AND payment_reference IS NOT NULL
        AND created_at > NOW() - make_interval(mins => $1)`,
    // A while past the hold, so a payment that only just made it is still found (and refunded)
    [config.payments.holdMinutes + 60]
  );
  for (const { payment_reference: reference } of rows) {
    await completeDepositPayment(reference).catch((err) => {
      console.error(`Checking payment ${reference} failed:`, err.message);
    });
  }
}

function isValidWebhook(rawBody, signature) {
  if (!rawBody || !signature) return false;
  const expected = crypto.createHmac('sha512', config.payments.paystackSecretKey).update(rawBody).digest('hex');
  const given = String(signature);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

module.exports = {
  startDepositPayment,
  refundDeposit,
  completeDepositPayment,
  reconcileUnpaidDeposits,
  isValidWebhook,
};
