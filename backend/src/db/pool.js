const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error('FATAL: DATABASE_URL is not set. See .env.example');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 10,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL pool error', err);
});

module.exports = { pool };
