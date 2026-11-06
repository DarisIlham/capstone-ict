import axios from "axios";
import { createIndexerHttpsAgent } from "../config/tls.js";
import { listLinuxCommands } from "./linuxCommandService.js";
import { listSuspiciousFileScans } from "./fileScanService.js";
import { listPredictions } from "./mlService.js";
import { listAlerts as listBotAlerts } from "./botDetectionService.js";

const PAGE_CACHE_TTL_MS = Number(process.env.ALERT_FEED_CACHE_TTL_MS || 30_000);
const PAGE_CACHE_MAX_ENTRIES = 4;
const SOURCE_PAGE_SIZES = { linux: 1000, files: 100, fim: 500, ml: 1000, bot: 1000 };
const snapshotCache = new Map();
const indexerHttpsAgent = createIndexerHttpsAgent();

const severityOrder = ["low", "medium", "high", "critical"];
const linuxIndicatorSeverity = {
  destructive_delete: "critical",
  permission_change_777: "critical",
  remote_shell_tool: "critical",
  base64_decode: "high",
  shell_inline_exec: "high",
  python_inline_exec: "high",
  perl_inline_exec: "high",
  php_inline_exec: "high",
  history_tampering: "high",
  network_fetch: "medium",
};

function isMaliciousLabel(label) {
  const value = String(label || "").toLowerCase();
  return Boolean(value) && !value.includes("benign") && !value.includes("normal");
}

function pick(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "-" && text.toLowerCase() !== "unknown") return value;
  }
  return undefined;
}

function hostCommandSeverity(record) {
  const explicit = String(record?.risk_level ?? record?.riskLevel ?? "").toLowerCase();
  if (severityOrder.includes(explicit)) return explicit;
  const raw = record?.riskIndicators;
  const indicators = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
  if (!indicators.length) return "medium";
  return indicators.reduce((best, indicator) => {
    const next = linuxIndicatorSeverity[indicator];
    return next && severityOrder.indexOf(next) > severityOrder.indexOf(best) ? next : best;
  }, "low");
}

const fileScanSeverity = (count) => (count >= 5 ? "critical" : count >= 2 ? "high" : count >= 1 ? "medium" : "low");
const fimSeverity = (level) => (level >= 10 ? "critical" : level >= 7 ? "high" : level >= 4 ? "medium" : "low");
const mlSeverity = (confidence) => confidence == null ? "medium" : confidence >= 80 ? "critical" : confidence >= 60 ? "high" : confidence >= 40 ? "medium" : "low";

function makeAlertLink(path, params, timestamp, start, end) {
  let linkStart = start;
  let linkEnd = end;
  const time = new Date(timestamp).getTime();
  if (Number.isFinite(time)) {
    linkStart = new Date(time - 30 * 60_000).toISOString();
    linkEnd = new Date(time + 30 * 60_000).toISOString();
  }
  const query = new URLSearchParams({ start: linkStart, end: linkEnd, focus: "logs", ...params });
  return `${path}?${query.toString()}`;
}

async function collectSearchAfter(fetchPage, size) {
  const rows = [];
  let page = 1;
  let cursor = null;
  let pitId = null;
  let total = null;
  for (;;) {
    const result = await fetchPage({ page, size, cursor, pitId });
    const batch = Array.isArray(result?.data) ? result.data : [];
    if (total === null) total = Number(result?.pagination?.total ?? result?.total_hits ?? batch.length);
    if (batch.length) rows.push(...batch);
    pitId = result?.pit_id || pitId;
    cursor = result?.next_search_after || null;
    if (!cursor || batch.length === 0 || (Number.isFinite(total) && rows.length >= total) || batch.length < size) break;
    page += 1;
  }
  return rows;
}

async function collectLinuxCommands(start, end) {
  return collectSearchAfter(
    ({ page, size, cursor, pitId }) => listLinuxCommands({
      start,
      end,
      suspicious: "true",
      page,
      limit: size,
      cursor: "1",
      ...(cursor ? { search_after: cursor } : {}),
      ...(pitId ? { pit_id: pitId } : {}),
    }),
    SOURCE_PAGE_SIZES.linux
  );
}

