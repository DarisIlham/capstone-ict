import 'dotenv/config';
import { Pool } from 'pg';

// Ensure DB_PASS is always a string when passed to pg (avoids SASL errors)
const dbPass = process.env.DB_PASS !== undefined && process.env.DB_PASS !== null
  ? String(process.env.DB_PASS)
  : '';

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: dbPass,
  port: Number(process.env.DB_PORT || 5432),
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export default pool;
