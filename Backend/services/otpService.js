// services/otpService.js
// OTP login 6 digit via email: generate, simpan hash, verifikasi.
// Tabel login_otps dibuat otomatis (IF NOT EXISTS) agar deploy lama
// tidak perlu migrasi manual.
import crypto from "crypto";
import pool from "../config/pg.js";

export const OTP_DIGITS = 6;
export const OTP_EXPIRES_MINUTES = Number(process.env.OTP_EXPIRES_MINUTES || 5);
export const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

export async function ensureOtpTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_otps (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_login_otps_user ON login_otps (user_id, used_at);
  `);
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

export function generateOtpCode(digits = OTP_DIGITS) {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(crypto.randomInt(min, max + 1));
}

export function maskEmail(email) {
  const [local = "", domain = ""] = String(email).split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

// Buat OTP baru (OTP lama yang belum dipakai ikut dihanguskan).
export async function createOtp(userId, email) {
  await ensureOtpTable();
  const code = generateOtpCode(OTP_DIGITS);
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

  await pool.query(
    "UPDATE login_otps SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
    [userId]
  );
  const result = await pool.query(
    `INSERT INTO login_otps (user_id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id, expires_at`,
    [userId, email, hashCode(code), expiresAt.toISOString()]
  );

  return {
    otpId: result.rows[0].id,
    code,
    expiresAt: result.rows[0].expires_at,
  };
}

// Verifikasi OTP. Melempar Error dengan .status untuk respons HTTP.
export async function verifyOtp(otpId, code) {
  await ensureOtpTable();
  const result = await pool.query("SELECT * FROM login_otps WHERE id = $1 LIMIT 1", [otpId]);
  const row = result.rows[0];

  if (!row) {
    const err = new Error("Kode OTP tidak ditemukan. Minta kode baru.");
    err.status = 404;
    throw err;
  }
  if (row.used_at) {
    const err = new Error("Kode OTP sudah dipakai. Minta kode baru.");
    err.status = 410;
    throw err;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query("UPDATE login_otps SET used_at = NOW() WHERE id = $1", [otpId]);
    const err = new Error("Kode OTP kedaluwarsa. Minta kode baru.");
    err.status = 410;
    throw err;
  }
  if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) {
    await pool.query("UPDATE login_otps SET used_at = NOW() WHERE id = $1", [otpId]);
    const err = new Error("Terlalu banyak percobaan. Minta kode baru.");
    err.status = 429;
    throw err;
  }

  const expected = Buffer.from(String(row.code_hash));
  const actual = Buffer.from(hashCode(String(code || "").trim()));
  const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!match) {
    const attemptsLeft = OTP_MAX_ATTEMPTS - (Number(row.attempts) + 1);
    await pool.query("UPDATE login_otps SET attempts = attempts + 1 WHERE id = $1", [otpId]);
    const err = new Error(
      attemptsLeft > 0
        ? `Kode OTP salah. Sisa percobaan: ${attemptsLeft}.`
        : "Kode OTP salah. Minta kode baru."
    );
    err.status = 401;
    throw err;
  }

  await pool.query("UPDATE login_otps SET used_at = NOW() WHERE id = $1", [otpId]);
  return { userId: row.user_id, email: row.email };
}