async function collectFileScans(start, end) {
  return collectSearchAfter(
    ({ page, size, cursor, pitId }) => listSuspiciousFileScans({
      start,
      end,
      page,
      limit: size,
      cursor: "1",
      ...(cursor ? { search_after: cursor } : {}),
      ...(pitId ? { pit_id: pitId } : {}),
    }, { maxLimit: SOURCE_PAGE_SIZES.files }),
    SOURCE_PAGE_SIZES.files
  );
}

async function collectMlPredictions(start, end) {
  return collectSearchAfter(
    ({ page, size, cursor, pitId }) => listPredictions({
      start,
      end,
      page,
      limit: size,
      cursor: "1",
      ...(cursor ? { search_after: cursor } : {}),
      ...(pitId ? { pit_id: pitId } : {}),
    }),
    SOURCE_PAGE_SIZES.ml
  );
}

async function collectBotAlerts(start, end) {
  const rows = [];
  let page = 1;
  let cursor = "1";
  let total = null;
  for (;;) {
    const result = await listBotAlerts({ start, end, page, limit: SOURCE_PAGE_SIZES.bot, detector: "all", cursor });
    const batch = Array.isArray(result?.data) ? result.data : [];
    if (total === null) total = Number(result?.pagination?.total ?? batch.length);
    if (batch.length) rows.push(...batch);
    cursor = result?.next_cursor ? JSON.stringify(result.next_cursor) : null;
    if (!cursor || batch.length === 0 || (Number.isFinite(total) && rows.length >= total)) break;
    page += 1;
  }
  return rows;
}

async function collectFimEvents(start, end) {
  const port = Number(process.env.PORT || 5000);
  const baseUrl = `http://127.0.0.1:${port}/api/events`;
  const size = SOURCE_PAGE_SIZES.fim;
  const rows = [];
  let cursor = null;
  let total = null;
  let page = 1;
  for (;;) {
    const response = await axios.get(baseUrl, {
      params: { start, end, page, size, ...(cursor ? { search_after: JSON.stringify(cursor) } : {}) },
      timeout: 60_000,
    });
    const body = response?.data || {};
    const batch = Array.isArray(body.data) ? body.data : [];
    if (total === null) total = Number(body.total_hits ?? batch.length);
    if (batch.length) rows.push(...batch);
    cursor = body.next_search_after || null;
    if (!cursor || batch.length === 0 || rows.length >= total || batch.length < size) break;
    page += 1;
  }
  return rows;
}

