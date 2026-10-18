const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.db.connectionString,
  ssl: config.db.ssl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// An idle client erroring (e.g. DB restart) must not crash the process
pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err.message);
});

/**
 * Runs `work(client)` inside BEGIN/COMMIT on a dedicated client.
 * Any thrown error triggers ROLLBACK and is re-thrown to the caller.
 */
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('ROLLBACK failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  withTransaction,
};
