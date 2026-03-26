// server.js
import dotenv from "dotenv";
import express from "express";
import axios from "axios";
import https from "https";
import cors from "cors";
import { sendAlert } from "./telegram.js";
import os from "os";
import { Kafka } from "kafkajs";
import { Pool } from "pg";
import connectDB from "./config/dbLogin.js";
import authRouter from "./routes/auth.routes.js";

// Load environment variables dari .env
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Connect MongoDB untuk Auth
connectDB();

// Auth routes (MongoDB)
app.use("/api/auth", authRouter);

const ENABLE_DB = process.env.ENABLE_DB !== "0";

// Konfigurasi Kafka
const kafka = new Kafka({
  clientId: 'wazuh-monitor',
  brokers: ['10.69.15.120:9092'] // Alamat Kafka lokal kamu
});
const consumer = kafka.consumer({ groupId: 'wazuh-group' });

// Fungsi untuk menjalankan Kafka Consumer
const runKafka = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'test-topic', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        // 1. Ambil data mentah dari Kafka
        const source = JSON.parse(message.value.toString());

        // 🛑 TAMBAHKAN FILTER INI:
        // Jika log bukan berasal dari modul FIM (syscheck), abaikan dan jangan diproses
        if (!source.syscheck) {
          return;
        }

        // 2. Ekstraksi Username
        const auditUser = source.syscheck?.audit?.login_user?.name;
        const fileOwner = source.syscheck?.uname_after || source.syscheck?.uname;
        const username = auditUser || fileOwner || "-";

        // 3. MAPPING FORMATED
        const formattedLog = {
          // Pastikan menggunakan ID asli untuk menghindari duplikasi
          id: source.id || source._id || Math.random().toString(),
          timestamp: source["@timestamp"] || new Date().toISOString(),
          agentName: source.agent?.name || "-",
          username: username,
          syscheckPath: source.syscheck?.path || "-",
          syscheckEvent: source.syscheck?.event || "-",
          ruleDescription: source.rule?.description || "-",
          ruleLevel: source.rule?.level ?? 0,
          ruleId: source.rule?.id ?? "-",
          fileDiff: source.syscheck?.diff || null,
        };

        // 4. Kirim ke Frontend lewat Polling (Socket.IO dihapus)

        if (Number(formattedLog.ruleLevel) >= 1) {
            sendAlert(formattedLog).catch(err => console.error("Gagal kirim Telegram:", err.message));
        }

        // Terminal sekarang hanya mencetak aktivitas file yang valid
        console.log(`✅ Streaming Formatted: ${formattedLog.syscheckEvent} pada ${formattedLog.syscheckPath}`);

        // 5. Simpan ke Database secara otomatis
        if (DB_READY) {
          saveToDatabase(formattedLog).catch(err =>
            console.error("Gagal simpan Kafka log ke DB:", err.message)
          );
        }
      } catch (err) {
        console.error("Kesalahan parsing pesan Kafka:", err.message);
      }
    },
  });
};

runKafka().catch(console.error);

// =======================
// KONFIGURASI DATABASE (DIGABUNG DI SINI)
// =======================
let pool = null;
let DB_READY = false;

if (ENABLE_DB) {
  pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  pool.connect()
    .then((client) =>
      client.query("SELECT 1").then(() => {
        client.release();
        DB_READY = true;
        console.log("✅ DB connected");
      })
    )
    .catch((err) => {
      console.log("  DB tidak tersedia -> DB mode dimatikan. Reason:", err.message);
      // penting: matikan supaya insert skip
      pool = null;
      DB_READY = false;
    });
} else {
  console.log("  DB dimatikan (ENABLE_DB=0). Insert akan di-skip.");
}

