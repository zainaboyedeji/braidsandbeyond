const config = require('./config');
const app = require('./app');
const { pool } = require('./db');
const { verifyEmailTransport } = require('./services/email');

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  verifyEmailTransport();
  console.log(
    config.whatsapp.enabled
      ? '✔ WhatsApp confirmations enabled'
      : '⚠ WhatsApp confirmations off: set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID to enable'
  );
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
