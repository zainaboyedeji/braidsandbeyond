// Usage: npm run db:reset
// Deletes ALL user accounts (admins + clients) and ALL bookings. Keeps services, opening hours and pickup vehicles.
// Asks you to type the database host before deleting anything. Create a new admin afterwards with db:admin.
const path = require('path');
const readline = require('readline/promises');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const host = new URL(process.env.DATABASE_URL).hostname;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT (SELECT COUNT(*) FROM users)::int AS users,
              (SELECT COUNT(*) FROM users WHERE role = 'admin')::int AS admins,
              (SELECT COUNT(*) FROM appointments)::int AS bookings`
    );
    const { users, admins, bookings } = rows[0];
    console.log(`Database: ${host}`);
    console.log(`This permanently deletes ${users} account(s) (${admins} admin) and ${bookings} booking(s).`);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Type the database host to confirm: `);
    rl.close();
    if (answer.trim() !== host) {
      console.log('Cancelled. Nothing was deleted.');
      return;
    }

    await client.query('TRUNCATE password_resets, appointments, users RESTART IDENTITY');
    console.log('✔ All accounts and bookings deleted. Now create an admin: npm run db:admin -- "Name" email "Password"');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