function buildUnifiedAlerts({ attackData, fileData, fimData, mlData, botData, start, end }) {
  const alerts = [
    ...attackData.map((item, index) => {
      const timestamp = item.timestamp || item.created_at;
      const user = pick(item.user, item.username) || "-";
      const agent = pick(item.agentName, item.agent_name) || "-";
      const command = String(item.command || "");
      return {
        id: `attack-${item.id || index}`,
        title: item.description || command || "Suspicious command detected",
        severity: hostCommandSeverity(item),
        source: "Host Monitoring",
        asset: pick(item.hostName, item.hostname, item.host, item.agentName, item.agent_name) || "Unknown",
        agent,
        user,
        reason: `User: ${user === "-" ? "unknown" : user} | Command: ${command.substring(0, 60)}`,
        timestamp,
        link: makeAlertLink("/attack-dashboard", { status: "suspicious", ...(agent !== "-" ? { agent } : {}) }, timestamp, start, end),
      };
    }),
    ...fileData.map((item, index) => {
      const findings = Array.isArray(item.findings) ? item.findings : [];
      const topFinding = findings.map((finding) => String(finding?.indicator || finding?.name || finding || "")).filter(Boolean).slice(0, 2).join(", ");
      const count = Number(item.findingsCount ?? findings.length ?? 0);
      const timestamp = item.timestamp || item.scan_time || item.created_at;
      const agent = pick(item.agentName, item.agent_name) || "-";
      return {
        id: `file-${item.id || index}`,
        title: pick(item.fileName, item.threat_name, item.file_name) || "Suspicious file detected",
        severity: fileScanSeverity(count),
        source: "File Scanner",
        asset: pick(item.filePath, item.file_path) || "Unknown",
        agent,
        user: "-",
        reason: `Scanner: ${pick(item.scanner) || "file-scan"} | Findings: ${count || "-"}${topFinding ? ` | ${topFinding}` : ""} | SHA256: ${String(item.sha256 || item.hash || "").substring(0, 16)}${item.sha256 || item.hash ? "..." : "-"}`,
        timestamp,
        link: makeAlertLink("/file-security", agent !== "-" ? { agent } : {}, timestamp, start, end),
      };
    }),
    ...fimData.map((item, index) => {
      const ruleLevel = Number(item.ruleLevel ?? item.rule_level ?? item.level ?? item.severity ?? 0);
      const agent = pick(item.agentName, item.agent_name, item.agent?.name) || "-";
      const path = pick(item.syscheckPath, item.file, item.path, item.filePath);
      const timestamp = item.timestamp || item.created_at || item.createdAt || item["@timestamp"];
      return {
        id: `fim-${item.id || index}`,
        title: `${item.syscheckEvent && item.syscheckEvent !== "-" ? item.syscheckEvent : item.type || "File change"} detected`,
        severity: fimSeverity(ruleLevel),
        source: "FIM",
        asset: path || "Unknown",
        agent,
        user: pick(item.username) || "-",
        reason: `Agent: ${agent === "-" ? "unknown" : agent} | Rule: ${pick(item.ruleDescription, item.rule_description) || "-"} (level ${Number.isNaN(ruleLevel) ? "-" : ruleLevel})`,
        timestamp,
        link: makeAlertLink("/fim-events", { ...(agent !== "-" ? { agent } : {}), ...(path ? { path } : {}) }, timestamp, start, end),
      };
    }),
    ...buildMlAlerts(mlData, start, end),
    ...botData
      .filter((item) => item?.detectorType === "ml" && Number(item.rulePackets ?? 0) >= 100)
      .map((item, index) => {
        const probability = Number(item.probability);
        const probabilityPct = Number.isFinite(probability) ? Math.round((probability > 1 ? probability : probability * 100) * 10) / 10 : null;
        const timestamp = item.timestamp || item.eventTimestamp || item.created_at;
        const agent = pick(item.agent, item.hostname) || "Unknown";
        return {
          id: `botnet-${item.id || index}`,
          title: "Botnet activity detected by ML detector",
          severity: "critical",
          source: "Bot Detection",
          asset: agent,
          agent: pick(item.agent) || "-",
          user: "-",
          reason: `Protocol: ${String(item.protocol || "-").toUpperCase()} | ${item.sourceIp || "-"} → ${item.destinationIp || "-"}${probabilityPct === null ? "" : ` | Probability: ${probabilityPct}%`} | Packets: ${Number(item.rulePackets ?? 0)}`,
          timestamp,
          link: makeAlertLink("/bot-detection", agent !== "Unknown" ? { agent } : {}, timestamp, start, end),
        };
      }),
  ];
  return alerts.sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));
}

