// services/otpService.js
// OTP login 6 digit via email: generate, simpan hash, verifikasi.
// Tabel login_otps dibuat otomatis (IF NOT EXISTS) agar deploy lama
// tidak perlu migrasi manual.
import crypto from "crypto";
import pool from "../config/pg.js";
import { JWT_SECRET } from "../config/security.js";

const OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || JWT_SECRET;

export const OTP_DIGITS = 6;
export const OTP_EXPIRES_MINUTES = Number(process.env.OTP_EXPIRES_MINUTES || 5);
export const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

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

function createOtpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function inTransaction(database, operation) {
  const client = await database.connect();
  let started = false;
  try {
    await client.query("BEGIN");
    started = true;
    const result = await operation(client);
    await client.query("COMMIT");
    started = false;
    return result;
  } catch (error) {
    if (started) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep the original error.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export function createOtpService(
  database = pool,
  { hashSecret = OTP_HASH_SECRET, maxAttempts = OTP_MAX_ATTEMPTS, expiresMinutes = OTP_EXPIRES_MINUTES } = {}
) {
  async function ensureOtpTable() {
    await database.query(`
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
    return crypto.createHmac("sha256", hashSecret).update(String(code)).digest("hex");
  }

  async function createOtp(userId, email) {
    await ensureOtpTable();
    const code = generateOtpCode(OTP_DIGITS);
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    const inserted = await inTransaction(database, async (client) => {
      const user = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!user.rows.length) {
        throw createOtpError("User tidak ditemukan. Silakan login ulang.", 404);
      }
      await client.query(
        "UPDATE login_otps SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
        [userId]
      );
      return client.query(
        `INSERT INTO login_otps (user_id, email, code_hash, expires_at)
         VALUES ($1, $2, $3, $4) RETURNING id, expires_at`,
        [userId, email, hashCode(code), expiresAt.toISOString()]
      );
    });

    return {
      otpId: inserted.rows[0].id,
      code,
      expiresAt: inserted.rows[0].expires_at,
    };
  }

  async function verifyOtp(otpId, code) {
    await ensureOtpTable();
    const outcome = await inTransaction(database, async (client) => {
      const result = await client.query(
        "SELECT * FROM login_otps WHERE id = $1 FOR UPDATE",
        [otpId]
      );
      const row = result.rows[0];

      if (!row) {
        return { error: createOtpError("Kode OTP tidak ditemukan. Minta kode baru.", 404) };
      }
      if (row.used_at) {
        return { error: createOtpError("Kode OTP sudah dipakai. Minta kode baru.", 410) };
      }
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        await client.query("UPDATE login_otps SET used_at = NOW() WHERE id = $1", [otpId]);
        return { error: createOtpError("Kode OTP kedaluwarsa. Minta kode baru.", 410) };
      }
      if (Number(row.attempts) >= maxAttempts) {
        await client.query("UPDATE login_otps SET used_at = NOW() WHERE id = $1", [otpId]);
        return { error: createOtpError("Terlalu banyak percobaan. Minta kode baru.", 429) };
      }

      const expected = Buffer.from(String(row.code_hash));
      const actual = Buffer.from(hashCode(String(code || "").trim()));
      const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

      if (!match) {
        const attemptsLeft = maxAttempts - (Number(row.attempts) + 1);
        await client.query(
          `UPDATE login_otps
           SET attempts = attempts + 1,
               used_at = CASE WHEN attempts + 1 >= $2 THEN NOW() ELSE used_at END
           WHERE id = $1`,
          [otpId, maxAttempts]
        );
        return {
          error: createOtpError(
            attemptsLeft > 0
              ? `Kode OTP salah. Sisa percobaan: ${attemptsLeft}.`
              : "Kode OTP salah. Minta kode baru.",
            401
          ),
        };
      }

      const consumed = await client.query(
        "UPDATE login_otps SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING user_id, email",
        [otpId]
      );
      if (!consumed.rows.length) {
        return { error: createOtpError("Kode OTP sudah dipakai. Minta kode baru.", 410) };
      }
      return { value: { userId: row.user_id, email: row.email } };
    });

    if (outcome.error) throw outcome.error;
    return outcome.value;
  }

  return { ensureOtpTable, createOtp, verifyOtp };
}

const otpService = createOtpService();
export const ensureOtpTable = otpService.ensureOtpTable;
export const createOtp = otpService.createOtp;
export const verifyOtp = otpService.verifyOtp;