// --- FUNGSI HELPER DATABASE ---
async function saveToDatabase(event) {
  if (!pool || !DB_READY) return; // <-- penting: skip insert

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

// =======================
// KONFIGURASI WAZUH
// =======================
// const WAZUH_API_URL = "https://10.104.131.140:55000";
// const WAZUH_USER = "wazuh";
// const WAZUH_PASS = "08F6oACn.1CoCX3v.mMs5DJk+WeW1y?+";

// Abaikan SSL self-signed
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// =======================
// KONFIGURASI WAZUH INDEXER
// =======================
const INDEXER_URL = "https://10.69.15.120:9200";
const INDEXER_USER = "admin";
const INDEXER_PASS = "3Hul7FhbSClUQe0AI8J?6CcyoluD36wg";

// =======================
// 1) Endpoint FIM Real-time (Disabled - Wazuh API URL not configured)
// =======================
// Uncomment and configure WAZUH_API_URL if available
// app.get("/api/fim/:agent_id", async (req, res) => { ... });

// =======================
// 2) Endpoint Events + Simpan DB
// =======================
app.get("/api/events/:agent_id", async (req, res) => {
  try {
    const { agent_id } = req.params;

    const queryPayload = {
      query: {
        bool: {
          must: [
            { match: { "rule.groups": "syscheck" } },
          ],
        },
      },
      sort: [{ "@timestamp": { order: "desc" } }],
      size: 100,
    };

    const response = await axios.post(`${INDEXER_URL}/wazuh-alerts-*/_search`, queryPayload, {
      auth: { username: INDEXER_USER, password: INDEXER_PASS },
      httpsAgent,
    });



    const eventsData = (response.data.hits.hits || []).map((hit) => {
      const source = hit._source || {};
      const auditUser = source.syscheck?.audit?.login_user?.name;
      const fileOwner = source.syscheck?.uname_after || source.syscheck?.uname;
      const username = auditUser || fileOwner || "-";

      return {
        id: hit._id,
        timestamp: source["@timestamp"],
        agentName: source.agent?.name || "-",
        username,
        syscheckPath: source.syscheck?.path || null,
        syscheckEvent: source.syscheck?.event || null,
        ruleDescription: source.rule?.description || "-",
        ruleLevel: source.rule?.level ?? 0,
        ruleId: source.rule?.id ?? "-",
        fileDiff: source.syscheck?.diff || null,
      };
    });

    // Simpan ke DB paralel (tidak menghambat response)
    Promise.all(eventsData.map((event) => saveToDatabase(event))).catch((err) =>
       console.error("Gagal simpan massal ke DB:", err.message)
    );

    // Alert Telegram (ambil event terbaru)
    // const latestEvent = eventsData.find((e) => Number(e.ruleLevel) >= 1);
    // if (latestEvent) await sendAlert(latestEvent);

    res.json({ success: true, data: eventsData, total_hits: eventsData.length });
  } catch (error) {
    const errorMsg = error.response?.status ?
      `Indexer error ${error.response.status}: ${error.response.statusText}` :
      error.message;
    console.error("❌ Error dari Wazuh Indexer:", errorMsg);
    console.error("   Details:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil events dari Indexer",
      details: process.env.NODE_ENV === "development" ? errorMsg : undefined
    });
  }
});

// =======================
// 3) Endpoint ambil riwayat dari DB
// =======================
app.get("/api/db/history", async (req, res) => {
  try {
    if (!pool || !DB_READY) {
      return res.json({ success: true, data: [], note: "DB tidak aktif di mesin ini" });
    }

    const result = await pool.query("SELECT * FROM wazuh_logs ORDER BY timestamp DESC LIMIT 100");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("DB history error:", err.message);
    res.status(500).json({ success: false, message: "Gagal mengambil data dari database" });
  }
});

