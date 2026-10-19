const express = require('express');
const cors = require('cors');
const config = require('./config');
const db = require('./db');
const authRoutes = require('./routes/auth');
const serviceRoutes = require('./routes/services');
const appointmentRoutes = require('./routes/appointments');
const adminRoutes = require('./routes/admin');
const { getBusinessHours } = require('./services/businessHours');
const { asyncHandler } = require('./utils/http');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// Public salon settings the frontend needs for display
app.get(
  '/api/config',
  asyncHandler(async (req, res) => {
    const { name, currency, timezone, slotIntervalMinutes } = config.salon;
    const hours = await getBusinessHours();
    res.json({ name, currency, timezone, slotIntervalMinutes, hours });
  })
);

// Uploaded service photos
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d', fallthrough: false }));

app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
