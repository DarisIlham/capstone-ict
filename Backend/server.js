// server.js
const express = require("express");
const axios = require("axios");
const https = require("https");
const cors = require("cors");
const { Pool } = require("pg");
const { sendAlert } = require("./telegram");

const app = express();
app.use(cors());
app.use(express.json());

// =======================
// KONFIGURASI DATABASE (DIGABUNG DI SINI)
// =======================
const pool = new Pool({
  host: process.env.DB_HOST || "::1",        // bisa ganti ke "127.0.0.1"
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || "wazuh123",
  database: process.env.DB_NAME || "wazuh_events",
  // ssl: false, // default false untuk local
});

// optional: test koneksi saat start
pool.connect()
  .then((client) => {
    return client.query("SELECT 1").then(() => {
      client.release();
      console.log("✅ DB connected");
    });
  })
  .catch((err) => {
    console.error("❌ DB connection error:", err.message);
  });

// --- FUNGSI HELPER DATABASE ---
async function saveToDatabase(event) {
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
const WAZUH_API_URL = "https://10.104.86.253:55000";
const WAZUH_USER = "wazuh";
const WAZUH_PASS = "08F6oACn.1CoCX3v.mMs5DJk+WeW1y?+";

// Abaikan SSL self-signed
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// =======================
// KONFIGURASI WAZUH INDEXER
// =======================
const INDEXER_URL = "https://10.104.86.253:9200";
const INDEXER_USER = "admin";
const INDEXER_PASS = "C?o4IFv1*OycPKaKr14sLtHlKn6Qers2";

// =======================
// 1) Endpoint FIM Real-time
// =======================
app.get("/api/fim/:agent_id", async (req, res) => {
  try {
    const { agent_id } = req.params;

    const authResponse = await axios.post(
      `${WAZUH_API_URL}/security/user/authenticate`,
      {},
      { auth: { username: WAZUH_USER, password: WAZUH_PASS }, httpsAgent }
    );

    const token = authResponse.data.data.token;

    const syscheckResponse = await axios.get(`${WAZUH_API_URL}/syscheck/${agent_id}`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent,
    });

    res.json({ success: true, data: syscheckResponse.data.data.affected_items });
  } catch (error) {
    console.error("Error dari Wazuh:", error.message);
    res.status(500).json({ success: false, message: "Gagal mengambil data dari Wazuh" });
  }
});

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
            { match: { "agent.id": agent_id } },
          ],
        },
      },
      sort: [{ "@timestamp": { order: "desc" } }],
      size: 50,
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
    const latestEvent = eventsData.find((e) => Number(e.ruleLevel) >= 1);
    if (latestEvent) await sendAlert(latestEvent);

    res.json({ success: true, data: eventsData, total_hits: eventsData.length });
  } catch (error) {
    console.error("Error dari Wazuh Indexer:", error.message);
    res.status(500).json({ success: false, message: "Gagal mengambil events dari Indexer" });
  }
});

// =======================
// 3) Endpoint ambil riwayat dari DB
// =======================
app.get("/api/db/history", async (req, res) => {
  try {
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
      size = 50,
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

app.listen(3000, () => console.log("Server Backend berjalan di http://localhost:3000"));