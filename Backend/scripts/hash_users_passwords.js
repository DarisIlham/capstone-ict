import pool from '../config/pg.js';
import bcrypt from 'bcryptjs';

async function looksLikeBcryptHash(s) {
  if (!s || typeof s !== 'string') return false;
  return /^\$2[aby]\$/.test(s);
}

async function main() {
  console.log('Scanning users to hash plaintext passwords...');
  const res = await pool.query('SELECT id, email, password FROM users');
  const rows = res.rows || [];
  let updated = 0;

  for (const row of rows) {
    const { id, email, password } = row;
    if (await looksLikeBcryptHash(password)) {
      console.log(`- id=${id} email=${email}: already hashed, skipping.`);
      continue;
    }

    if (!password) {
      console.log(`- id=${id} email=${email}: no password set, skipping.`);
      continue;
    }

    const hashed = await bcrypt.hash(String(password), 10);
    try {
      await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, id]);
    } catch (e) {
      // Fallback if table doesn't have updated_at column
      if (/updated_at/.test(String(e.message || ''))) {
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, id]);
      } else {
        throw e;
      }
    }
    console.log(`- id=${id} email=${email}: password hashed and updated.`);
    updated++;
  }

  console.log(`Done. ${updated} passwords updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error hashing passwords:', err.message || err);
  process.exit(1);
});
