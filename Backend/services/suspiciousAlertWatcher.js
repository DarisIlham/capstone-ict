// services/suspiciousAlertWatcher.js
// Watcher suspicious alert (bot @undip_soc_suspicious_alert_bot, TERPISAH
// dari bot approval login). Setiap interval, tiap sumber dicek SEKALI dan
// temuan baru diagregat menjadi MAKSIMAL 1 pesan Telegram per sumber —
// tidak ada spam 1 pesan per event.
//
// Sumber: suspicious linux commands, prediksi ML malicious, alert botnet ML,
// dan FIM critical (rule.level >= 12). Watermark per sumber (in-memory);
// saat start, watermark = sekarang sehingga tidak ada backlog lama.

import axios from "axios";
import https from "node:https";
import { listSuspiciousLinuxCommands } from "./linuxCommandService.js";
import { listPredictions } from "./mlService.js";
import { listAlerts as listBotAlerts } from "./botDetectionService.js";
import { sendDangerousAlert, isAlertBotConfigured } from "./telegramAlertService.js";

function readConfig() {
  return {
    enabled: process.env.SUSPICIOUS_ALERT_ENABLED !== "0",
    intervalMs: Number(process.env.SUSPICIOUS_ALERT_INTERVAL_MS || 5 * 60 * 1000),
    tz: process.env.SUSPICIOUS_ALERT_TZ || process.env.LOGIN_APPROVAL_TZ || "Asia/Jakarta",
    maxSamples: 5,
  };
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const tsOf = (v) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

const fmtTime = (ms, tz) => {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
};

const isMaliciousLabel = (label) => {
  const s = String(label || "").toLowerCase();
  return Boolean(s) && !s.includes("benign") && !s.includes("normal");
};

const isBruteforceLabel = (label) => String(label || "").toLowerCase().includes("bruteforce");

// Ambang alert brute force per IP (env override tersedia).
const bruteforceMinAttempts = () => Number(process.env.SUSPICIOUS_BRUTEFORCE_MIN || 50);

// Akumulasi attempts bruteforce_http per source IP (in-memory).
// Aturan kirim: pertama saat total >= 50; berikutnya tiap ada >= 50
// attempts BARU dalam satu siklus (±5 menit), pesan membawa total akumulasi.
const bruteTotals = new Map(); // ip -> { total, initialSent }
const BRUTE_MAP_CAP = 2000;

const short = (v, n = 90) => {
  const s = String(v ?? "-").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

// ── Pengumpul per sumber (kembalikan item BARU > watermark) ──────
async function collectSuspiciousCommands(startIso, endIso, watermark) {
  const res = await listSuspiciousLinuxCommands({ start: startIso, end: endIso, limit: 50 });
  return (res?.data || [])
    .filter((c) => tsOf(c.timestamp) > watermark)
    .map((c) => ({
      ts: tsOf(c.timestamp),
      line: `${c.user || "?"}@${c.agentName || "?"}: ${short(c.command || c.commandName)}`,
    }));
}

async function collectMlMalicious(startIso, endIso, watermark) {
  const res = await listPredictions({ start: startIso, end: endIso, limit: 100 });
  return (res?.data || [])
    // bruteforce_http ditangani sumber khusus berambangnya sendiri.
    .filter((p) => isMaliciousLabel(p.predictedLabel) && !isBruteforceLabel(p.predictedLabel) && tsOf(p.timestamp) > watermark)
    .map((p) => ({
      ts: tsOf(p.timestamp),
      line: `${p.predictedLabel} | ${p.agent || "?"} | ${p.sourceIp || "?"} → ${p.destinationIp || "?"}`,
    }));
}

async function collectBruteforceHttp(startIso, endIso, watermark) {
  const minAttempts = bruteforceMinAttempts();
  const res = await listPredictions({ start: startIso, end: endIso, limit: 1000 });
  const groups = new Map(); // ip -> { count, maxTs, agent }
  for (const p of res?.data || []) {
    if (!isBruteforceLabel(p.predictedLabel)) continue;
    const ts = tsOf(p.timestamp);
    if (!(ts > watermark)) continue;
    const ip = String(p.sourceIp || "unknown");
    const g = groups.get(ip) || { count: 0, maxTs: 0, agent: "?" };
    g.count += 1;
    if (ts > g.maxTs) {
      g.maxTs = ts;
      g.agent = p.agent || "?";
    }
    groups.set(ip, g);
  }
  const out = [];
  for (const [ip, g] of groups) {
    let st = bruteTotals.get(ip);
    if (!st) {
      st = { total: 0, initialSent: false };
      bruteTotals.set(ip, st);
      if (bruteTotals.size > BRUTE_MAP_CAP) {
        bruteTotals.delete(bruteTotals.keys().next().value);
      }
    }
    st.total += g.count;
    const firstHit = !st.initialSent && st.total >= minAttempts;
    const followUp = st.initialSent && g.count >= minAttempts;
    if (firstHit) st.initialSent = true;
    if (firstHit || followUp) {
      out.push({
        ts: g.maxTs,
        line: `${ip} — ${g.count} attempts baru (total ${st.total}) | ${g.agent}`,
      });
    }
  }
  return out;
}

async function collectBotnetMl(startIso, endIso, watermark) {
  const res = await listBotAlerts({ detector: "ml", start: startIso, end: endIso, limit: 50 });
  const rows = Array.isArray(res?.data) ? res.data : [];
  return rows
    .filter((b) => tsOf(b.timestamp || b.eventTimestamp) > watermark)
    .map((b) => ({
      ts: tsOf(b.timestamp || b.eventTimestamp),
      line: `botnet | ${b.agent || "?"} | ${b.sourceIp || "?"} → ${b.destinationIp || "?"}`,
    }));
}

async function collectFimCritical(startIso, endIso, watermark) {
  const url = process.env.INDEXER_URL;
  if (!url) return [];
  const { data } = await axios.post(
    `${url}/wazuh-alerts-*/_search`,
    {
      size: 50,
      sort: [{ "@timestamp": { order: "desc" } }],
      _source: ["@timestamp", "agent.name", "syscheck.path", "rule.description", "rule.level"],
      query: {
        bool: {
          filter: [
            { term: { "rule.groups": "syscheck" } },
            { range: { "rule.level": { gte: 12 } } },
            { range: { "@timestamp": { gte: startIso, lte: endIso } } },
          ],
        },
      },
    },
    {
      auth: { username: process.env.INDEXER_USER, password: process.env.INDEXER_PASS },
      httpsAgent,
      timeout: 30000,
    }
  );
  return ((data?.hits?.hits) || [])
    .map((h) => {
      const s = h._source || {};
      return {
        ts: tsOf(s["@timestamp"]),
        line: `${s.agent?.name || "?"}: ${short(s.syscheck?.path || s.rule?.description)} (level ${s.rule?.level ?? "?"})`,
      };
    })
    .filter((it) => it.ts > watermark);
}

const SOURCES = [
  { key: "suspicious-commands", emoji: "🟠", title: "Suspicious Commands", collect: collectSuspiciousCommands },
  { key: "bruteforce-http", emoji: "🔥", title: "Brute Force HTTP (≥50/IP)", collect: collectBruteforceHttp },
  { key: "ml-malicious", emoji: "🟣", title: "ML Malicious Predictions", collect: collectMlMalicious },
  { key: "botnet-ml", emoji: "🔵", title: "Botnet ML Alerts", collect: collectBotnetMl },
  { key: "fim-critical", emoji: "🔴", title: "FIM Critical (level ≥ 12)", collect: collectFimCritical },
];

// ── Loop ──────────────────────────────────────────────────────────
let running = false;

export function startSuspiciousAlertWatcher() {
  if (running) return true;
  if (!isAlertBotConfigured()) {
    console.warn("[suspicious-alert] TELEGRAM_ALERT_TOKEN / TELEGRAM_ALERT_CHAT_ID belum diisi — watcher nonaktif.");
    return false;
  }
  const { enabled, intervalMs, tz, maxSamples } = readConfig();
  if (!enabled) {
    console.log("[suspicious-alert] nonaktif (SUSPICIOUS_ALERT_ENABLED=0)");
    return false;
  }
  running = true;
  const watermarks = Object.fromEntries(SOURCES.map((s) => [s.key, Date.now()]));
  console.log(`[suspicious-alert] watcher aktif, cek tiap ${Math.round(intervalMs / 1000)} dtk`);

  const cycle = async () => {
    const end = Date.now();
    for (const src of SOURCES) {
      const wm = watermarks[src.key];
      // Overlap 30 detik agar event di batas jendela tidak terlewat.
      const startIso = new Date(wm - 30000).toISOString();
      const endIso = new Date(end).toISOString();
      try {
        const items = (await src.collect(startIso, endIso, wm))
          .sort((a, b) => b.ts - a.ts);
        if (!items.length) {
          watermarks[src.key] = end;
          continue;
        }
        const samples = items.slice(0, maxSamples).map(
          (it) => `• [${fmtTime(it.ts, tz)}] ${it.line}`
        );
        if (items.length > maxSamples) samples.push(`• +${items.length - maxSamples} lainnya`);
        try {
          await sendDangerousAlert({
            title: `${src.emoji} ${src.title} (${items.length} baru)`,
            detail: samples.join("\n"),
            source: "SOC UNDIP",
          });
        } catch (sendErr) {
          // Watermark SENGAJA tidak maju → dicoba lagi siklus berikut.
          console.warn(`[suspicious-alert] ${src.key} kirim Telegram gagal, ditahan untuk retry:`, sendErr.message);
          continue;
        }
        watermarks[src.key] = end;
        console.log(`[suspicious-alert] terkirim ${src.key}: ${items.length} temuan`);
      } catch (err) {
        console.warn(`[suspicious-alert] ${src.key} gagal:`, err.message);
      }
    }
  };

  void cycle();
  setInterval(() => void cycle(), Math.max(60000, intervalMs));
  return true;
}
