// server.js
import 'dotenv/config';
import express from "express";
import axios from "axios";
import https from "https";
import cors from "cors";
import { sendAlert } from "./telegram.js";
import os from "os";
import { Pool } from "pg";
// MongoDB removed: no connectDB import
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/userRoutes.js";
import notificationRouter from "./routes/notificationRoutes.js";
import app from "./app.js";

// Environment variables are loaded via `import 'dotenv/config'` above
// Debug: show DB_PASS type to help diagnose startup auth issues
console.log('DEBUG: DB_PASS typeof', typeof process.env.DB_PASS, 'present=', !!process.env.DB_PASS);

// MongoDB connection removed (migrated to PostgreSQL)

// Auth routes (MongoDB) attach to imported `app`
app.use("/api/auth", authRouter);

// User management routes (MongoDB, admin only)
app.use("/api/users", userRouter);

// Notification routes (MongoDB, admin only)
app.use("/api/notifications", notificationRouter);

const ENABLE_DB = process.env.ENABLE_DB !== "0";

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
    console.error("Failed to save to DB:", err.message);
  }
}

// Abaikan SSL self-signed
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// =======================
// KONFIGURASI WAZUH INDEXER
// =======================
const INDEXER_URL = process.env.INDEXER_URL;
const INDEXER_USER = process.env.INDEXER_USER;
const INDEXER_PASS = process.env.INDEXER_PASS;
const EXCLUDED_AGENT_IDS = [];
// =======================
// 1) Endpoint FIM Real-time (Disabled - Wazuh API URL not configured)
// =======================
// Uncomment and configure WAZUH_API_URL if available
// app.get("/api/fim/:agent_id", async (req, res) => { ... });

