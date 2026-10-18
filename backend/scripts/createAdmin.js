// Usage: npm run db:admin -- "Owner Name" owner@yoursalon.com "StrongPassword123"
const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const [fullName, email, password] = process.argv.slice(2);
  if (!fullName || !email || !password) {
    console.error('Usage: npm run db:admin -- "Owner Name" owner@yoursalon.com "StrongPassword123"');
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
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Create admin failed:', err.message);
  process.exit(1);
});
