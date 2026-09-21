import crypto from "crypto";
import pool from "../config/pg.js";

export const RESET_TOKEN_EXPIRES_MINUTES = Number(process.env.RESET_TOKEN_EXPIRES_MINUTES || 10);

export async function ensureResetTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens (user_id, used_at);
  `);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

// Buat token reset baru (token lama yang belum dipakai ikut dihanguskan).
// Mengembalikan token MENTAH (hanya ini yang dikirim via email, tidak disimpan).
export async function createResetToken(userId) {
  await ensureResetTable();
  await pool.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [userId]);
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000);
  await pool.query(
    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, hashToken(token), expiresAt]
  );
  return { token, expiresAt };
}

// Validasi token (tanpa menandai dipakai) — untuk cek saat halaman dibuka.
export async function checkResetToken(token) {
  await ensureResetTable();
  if (!token) {
    const err = new Error("Token tidak valid");
    err.status = 400;
    throw err;
  }
  const result = await pool.query(
    "SELECT * FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1",
    [hashToken(token)]
  );
  const row = result?.rows?.[0];
  if (!row || row.used_at) {
    const err = new Error("Link reset tidak valid atau sudah dipakai");
    err.status = 400;
    throw err;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const err = new Error("Link reset sudah kedaluwarsa. Minta link baru.");
    err.status = 400;
    throw err;
  }
  return { userId: row.user_id };
}

// Verifikasi + tandai dipakai (atomik) — untuk eksekusi reset.
export async function consumeResetToken(token) {
  const { userId } = await checkResetToken(token);
  const updated = await pool.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL",
    [hashToken(token)]
  );
  if (!updated || updated.rowCount === 0) {
    const err = new Error("Link reset tidak valid atau sudah dipakai");
    err.status = 400;
    throw err;
  }
  return { userId };
}
