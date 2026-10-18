const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in backend/.env');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    for (const file of ['schema.sql', 'seed.sql']) {
      const sql = fs.readFileSync(path.resolve(__dirname, '..', 'db', file), 'utf8');
      await client.query(sql);
      console.log(`✔ Ran db/${file}`);
    }
    console.log('Database ready.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Database init failed:', err.message);
  process.exit(1);
});