function buildMlAlerts(mlData, start, end) {
  const isBruteforce = (label) => String(label || "").toLowerCase().includes("bruteforce");
  const groups = new Map();
  const singles = [];
  for (const prediction of mlData.filter((item) => isMaliciousLabel(item.predictedLabel || item.label))) {
    if (isBruteforce(prediction.predictedLabel || prediction.label)) {
      const ip = pick(prediction.sourceIp) || "unknown";
      if (!groups.has(ip)) groups.set(ip, []);
      groups.get(ip).push(prediction);
    } else singles.push(prediction);
  }
  const timestampOf = (item) => new Date(item.timestamp || item.created_at || item.createdAt || item["@timestamp"]).getTime() || 0;
  const alerts = [];
  for (const [ip, group] of groups) {
    if (group.length < 50) continue;
    const latest = [...group].sort((a, b) => timestampOf(a) - timestampOf(b)).at(-1);
    const agents = new Map();
    let maxConfidence = null;
    for (const item of group) {
      const agent = pick(item.agent) || "-";
      agents.set(agent, (agents.get(agent) || 0) + 1);
      const rawConfidence = Number(item.confidence);
      if (Number.isFinite(rawConfidence)) {
        const pct = Math.min(Math.max(rawConfidence > 1 ? rawConfidence : rawConfidence * 100, 0), 100);
        maxConfidence = maxConfidence === null ? pct : Math.max(maxConfidence, pct);
      }
    }
    const topAgent = Array.from(agents.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
    const timestamp = latest.timestamp || latest.created_at || latest.createdAt || latest["@timestamp"];
    alerts.push({
      id: `ml-bruteforce-${ip}`,
      title: `Brute force attack from ${ip} (${group.length} attempts)`,
      severity: "critical",
      source: "ML Predictions",
      asset: ip,
      agent: topAgent,
      user: "-",
      reason: `Brute force: ${group.length} malicious packets from ${ip} | Top agent: ${topAgent}${maxConfidence === null ? "" : ` | Max confidence: ${Math.round(maxConfidence)}%`}`,
      timestamp,
      link: makeAlertLink("/ml-dashboard", { ...(ip !== "unknown" ? { sourceIp: ip } : {}), start, end }, timestamp, start, end),
    });
  }
  singles.forEach((item, index) => {
    const rawConfidence = Number(item.confidence);
    const confidence = Number.isFinite(rawConfidence) ? Math.min(Math.max(rawConfidence > 1 ? rawConfidence : rawConfidence * 100, 0), 100) : null;
    const label = String(item.predictedLabel || item.label || "").toLowerCase();
    if ((label.includes("sql_injection") || label.includes("xss")) && (confidence === null || confidence < 65)) return;
    const timestamp = item.timestamp || item.created_at || item.createdAt || item["@timestamp"];
    const agent = item.agent || "Unknown";
    alerts.push({
      id: `ml-${item.id || index}`,
      title: `${item.predictedLabel || item.label || "Threat"} detected by ML`,
      severity: mlSeverity(confidence),
      source: "ML Predictions",
      asset: agent,
      agent: item.agent || "-",
      user: "-",
      reason: `Service: ${item.service || "-"} | ${item.sourceIp || "-"} → ${item.destinationIp || "-"}${confidence === null ? "" : ` | Confidence: ${Math.round(confidence)}%`}`,
      timestamp,
      link: makeAlertLink("/ml-dashboard", item.agent ? { agent: item.agent } : {}, timestamp, start, end),
    });
  });
  return alerts;
}

async function fetchFimRows(start, end) {
  const baseUrl = `http://127.0.0.1:${Number(process.env.PORT || 5000)}/api/events`;
  const rows = [];
  const size = 500;
  let cursor = null;
  let total = null;
  let page = 1;
  for (;;) {
    const response = await axios.get(baseUrl, {
      params: { start, end, page, size, ...(cursor ? { search_after: JSON.stringify(cursor) } : {}) },
      timeout: 60_000,
    });
    const body = response?.data || {};
    const batch = Array.isArray(body.data) ? body.data : [];
    if (total === null) total = Number(body.total_hits ?? batch.length);
    rows.push(...batch);
    cursor = body.next_search_after || null;
    if (!cursor || batch.length === 0 || rows.length >= total || batch.length < size) break;
    page += 1;
  }
  return rows;
}

async function collectCursorSource(fetchPage, pageSize) {
  const rows = [];
  let page = 1;
  let cursor = null;
  let pitId = null;
  let total = null;
  for (;;) {
    const response = await fetchPage({ page, pageSize, cursor, pitId });
    const batch = Array.isArray(response?.data) ? response.data : [];
    if (total === null) total = Number(response?.pagination?.total ?? batch.length);
    rows.push(...batch);
    pitId = response?.pit_id || pitId;
    cursor = response?.next_search_after || null;
    if (!cursor || batch.length === 0 || rows.length >= total || batch.length < pageSize) break;
    page += 1;
  }
  return rows;
}

async function buildSnapshot(start, end) {
  const [attackData, fileData, fimData, mlData, botData] = await Promise.all([
    collectCursorSource(({ page, pageSize, cursor, pitId }) => listLinuxCommands({
      start, end, suspicious: "true", page, limit: pageSize, cursor: "1",
      ...(cursor ? { search_after: cursor } : {}), ...(pitId ? { pit_id: pitId } : {}),
    }), 1000),
    collectCursorSource(({ page, pageSize, cursor, pitId }) => listSuspiciousFileScans({
      start, end, page, limit: pageSize, cursor: "1",
      ...(cursor ? { search_after: cursor } : {}), ...(pitId ? { pit_id: pitId } : {}),
    }, { maxLimit: 100 }), 100),
    fetchFimRows(start, end),
    collectCursorSource(({ page, pageSize, cursor, pitId }) => listPredictions({
      start, end, page, limit: pageSize, cursor: "1",
      ...(cursor ? { search_after: cursor } : {}), ...(pitId ? { pit_id: pitId } : {}),
    }), 1000),
    collectBotAlerts(start, end),
  ]);
  const alerts = buildUnifiedAlerts({ attackData, fileData, fimData, mlData, botData, start, end });
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const alert of alerts) severityCounts[alert.severity] = (severityCounts[alert.severity] || 0) + 1;
  const countOptions = (key) => {
    const counts = new Map();
    for (const alert of alerts) {
      const value = String(alert[key] || "").trim();
      if (!value || value === "-") continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([value]) => value);
  };
  return { alerts, severityCounts, agentOptions: countOptions("agent"), userOptions: countOptions("user") };
}

