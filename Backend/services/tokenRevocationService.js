import { createHash } from "node:crypto";
import pool from "../config/pg.js";

const tokenHash = (token) => createHash("sha256").update(String(token)).digest("hex");

export function createTokenRevocationStore(database = pool) {
  let tableReady = false;
  let tablePromise = null;

  async function ensureTable() {
    if (tableReady) return;
    if (!tablePromise) {
      tablePromise = database
        .query(`
          CREATE TABLE IF NOT EXISTS revoked_tokens (
            token_hash CHAR(64) PRIMARY KEY,
            expires_at TIMESTAMPTZ NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires
            ON revoked_tokens (expires_at);
        `)
        .then(() => {
          tableReady = true;
        })
        .catch((error) => {
          tablePromise = null;
          throw error;
        });
    }
    await tablePromise;
  }

  async function revokeToken(token, expiresAtSeconds) {
    if (!token) throw new Error("Token is required for revocation");
    await ensureTable();
    const expiresAt = Number.isFinite(Number(expiresAtSeconds))
      ? new Date(Number(expiresAtSeconds) * 1000).toISOString()
      : "infinity";
    const hash = tokenHash(token);

    await database.query("DELETE FROM revoked_tokens WHERE expires_at <= NOW()");
    await database.query(
      `INSERT INTO revoked_tokens (token_hash, expires_at)
       VALUES ($1, $2)
       ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [hash, expiresAt]
    );
  }

  async function isTokenRevoked(token) {
    if (!token) return false;
    await ensureTable();
    const result = await database.query(
      `SELECT EXISTS (
         SELECT 1 FROM revoked_tokens
         WHERE token_hash = $1 AND expires_at > NOW()
       ) AS revoked`,
      [tokenHash(token)]
    );
    return result.rows[0]?.revoked === true;
  }

  return { revokeToken, isTokenRevoked };
}

const tokenRevocationStore = createTokenRevocationStore();
export const revokeToken = tokenRevocationStore.revokeToken;
export const isTokenRevoked = tokenRevocationStore.isTokenRevoked;