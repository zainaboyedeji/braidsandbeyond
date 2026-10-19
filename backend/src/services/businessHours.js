const db = require('../db');
const { HttpError } = require('../utils/http');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// open_time/close_time come back from pg as "09:00:00"; the API speaks "09:00"
const HOURS_SQL = `
  SELECT weekday, is_open, to_char(open_time, 'HH24:MI') AS open_time, to_char(close_time, 'HH24:MI') AS close_time
    FROM business_hours
   ORDER BY weekday`;

async function getBusinessHours() {
  const { rows } = await db.query(HOURS_SQL);
  return rows;
}

/**
 * Replaces the whole weekly schedule. Expects exactly one entry per weekday (0 = Sunday … 6 = Saturday):
 * [{ weekday, isOpen, openTime: "HH:MM", closeTime: "HH:MM" }, ...]
 */
async function setBusinessHours(days) {
  if (!Array.isArray(days) || days.length !== 7) {
    throw new HttpError(400, 'Send all 7 days of the week');
  }

  const seen = new Set();
  const clean = days.map((day) => {
    const weekday = Number(day.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || seen.has(weekday)) {
      throw new HttpError(400, 'Each weekday (0–6) must appear exactly once');
    }
    seen.add(weekday);
    if (!TIME_RE.test(day.openTime || '') || !TIME_RE.test(day.closeTime || '')) {
      throw new HttpError(400, 'Times must be in HH:MM format');
    }
    if (day.closeTime <= day.openTime) {
      throw new HttpError(400, 'Closing time must be after opening time');
    }
    return [weekday, Boolean(day.isOpen), day.openTime, day.closeTime];
  });

  return db.withTransaction(async (client) => {
    for (const params of clean) {
      await client.query(
        `INSERT INTO business_hours (weekday, is_open, open_time, close_time)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (weekday) DO UPDATE
           SET is_open = EXCLUDED.is_open, open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time`,
        params
      );
    }
    const { rows } = await client.query(HOURS_SQL);
    return rows;
  });
}

module.exports = { getBusinessHours, setBusinessHours };
