// Audit log aplikasi: selalu ditulis ke console, file JSONL
// (Backend/logs/audit.log) dan tabel PostgreSQL audit_logs. Penulisan ke DB
// bersifat best-effort (fire-and-forget) agar kegagalan database tidak pernah
// menggagalkan alur autentikasi/manajemen user.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../config/pg.js";

const LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "audit.log");

let tableReady = false;
let tablePromise = null;
let dbWarned = false;

function maskEmail(email) {
  const [local = "", domain = ""] = String(email || "").split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

function ensureTable() {
  if (tableReady) return Promise.resolve();
  if (!tablePromise) {
    tablePromise = pool
      .query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id BIGSERIAL PRIMARY KEY,
          logged_at TIMESTAMPTZ NOT NULL,
          action TEXT,
          outcome TEXT,
          actor TEXT,
          target TEXT,
          ip TEXT,
          details JSONB
        )
      `)
      .then(() => {
        tableReady = true;
        dbWarned = false;
      })
      .catch((error) => {
        tablePromise = null;
        throw error;
      });
  }
  return tablePromise;
}

function appendToFile(entry) {
  fs.mkdir(LOG_DIR, { recursive: true }, (mkdirError) => {
    if (mkdirError) {
      console.error("[audit] gagal membuat folder log:", mkdirError.message);
      return;
    }
    fs.appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, (error) => {
      if (error) console.error("[audit] gagal menulis file audit:", error.message);
    });
  });
}

function persistToDatabase(entry) {
  const params = [
    entry.timestamp,
    entry.action ?? null,
    entry.outcome ?? null,
    entry.actor ?? null,
    entry.target ?? null,
    entry.ip ?? null,
    entry.details ? JSON.stringify(entry.details) : null,
  ];

  ensureTable()
    .then(() =>
      pool.query(
        `INSERT INTO audit_logs (logged_at, action, outcome, actor, target, ip, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        params
      )
    )
    .then(() => {
      dbWarned = false;
    })
    .catch((error) => {
      if (!dbWarned) {
        dbWarned = true;
        console.error(
          "[audit] gagal menyimpan ke PostgreSQL (entri tetap tersimpan di file):",
          error.message
        );
      }
    });
}

export function auditLog({ action, outcome = "success", actor, target, ip, details } = {}) {
  let entry;
  try {
    entry = {
      timestamp: new Date().toISOString(),
      action,
      outcome,
      actor: actor?.email ? maskEmail(actor.email) : actor?.id || undefined,
      target: target?.email ? maskEmail(target.email) : target?.id || target,
      ip: ip || undefined,
      details: details || undefined,
    };
  } catch {
    return;
  }

  try {
    console.log("[audit]", JSON.stringify(entry));
  } catch {
    // abaikan: entry tidak serializable
  }

  try {
    appendToFile(entry);
  } catch (error) {
    console.error("[audit] gagal menulis file audit:", error.message);
  }

  try {
    persistToDatabase(entry);
  } catch (error) {
    console.error("[audit] gagal menyimpan ke PostgreSQL:", error.message);
  }
}

export async function listRecentAuditLogs({ limit = 100 } = {}) {
  await ensureTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await pool.query(
    `SELECT id, logged_at, action, outcome, actor, target, ip, details
     FROM audit_logs
     ORDER BY id DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}