async function getSnapshot(start, end) {
  const key = `${start}|${end}`;
  const cached = snapshotCache.get(key);
  if (cached && (cached.expiresAt > Date.now() || cached.expiresAt === Infinity)) return cached.promise;
  const entry = { expiresAt: Infinity, promise: null };
  entry.promise = buildSnapshot(start, end)
    .then((snapshot) => {
      entry.expiresAt = Date.now() + PAGE_CACHE_TTL_MS;
      return snapshot;
    })
    .catch((error) => {
      snapshotCache.delete(key);
      throw error;
    });
  snapshotCache.set(key, entry);
  while (snapshotCache.size > PAGE_CACHE_MAX_ENTRIES) snapshotCache.delete(snapshotCache.keys().next().value);
  return entry.promise;
}

export async function getAlertFeed(query = {}) {
  const end = query.end ? new Date(query.end).toISOString() : new Date().toISOString();
  const start = query.start ? new Date(query.start).toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const snapshot = await getSnapshot(start, end);
  const search = String(query.search || "").trim().toLowerCase();
  const severity = String(query.severity || "all").toLowerCase();
  const source = String(query.source || "all");
  const agent = String(query.agent || "all");
  const user = String(query.user || "all");
  const filtered = snapshot.alerts.filter((alert) => {
    if (severity !== "all" && alert.severity !== severity) return false;
    if (source !== "all" && alert.source !== source) return false;
    if (agent !== "all" && alert.agent !== agent) return false;
    if (user !== "all" && alert.user !== user) return false;
    if (search && ![alert.title, alert.source, alert.asset, alert.user, alert.reason].some((value) => String(value || "").toLowerCase().includes(search))) return false;
    return true;
  });
  const page = Math.max(parseInt(query.page || "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit || "25", 10) || 25, 1), 100);
  const total = filtered.length;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const activePage = Math.min(page, totalPages);
  const startIndex = (activePage - 1) * limit;
  return {
    pagination: { page: activePage, limit, total, totalPages },
    data: filtered.slice(startIndex, startIndex + limit),
    severityCounts: snapshot.severityCounts,
    agentOptions: snapshot.agentOptions,
    userOptions: snapshot.userOptions,
  };
}