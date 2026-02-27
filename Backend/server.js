const express = require('express');
const axios = require('axios');
const https = require('https');
const cors = require('cors'); // <-- WAJIB ditambahkan untuk Vite
const { sendAlert } = require('./telegram');

const app = express();

// Mengizinkan Vite (frontend) mengambil data dari Express (backend)
app.use(cors());
app.use(express.json()); 

// --- KONFIGURASI WAZUH (GANTI SESUAI SERVER ANDA) ---
const WAZUH_API_URL = 'https://10.104.86.253:55000'; 
const WAZUH_USER = 'wazuh';
const WAZUH_PASS = '08F6oACn.1CoCX3v.mMs5DJk+WeW1y?+';

// Mengabaikan SSL certificate yang self-signed
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.get('/api/fim/:agent_id', async (req, res) => {
    try {
        const { agent_id } = req.params;

        // 1. Dapatkan Token
        const authResponse = await axios.post(`${WAZUH_API_URL}/security/user/authenticate`, {}, {
            auth: { username: WAZUH_USER, password: WAZUH_PASS },
            httpsAgent
        });
        const token = authResponse.data.data.token;

        // 2. Ambil data Syscheck menggunakan Token
        const syscheckResponse = await axios.get(`${WAZUH_API_URL}/syscheck/${agent_id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            httpsAgent
        });

        // 3. Kirim data ke Frontend
        res.json({
            success: true,
            data: syscheckResponse.data.data.affected_items 
        });

    } catch (error) {
        console.error("Error dari Wazuh:", error.message);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari Wazuh' });
    }
});

// --- KONFIGURASI WAZUH INDEXER (PORT 9200) ---
// Secara default jika Anda install Wazuh all-in-one, IP-nya sama dengan Manager
const INDEXER_URL = 'https://10.104.86.253:9200'; 
const INDEXER_USER = 'admin'; // Username bawaan Wazuh Indexer
const INDEXER_PASS = 'C?o4IFv1*OycPKaKr14sLtHlKn6Qers2'; // Password Wazuh Indexer Anda

// Route Baru: Mengambil riwayat Events Syscheck (FIM)
app.get('/api/events/:agent_id', async (req, res) => {
    try {
        const { agent_id } = req.params;

        // Query ala OpenSearch/Elasticsearch untuk mencari log FIM agen terkait
        const queryPayload = {
            query: {
                bool: {
                    must: [
                        { match: { "rule.groups": "syscheck" } },
                        { match: { "agent.id": agent_id } }
                    ]
                }
            },
            sort: [ { "@timestamp": { "order": "desc" } } ], // Urutkan dari terbaru
            size: 50 // Batasi mengambil 50 log terbaru (bisa diubah)
        };

        // Menembak endpoint wazuh-alerts di Wazuh Indexer
        const response = await axios.post(
            `${INDEXER_URL}/wazuh-alerts-*/_search`,
            queryPayload,
            {
                auth: { username: INDEXER_USER, password: INDEXER_PASS },
                httpsAgent // Menggunakan httpsAgent yg sama untuk bypass SSL
            }
        );

        // Merapikan struktur JSON dari OpenSearch agar Frontend mudah membacanya
        // Merapikan struktur JSON dari OpenSearch agar Frontend mudah membacanya
        const eventsData = response.data.hits.hits.map(hit => {
            const source = hit._source;
            
            // --- LOGIKA BARU UNTUK MENGAMBIL USERNAME ---
            // Cek apakah ada data audit (who-data), jika tidak ada ambil owner filenya
            const auditUser = source.syscheck?.audit?.login_user?.name;
            const fileOwner = source.syscheck?.uname_after || source.syscheck?.uname;
            const username = auditUser || fileOwner || '-';

            return {
                id: hit._id,
                timestamp: source['@timestamp'],
                agentName: source.agent.name,
                username: username, // <--- Field baru yang dikirim ke Frontend
                syscheckPath: source.syscheck.path,
                syscheckEvent: source.syscheck.event,
                ruleDescription: source.rule.description,
                ruleLevel: source.rule.level,
                ruleId: source.rule.id,
                fileDiff: source.syscheck?.diff || null
            };
        });

       const latestEvent = eventsData.find(e => Number(e.ruleLevel) >= 1);

        if (latestEvent) {
        await sendAlert(latestEvent);
        }
        
        res.json({ success: true, data: eventsData, total_hits: eventsData.length });

    } catch (error) {
        console.error("Error dari Wazuh Indexer:", error.message);
        res.status(500).json({ success: false, message: 'Gagal mengambil events dari Indexer' });
    }
});

// =======================
// THREAD HUNTING ENDPOINT
// =======================
function isValidDateValue(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  if (!s) return false;
  // epoch seconds/millis
  if (/^\d{10}$/.test(s)) return true; // seconds
  if (/^\d{13}$/.test(s)) return true; // millis
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

// GET /api/hunting?agent_id=&group=&rule_id=&level_gte=&level_lte=&start=&end=&q=&desc=&page=1&size=50
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

    // time filter
    const timeRange = buildTimeRange(start, end);
    if (timeRange) filter.push(timeRange);

    // exact-ish filters
    if (agent_id) filter.push({ term: { "agent.id": String(agent_id) } });
    if (agent_name) filter.push({ match: { "agent.name": String(agent_name) } });
    if (manager_name) filter.push({ match: { "manager.name": String(manager_name) } });

    if (group) {
      // rule.groups biasanya array of string -> match cukup aman
      filter.push({ match: { "rule.groups": String(group) } });
    }

    if (rule_id) {
      // kadang rule.id string/number, pakai term + fallback match
      should.push({ term: { "rule.id": rule_id } });
      should.push({ match: { "rule.id": String(rule_id) } });
    }

    // level range
    const levelRange = {};
    if (level_gte !== undefined && level_gte !== "") levelRange.gte = Number(level_gte);
    if (level_lte !== undefined && level_lte !== "") levelRange.lte = Number(level_lte);
    if (Object.keys(levelRange).length) {
      filter.push({ range: { "rule.level": levelRange } });
    }

    if (desc && String(desc).trim()) {
    const raw = String(desc).trim();

    // NOTE: Kalau user ngetik 2 huruf seperti "PA", kita pakai prefix + wildcard
    // dan tidak mengandalkan match_phrase_prefix.
    const shouldDesc = [];

    // 1) kalau rule.description adalah TEXT -> ini harusnya match "PAM"
    shouldDesc.push({
        multi_match: {
        query: raw,
        type: "best_fields",
        operator: "or",
        fuzziness: "AUTO",
        fields: ["rule.description^3"],
        },
    });

    // 2) kalau rule.description adalah KEYWORD (atau ada .keyword) -> prefix & wildcard
    // prefix: "PAM" cocok dengan "PAM: Login..."
    shouldDesc.push(
        { prefix: { "rule.description": raw.toLowerCase() } },
        { prefix: { "rule.description.keyword": raw } }
    );

    // 2.5) query_string with trailing wildcard (helps prefix of words and partial tokens)
    // escape special characters for query_string
    const escForQS = raw.replace(/[+\-=&|<>!(){}\[\]^"~*?:\\/]/g, "\\$&");
    shouldDesc.push({
      query_string: {
        query: `${escForQS}*`,
        fields: ["rule.description"],
        default_operator: "and",
        lenient: true,
      },
    });

    // wildcard contains (case-insensitive) -> "PA" bisa kena "PAM"
    shouldDesc.push(
        {
        wildcard: {
            "rule.description": { value: `*${raw}*`, case_insensitive: true },
        },
        },
        {
        wildcard: {
            "rule.description.keyword": { value: `*${raw}*`, case_insensitive: true },
        },
        }
    );

    must.push({
        bool: {
        should: shouldDesc,
        minimum_should_match: 1,
        },
    });
    }

    // q search: global-ish search multi field, aman dari karakter aneh
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

    // if rule_id masuk ke should, aktifkan minimum_should_match
    let boolQuery = { must, filter };
    if (should.length) {
      boolQuery.should = should;
      boolQuery.minimum_should_match = 1;
    }

    // fallback jika kosong semua: match_all
    const queryPayload = {
      track_total_hits: true,
      query: must.length || filter.length || should.length ? { bool: boolQuery } : { match_all: {} },
      sort: [{ "@timestamp": { order: sort === "asc" ? "asc" : "desc" } }],
      from: fromNum,
      size: sizeNum,
    };

    const response = await axios.post(
      `${INDEXER_URL}/wazuh-alerts-*/_search`,
      queryPayload,
      {
        auth: { username: INDEXER_USER, password: INDEXER_PASS },
        httpsAgent,
      }
    );

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
        // optional fields yang sering berguna buat hunting
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
      // kirim balik query biar gampang debug
      debug: { query: queryPayload },
    });
  } catch (error) {
    const detail = error?.response?.data || null;
    console.error("Error /api/hunting:", error.message, detail ? JSON.stringify(detail).slice(0, 500) : "");
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data hunting dari Indexer",
      error: error.message,
    });
  }
});

app.listen(3000, () => console.log('Server Backend berjalan di http://localhost:3000'));