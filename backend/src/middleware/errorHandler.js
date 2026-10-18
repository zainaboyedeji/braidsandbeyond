const config = require('../config');

// Postgres error codes we translate into client-friendly responses
const PG_ERRORS = {
  '23P01': { status: 409, message: 'That time slot was just booked. Please pick another.' },
  '23505': { status: 409, message: 'A record with that value already exists.' },
  '23503': { status: 409, message: 'This record is referenced by other data and cannot be changed.' },
  '22P02': { status: 400, message: 'Invalid input format.' },
  '22007': { status: 400, message: 'Invalid date/time format.' },
  '22008': { status: 400, message: 'Date/time value out of range.' },
};

function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  if (err.code && PG_ERRORS[err.code]) {
    const { status, message } = PG_ERRORS[err.code];
    return res.status(status).json({ error: message });
  }

  console.error(err);
  return res.status(500).json({
    error: 'Internal server error',
    ...(config.nodeEnv !== 'production' && { detail: err.message }),
  });
}

module.exports = { notFound, errorHandler };
