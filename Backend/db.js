import { Pool } from "pg";

const ENABLE_DB = process.env.ENABLE_DB !== "0";
let pool = null;
let DB_READY = false;

export async function initDB() {
  if (!ENABLE_DB) {
    console.log("  DB dimatikan (ENABLE_DB=0). Insert akan di-skip.");
    return;
  }

  pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    DB_READY = true;
    console.log("✅ DB connected");
  } catch (err) {
    console.log("  DB tidak tersedia -> DB mode dimatikan. Reason:", err.message);
    pool = null;
    DB_READY = false;
  }
}

export function getPool() {
  return pool;
}

export function isDbReady() {
  return !!(pool && DB_READY);
}

export async function saveToDatabase(event) {
  if (!pool || !DB_READY) return;

  const query = `
    INSERT INTO wazuh_logs
    (id, timestamp, agent_name, username, syscheck_path, syscheck_event, rule_description, rule_level, rule_id, file_diff)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (id) DO NOTHING;
  `;

  const values = [
    event.id,
    event.timestamp,
    event.agentName,
    event.username,
    event.syscheckPath,
    event.syscheckEvent,
    event.ruleDescription,
    event.ruleLevel,
    event.ruleId,
    event.fileDiff,
  ];

  try {
    await pool.query(query, values);
  } catch (err) {
    console.error("Gagal simpan ke DB:", err.message);
  }
}