// =======================
// THREAD HUNTING ENDPOINT (tetap sama)
// =======================
function isValidDateValue(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (/^\d{10}$/.test(s)) return true;
  if (/^\d{13}$/.test(s)) return true;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function toISOStringSafe(v) {
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString();
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
  const d = new Date(s);
  return d.toISOString();
}

function buildTimeRange(start, end) {
  const range = {};
  if (isValidDateValue(start)) range.gte = toISOStringSafe(start);
  if (isValidDateValue(end)) range.lte = toISOStringSafe(end);
  return Object.keys(range).length ? { range: { "@timestamp": range } } : null;
}

// GET /api/hunting?...
app.get("/api/hunting", async (req, res) => {
  try {
    const {
      agent_id,
      agent_name,
      manager_name,
      group,
      rule_id,
      level_gte,
      level_lte,
      start,
      end,
      q,
      desc,
      page = 1,
      size = 100,
      sort = "desc",
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.min(Math.max(parseInt(size, 10) || 50, 1), 500);
    const fromNum = (pageNum - 1) * sizeNum;

    const must = [];
    const filter = [];
    const should = [];

    const timeRange = buildTimeRange(start, end);
    if (timeRange) filter.push(timeRange);

    if (agent_id) filter.push({ term: { "agent.id": String(agent_id) } });
    if (agent_name) filter.push({ match: { "agent.name": String(agent_name) } });
    if (manager_name) filter.push({ match: { "manager.name": String(manager_name) } });
    if (group) filter.push({ match: { "rule.groups": String(group) } });

    if (rule_id) {
      should.push({ term: { "rule.id": rule_id } });
      should.push({ match: { "rule.id": String(rule_id) } });
    }

    const levelRange = {};
    if (level_gte !== undefined && level_gte !== "") levelRange.gte = Number(level_gte);
    if (level_lte !== undefined && level_lte !== "") levelRange.lte = Number(level_lte);
    if (Object.keys(levelRange).length) filter.push({ range: { "rule.level": levelRange } });

    if (desc && String(desc).trim()) {
      const raw = String(desc).trim();
      const shouldDesc = [];

      shouldDesc.push({
        multi_match: {
          query: raw,
          type: "best_fields",
          operator: "or",
          fuzziness: "AUTO",
          fields: ["rule.description^3"],
        },
      });

      shouldDesc.push(
        { prefix: { "rule.description": raw.toLowerCase() } },
        { prefix: { "rule.description.keyword": raw } }
      );

      const escForQS = raw.replace(/[+\-=&|<>!(){}\[\]^"~*?:\\/]/g, "\\$&");
      shouldDesc.push({
        query_string: {
          query: `${escForQS}*`,
          fields: ["rule.description"],
          default_operator: "and",
          lenient: true,
        },
      });

      shouldDesc.push(
        { wildcard: { "rule.description": { value: `*${raw}*`, case_insensitive: true } } },
        { wildcard: { "rule.description.keyword": { value: `*${raw}*`, case_insensitive: true } } }
      );

      must.push({ bool: { should: shouldDesc, minimum_should_match: 1 } });
    }

    if (q && String(q).trim()) {
      const qs = String(q).trim();
      must.push({
        simple_query_string: {
          query: qs,
          default_operator: "and",
          lenient: true,
          fields: [
            "rule.description^3",
            "full_log",
            "data.*",
            "agent.name",
            "agent.id",
            "manager.name",
            "rule.id",
            "rule.groups",
            "rule.mitre.*",
          ],
        },
      });
    }

    let boolQuery = { must, filter };
    if (should.length) {
      boolQuery.should = should;
      boolQuery.minimum_should_match = 1;
    }

    const queryPayload = {
      track_total_hits: true,
      query: must.length || filter.length || should.length ? { bool: boolQuery } : { match_all: {} },
      sort: [{ "@timestamp": { order: sort === "asc" ? "asc" : "desc" } }],
      from: fromNum,
      size: sizeNum,
    };

    const response = await axios.post(`${INDEXER_URL}/wazuh-alerts-*/_search`, queryPayload, {
      auth: { username: INDEXER_USER, password: INDEXER_PASS },
      httpsAgent,
    });

    const hits = response?.data?.hits?.hits || [];
    const total =
      typeof response?.data?.hits?.total === "number"
        ? response.data.hits.total
        : response?.data?.hits?.total?.value || hits.length;

    const rows = hits.map((hit) => {
      const s = hit._source || {};
      return {
        id: hit._id,
        timestamp: s["@timestamp"],
        agentId: s.agent?.id || "-",
        agentName: s.agent?.name || "-",
        managerName: s.manager?.name || "-",
        ruleId: s.rule?.id ?? "-",
        ruleLevel: s.rule?.level ?? "-",
        ruleDescription: s.rule?.description || "-",
        groups: s.rule?.groups || [],
        location: s.location || s.decoder?.name || "-",
        fullLog: s.full_log || null,
      };
    });

    res.json({
      success: true,
      page: pageNum,
      size: sizeNum,
      total,
      data: rows,
      debug: { query: queryPayload },
    });
  } catch (error) {
    const detail = error?.response?.data || null;
    console.error(
      "Error /api/hunting:",
      error.message,
      detail ? JSON.stringify(detail).slice(0, 500) : ""
    );
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data hunting dari Indexer",
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 5000;

const ENABLE_AUTO_PULL = process.env.ENABLE_AUTO_PULL !== "0";
const AUTO_PULL_AGENT_ID = process.env.AUTO_PULL_AGENT_ID || null; // contoh: "001"
const AUTO_PULL_INTERVAL_MS = Number(process.env.AUTO_PULL_INTERVAL_MS || 15000);

async function autoPullEvents() {
  if (!ENABLE_AUTO_PULL) return;
  if (!AUTO_PULL_AGENT_ID) return;

  try {
    // panggil endpoint kamu sendiri supaya logika insert kepakai
    await axios.get(`http://127.0.0.1:${PORT}/api/events/${AUTO_PULL_AGENT_ID}`);
    console.log(`[auto-pull] ok agent=${AUTO_PULL_AGENT_ID}`);
  } catch (e) {
    console.log("[auto-pull] gagal:", e.message);
  }
}

// jalan sekali + interval
autoPullEvents();
setInterval(autoPullEvents, AUTO_PULL_INTERVAL_MS);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server berjalan di port: ${PORT}`);
  console.log(`📡 Frontend can access at http://localhost:${PORT}`);
});