// =======================
// 2) Endpoint Events + Simpan DB
// =======================
async function handleEventsRequest(req, res) {
  try {
    const agent_id_param = req.params.agent_id;

    const agent_id =
      agent_id_param === "all" || !agent_id_param
        ? undefined
        : String(agent_id_param).padStart(3, "0");

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const size = Math.max(1, parseInt(req.query.size, 10) || 100);
    const from = (page - 1) * size;

    const rangeKey = String(
      req.query.range || "30d"
    ).trim();

    let { start, end } = req.query;

    if (!start && !end) {
      const preset = buildPresetRange(rangeKey);

      start = preset.start;
      end = preset.end;
    }

    const timeRange = buildTimeRange(start, end);

    // ==========================================
    // 4. Susun filter OpenSearch
    // ==========================================
    const queryFilters = [
      {
        bool: {
          should: [
            // Event FIM standar Wazuh
            {
              term: {
                "rule.groups": "syscheck",
              },
            },

            // Event custom rule yang tetap berasal dari syscheck
            {
              term: {
                location: "syscheck",
              },
            },

            // Event yang mempunyai informasi file FIM
            {
              exists: {
                field: "syscheck.path",
              },
            },
          ],

          minimum_should_match: 1,
        },
      },
    ];
    // Tambahkan agent tertentu jika URL memakai ID
    if (agent_id) {
      queryFilters.push({
        term: {
          "agent.id": agent_id,
        },
      });
    }

    // Tambahkan filter waktu jika tersedia
    if (timeRange) {
      queryFilters.push(timeRange);
    }

    console.log(
      `>>> FETCH: agent=${agent_id || "all"} ` +
      `page=${page} ` +
      `size=${size} ` +
      `range=${rangeKey} ` +
      `start=${start} ` +
      `end=${end}`
    );


    const requestBody = {
      track_total_hits: true,

      query: {
        bool: {
          filter: queryFilters,

          // Jangan kirim data Wazuh Manager ID 000
          must_not: [
            {
              terms: {
                "agent.id": EXCLUDED_AGENT_IDS,
              },
            },
          ],
        },
      },

      sort: [
        {
          "@timestamp": {
            order: "desc",
            unmapped_type: "date",
          },
        },
      ],

      from,
      size,
    };

    const response = await axios.post(
      `${INDEXER_URL}/wazuh-alerts-*/_search`,
      requestBody,
      {
        auth: { username: INDEXER_USER, password: INDEXER_PASS },
        httpsAgent,
      }
    );

    const hitsObject = response?.data?.hits || {};
    const totalHits =
      typeof hitsObject.total === "object"
        ? hitsObject.total.value
        : Number(hitsObject.total || 0);

    const eventsData = (hitsObject.hits || []).map((hit) => mapWazuhHit(hit));

    return res.json({
      success: true,
      data: eventsData,
      total_hits: totalHits,
      current_page: page,
      total_pages: Math.ceil(totalHits / size) || 1,
      page_size: size,
      applied_range: { rangeKey, start, end },
    });
  } catch (error) {
    console.error("❌ API ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// --- FUNGSI HELPER (Taruh di luar handleEventsRequest) ---
function mapWazuhHit(hit) {
  const source = hit._source || {};
  const auditUser = source.syscheck?.audit?.login_user?.name;
  const fileOwner = source.syscheck?.uname_after || source.syscheck?.uname;
  const username = auditUser || fileOwner || "-";

  return {
    id: hit._id,
    timestamp: source.timestamp || source["@timestamp"] || "-",
    agentName: source.agent?.name || "-",
    username,
    syscheckPath:
      source.syscheck?.path ||
      source.data?.path ||
      source.location ||
      "-",
    syscheckEvent:
      source.syscheck?.event ||
      source.decoder?.name ||
      "-",
    ruleDescription: source.rule?.description || "-",
    ruleLevel: source.rule?.level ?? 0,
    ruleId: source.rule?.id ?? "-",
    fileDiff:
      source.syscheck?.diff ||
      source.full_log ||
      null,
  };
}

function normalizeDomainCandidate(value) {
  if (!value) return null;

  let domain = String(value).trim().toLowerCase();
  if (!domain) return null;

  domain = domain
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");

  if (!domain || domain === "localhost") return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return null;

  return domain;
}

function extractDomainsFromText(input) {
  const text = String(input || "");
  if (!text) return [];

  const domains = new Set();
  const matches = text.match(
    /\b(?:https?:\/\/|wss?:\/\/|ftp:\/\/|www\.)[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/[^\s"'<>]*)?/gi
  ) || [];

  matches.forEach((match) => {
    const normalized = normalizeDomainCandidate(match);
    if (normalized) domains.add(normalized);
  });

  return Array.from(domains);
}

function collectDomainCandidates(source) {
  return [
    source?.data?.url,
    source?.data?.domain,
    source?.data?.hostname,
    source?.url?.full,
    source?.url?.original,
    source?.url?.domain,
    source?.http?.host,
    source?.destination?.domain,
    source?.dns?.question?.name,
    source?.extracted_urls,
    source?.full_log,
    source?.message,
  ];
}

function extractDomainsFromHit(hit) {
  const source = hit?._source || {};
  const candidates = collectDomainCandidates(source);
  const domains = new Set();

  candidates.forEach((candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => {
        const normalized = normalizeDomainCandidate(item);
        if (normalized) domains.add(normalized);

        extractDomainsFromText(item).forEach((domain) => domains.add(domain));
      });
      return;
    }

    const normalized = normalizeDomainCandidate(candidate);
    if (normalized) domains.add(normalized);

    extractDomainsFromText(candidate).forEach((domain) => domains.add(domain));
  });

  return Array.from(domains);
}

// Register two routes (one for all, one for specific agent) to avoid optional-param parsing issues
app.get("/api/events", handleEventsRequest);
app.get("/api/events/:agent_id", handleEventsRequest);

// Agents aggregation across the FULL selected range (terms agg, not a
// paginated sample) so Top Agents never misses agents outside page 1.
async function handleEventsAgentsRequest(req, res) {
  try {
    const agent_id_param = req.params.agent_id;
    const agent_id =
      agent_id_param === "all" || !agent_id_param
        ? undefined
        : String(agent_id_param).padStart(3, "0");

    const rangeKey = String(req.query.range || "30d").trim();
    let { start, end } = req.query;
    if (!start && !end) {
      const preset = buildPresetRange(rangeKey);
      start = preset.start;
      end = preset.end;
    }
    const timeRange = buildTimeRange(start, end);

    const queryFilters = [
      {
        bool: {
          should: [
            { term: { "rule.groups": "syscheck" } },
            { term: { location: "syscheck" } },
            { exists: { field: "syscheck.path" } },
          ],
          minimum_should_match: 1,
        },
      },
    ];
    if (agent_id) {
      queryFilters.push({ term: { "agent.id": agent_id } });
    }
    if (timeRange) {
      queryFilters.push(timeRange);
    }

    const response = await axios.post(
      `${INDEXER_URL}/wazuh-alerts-*/_search`,
      {
        size: 0,
        track_total_hits: true,
        query: {
          bool: {
            filter: queryFilters,
            must_not: [{ terms: { "agent.id": EXCLUDED_AGENT_IDS } }],
          },
        },
        aggs: {
          by_agent: { terms: { field: "agent.name", size: 20 } },
        },
      },
      {
        auth: { username: INDEXER_USER, password: INDEXER_PASS },
        httpsAgent,
      }
    );

    const buckets = response?.data?.aggregations?.by_agent?.buckets || [];
    return res.json({
      success: true,
      data: buckets.map((b) => ({ agent: b.key, count: b.doc_count })),
      applied_range: { rangeKey, start, end },
    });
  } catch (error) {
    console.error("❌ API ERROR (agents):", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

app.get("/api/events/agents/stats", handleEventsAgentsRequest);
app.get("/api/events/:agent_id/agents/stats", handleEventsAgentsRequest);

// Severity + event-type distribution aggregated across the FULL selected
// range (range agg + scripted terms agg), so the Event & Severity legend
// sums to the exact total instead of a paginated page-1 sample.
async function handleEventsDistributionRequest(req, res) {
  try {
    const agent_id_param = req.params.agent_id;
    const agent_id =
      agent_id_param === "all" || !agent_id_param
        ? undefined
        : String(agent_id_param).padStart(3, "0");

    const rangeKey = String(req.query.range || "30d").trim();
    let { start, end } = req.query;
    if (!start && !end) {
      const preset = buildPresetRange(rangeKey);
      start = preset.start;
      end = preset.end;
    }
    const timeRange = buildTimeRange(start, end);

    const queryFilters = [
      {
        bool: {
          should: [
            { term: { "rule.groups": "syscheck" } },
            { term: { location: "syscheck" } },
            { exists: { field: "syscheck.path" } },
          ],
          minimum_should_match: 1,
        },
      },
    ];
    if (agent_id) {
      queryFilters.push({ term: { "agent.id": agent_id } });
    }
    if (timeRange) {
      queryFilters.push(timeRange);
    }

    const baseBody = {
      query: {
        bool: {
          filter: queryFilters,
          must_not: [{ terms: { "agent.id": EXCLUDED_AGENT_IDS } }],
        },
      },
    };

    const authConfig = {
      auth: { username: INDEXER_USER, password: INDEXER_PASS },
      httpsAgent,
    };

    // --- Search #1: total + severity range buckets ---
    const severityResponse = await axios.post(
      `${INDEXER_URL}/wazuh-alerts-*/_search`,
      {
        ...baseBody,
        size: 0,
        track_total_hits: true,
        aggs: {
          by_severity: {
            range: {
              field: "rule.level",
              keyed: true,
              ranges: [
                { key: "Low", to: 5 },
                { key: "Medium", from: 5, to: 8 },
                { key: "High", from: 8, to: 12 },
                { key: "Critical", from: 12 },
              ],
            },
          },
        },
      },
      authConfig
    );

    const hitsTotal = severityResponse?.data?.hits?.total;
    const total =
      typeof hitsTotal === "object" ? hitsTotal.value : Number(hitsTotal || 0);
    const buckets = severityResponse?.data?.aggregations?.by_severity?.buckets || {};
    const pick = (key) => Number(buckets[key]?.doc_count || 0);
    const medium = pick("Medium");
    const high = pick("High");
    const critical = pick("Critical");
    // Dokumen tanpa rule.level ikut kategori Low agar jumlah persis = total.
    const low = Math.max(0, total - medium - high - critical);
    const severity = [
      { label: "Critical", value: critical },
      { label: "High", value: high },
      { label: "Medium", value: medium },
      { label: "Low", value: low },
    ];

    // --- Search #2: event-type buckets (scripted, toleran terhadap mapping) ---
    let eventTypes = [];
    try {
      const eventResponse = await axios.post(
        `${INDEXER_URL}/wazuh-alerts-*/_search`,
        {
          ...baseBody,
          size: 0,
          track_total_hits: false,
          aggs: {
            by_event: {
              terms: {
                size: 20,
                script: {
                  lang: "painless",
                  source:
                    "def se = '';" +
                    "try { if (doc.containsKey('syscheck.event') && doc['syscheck.event'].size() > 0) { se = doc['syscheck.event'].value; } } catch (Exception e) {}" +
                    "if (se != '') { return se; }" +
                    "try { if (doc.containsKey('decoder.name') && doc['decoder.name'].size() > 0) { return doc['decoder.name'].value; } } catch (Exception e) {}" +
                    "return 'unknown';",
                },
              },
            },
          },
        },
        authConfig
      );
      const eventBuckets = eventResponse?.data?.aggregations?.by_event?.buckets || [];
      eventTypes = eventBuckets.map((b) => ({ label: b.key, value: b.doc_count }));
    } catch (error) {
      console.warn("⚠️ Event-type aggregation failed (FIM distribution):", error.message);
    }

    return res.json({
      success: true,
      total,
      severity,
      eventTypes,
      applied_range: { rangeKey, start, end },
    });
  } catch (error) {
    console.error("❌ API ERROR (distribution):", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

app.get("/api/events/distribution/stats", handleEventsDistributionRequest);
app.get("/api/events/:agent_id/distribution/stats", handleEventsDistributionRequest);


async function handleDomainSummaryRequest(req, res) {
  try {
    const agent_id_param = req.params.agent_id;
    const agent_id = agent_id_param === "all" || !agent_id_param ? undefined : agent_id_param;
    const rangeKey = String(req.query.range || "30d").trim();
    const size = Math.min(Math.max(parseInt(req.query.size, 10) || 1000, 1), 5000);
    let { start, end } = req.query;

    if (!start && !end) {
      const preset = buildPresetRange(rangeKey);
      start = preset.start;
      end = preset.end;
    }

    const filter = [];
    if (agent_id) filter.push({ term: { "agent.id": String(agent_id) } });

    const timeRange = buildTimeRange(start, end);
    if (timeRange) filter.push(timeRange);

    const requestBody = {
      track_total_hits: false,
      query: {
        bool: {
          must: [{ match: { "rule.groups": "syscheck" } }],
          should: [
            { exists: { field: "url.domain" } },
            { exists: { field: "url.full" } },
            { exists: { field: "data.url" } },
            { exists: { field: "data.domain" } },
            { exists: { field: "http.host" } },
            { exists: { field: "destination.domain" } },
            { exists: { field: "dns.question.name" } },
            { exists: { field: "extracted_urls" } },
            { wildcard: { "full_log": { value: "*http*", case_insensitive: true } } },
            { wildcard: { "message": { value: "*http*", case_insensitive: true } } },
          ],
          minimum_should_match: 1,
          filter,
        },
      },
      sort: [{ "@timestamp": { order: "desc", unmapped_type: "date" } }],
      size,
      _source: [
        "@timestamp",
        "data.url",
        "data.domain",
        "data.hostname",
        "url.full",
        "url.original",
        "url.domain",
        "http.host",
        "destination.domain",
        "dns.question.name",
        "extracted_urls",
        "full_log",
        "message",
      ],
    };

    const response = await axios.post(
      `${INDEXER_URL}/wazuh-alerts-*/_search`,
      requestBody,
      {
        auth: { username: INDEXER_USER, password: INDEXER_PASS },
        httpsAgent,
      }
    );

    const hits = response?.data?.hits?.hits || [];
    const counts = new Map();

    hits.forEach((hit) => {
      extractDomainsFromHit(hit).forEach((domain) => {
        counts.set(domain, (counts.get(domain) || 0) + 1);
      });
    });

    const domains = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    return res.json({
      success: true,
      data: domains,
      total: domains.length,
      applied_range: { rangeKey, start, end },
    });
  } catch (error) {
    console.error("Domain summary error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

app.get("/api/fim/domains", handleDomainSummaryRequest);
app.get("/api/fim/:agent_id/domains", handleDomainSummaryRequest);

// =======================
// 3) Endpoint ambil riwayat dari DB
// =======================
app.get("/api/db/history", async (req, res) => {
  try {
    if (!pool || !DB_READY) {
      return res.json({ success: true, data: [], note: "DB not active on this machine" });
    }

    const result = await pool.query("SELECT * FROM wazuh_logs ORDER BY timestamp DESC LIMIT 100");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("DB history error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch data from the database" });
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

function buildPresetRange(rangeKey) {
  const end = new Date();
  const start = new Date(end);

  switch (String(rangeKey || "").trim()) {
    case "1h":
      start.setHours(start.getHours() - 1);
      break;
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
    default:
      start.setDate(start.getDate() - 30);
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
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
      message: "Failed to fetch hunting data from Indexer",
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
    // call your own endpoint so the insert logic gets used
    await axios.get(`http://127.0.0.1:${PORT}/api/events/${AUTO_PULL_AGENT_ID}`);
    console.log(`[auto-pull] ok agent=${AUTO_PULL_AGENT_ID}`);
  } catch (e) {
    console.log("[auto-pull] failed:", e.message);
  }
}

// jalan sekali + interval
autoPullEvents();
setInterval(autoPullEvents, AUTO_PULL_INTERVAL_MS);

// 404 Handler (moved here so routes added in server.js are reachable)
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

// Global Error Handler (moved here)
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err.stack || err.message || err);
  res.status(err.statusCode || 500).json({ success: false, message: err.message || "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server berjalan di port: ${PORT}`);
  console.log(`📡 Frontend can access at http://localhost:${PORT}`);
});
