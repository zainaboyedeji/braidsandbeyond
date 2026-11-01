// Usage: npm run db:phones
// Rewrites saved phone numbers ("0801 234 5678", "2348012345678"…) in one international format
// ("+234 801 234 5678"). Numbers that aren't valid mobile numbers are left as they are and listed;
// the admin dashboard marks them. Safe to run again: nothing is deleted and tidy numbers are skipped.
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { normalizePhone } = require('../src/utils/http');

const COLUMNS = [
  { table: 'users', column: 'phone', label: (r) => `account ${r.id}` },
  { table: 'appointments', column: 'contact_phone', label: (r) => `booking #${r.id}` },
];

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    for (const { table, column, label } of COLUMNS) {
      const { rows } = await client.query(`SELECT id, ${column} AS phone FROM ${table} WHERE ${column} IS NOT NULL`);
      let fixed = 0;
      const invalid = [];
      for (const row of rows) {
        const phone = normalizePhone(row.phone);
        if (!phone) invalid.push(`${label(row)}: "${row.phone}"`);
        else if (phone !== row.phone) {
          await client.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [phone, row.id]);
          fixed += 1;
        }
      }
      console.log(`✔ ${table}.${column}: ${fixed} reformatted, ${invalid.length} invalid`);
      invalid.forEach((line) => console.log(`  ⚠ ${line}`));
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Phone clean-up failed:', err.message);
  process.exit(1);
});
