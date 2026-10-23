// Usage: npm run db:admin -- "Owner Name" owner@yoursalon.com "StrongPassword123" [--replace]
// --replace also deletes every other admin account (refuses if any of them has bookings).
const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes('--replace');
  const [fullName, email, password] = args.filter((a) => a !== '--replace');
  if (!fullName || !email || !password) {
    console.error('Usage: npm run db:admin -- "Owner Name" owner@yoursalon.com "StrongPassword123" [--replace]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE users SET full_name = $1, password_hash = $2, role = 'admin' WHERE id = $3`,
        [fullName, passwordHash, existing.rows[0].id]
      );
      console.log(`✔ Existing user ${email} promoted to admin (password reset).`);
    } else {
      await client.query(
        `INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
        [fullName, email.trim().toLowerCase(), passwordHash]
      );
      console.log(`✔ Admin ${email} created.`);
    }

    if (replace) {
      // Deleting a user cascades to their appointments, so never silently drop bookings
      const others = await client.query(
        `SELECT u.id, u.email, COUNT(a.id)::int AS bookings
           FROM users u
           LEFT JOIN appointments a ON a.client_id = u.id
          WHERE u.role = 'admin' AND LOWER(u.email) <> LOWER($1)
          GROUP BY u.id, u.email`,
        [email.trim()]
      );
      const withBookings = others.rows.filter((u) => u.bookings > 0);
      if (withBookings.length > 0) {
        throw new Error(
          `not deleting admins with bookings: ${withBookings.map((u) => `${u.email} (${u.bookings})`).join(', ')}`
        );
      }
      await client.query('DELETE FROM users WHERE id = ANY($1)', [others.rows.map((u) => u.id)]);
      console.log(
        others.rows.length > 0
          ? `✔ Deleted ${others.rows.length} former admin(s): ${others.rows.map((u) => u.email).join(', ')}`
          : '✔ No other admins to delete.'
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Create admin failed:', err.message);
  process.exit(1);
});
