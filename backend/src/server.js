const config = require('./config');
const app = require('./app');
const { pool } = require('./db');
const { verifyEmailTransport } = require('./services/email');
const { reconcileUnpaidDeposits } = require('./services/payments');

const RECONCILE_INTERVAL_MS = 2 * 60 * 1000;

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  verifyEmailTransport();
  console.log(
    config.whatsapp.enabled
      ? '✔ WhatsApp confirmations enabled'
      : '⚠ WhatsApp confirmations off: set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID to enable'
  );
  console.log(
    config.payments.enabled
      ? `✔ Deposits enabled (${config.payments.depositPercent}%), paid by: ${config.payments.methods.join(', ')}`
      : '⚠ Deposits off: set PAYSTACK_SECRET_KEY and/or BANK_* to take a deposit when booking'
  );
  if (config.payments.methods.includes('paystack')) {
    setInterval(() => {
      reconcileUnpaidDeposits().catch((err) => console.error('Payment check failed:', err.message));
    }, RECONCILE_INTERVAL_MS).unref();
  }
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
