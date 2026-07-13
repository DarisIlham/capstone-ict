import { API_BASE_URL } from "../config/Api";
import { inferFileSeverity } from "../utils/fileSeverity";

const API_ROOT = `${API_BASE_URL}/api`;

const RANGE_TO_MINUTES = {
  "1h": 60,
  "24h": 24 * 60,
  "7d": 7 * 24 * 60,
  "30d": 30 * 24 * 60,
};

const RANGE_TO_MS = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const RANGE_STEP_MS = {
  "1h": 5 * 60 * 1000,
  "24h": 60 * 60 * 1000,
  "7d": 6 * 60 * 60 * 1000,
  "30d": 24 * 60 * 60 * 1000,
};

const BAR_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981"];
const RISK_COLORS = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#84cc16",
};

function toCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function getRangeWindow(rangeKey) {
  const end = new Date();
  const start = new Date(end);

  switch (rangeKey) {
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

function bucketSeries(items, getTimestamp, getValue, rangeKey) {
  const rangeMs = RANGE_TO_MS[rangeKey] || RANGE_TO_MS["24h"];
  const stepMs = RANGE_STEP_MS[rangeKey] || RANGE_STEP_MS["24h"];
  const now = Date.now();
  const startMs = now - rangeMs;
  const bucketStart = (ms) => Math.floor(ms / stepMs) * stepMs;

  const buckets = new Map();
  safeArray(items).forEach((item) => {
    const rawTimestamp = getTimestamp(item);
    const ts = new Date(rawTimestamp).getTime();

    if (!Number.isFinite(ts) || ts < startMs || ts > now) {
      return;
    }

    const key = bucketStart(ts);
    buckets.set(key, (buckets.get(key) || 0) + Math.max(0, toCount(getValue(item))));
  });

  const series = [];
  for (let t = bucketStart(startMs); t <= bucketStart(now); t += stepMs) {
    series.push({ t, v: buckets.get(t) || 0 });
  }

  return series;
}

function getSeriesSummary(series) {
  const values = safeArray(series).map((item) => toCount(item.v));
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = values.length ? Math.max(...values) : 0;
  const avg = values.length ? total / values.length : 0;

  return {
    total,
    peak,
    avg: round(avg),
  };
}

function getMaxFileSeverity(item) {
  return inferFileSeverity(item);
}

function getFimSeverity(level) {
  const numericLevel = toCount(level);
  if (numericLevel >= 12) return "Critical";
  if (numericLevel >= 8) return "High";
  if (numericLevel >= 5) return "Medium";
  return "Low";
}

function classifyMlLabel(label) {
  const normalized = String(label || "").toLowerCase();

  if (normalized.includes("benign") || normalized.includes("normal")) return "low";
  if (normalized.includes("suspicious") || normalized.includes("anomaly")) return "medium";
  if (
    normalized.includes("malicious") ||
    normalized.includes("attack") ||
    normalized.includes("ransom") ||
    normalized.includes("botnet")
  ) {
    return "critical";
  }

  return "high";
}

function formatLabel(value) {
  if (!value) return "-";
  return String(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildTopUsers(users) {
  return safeArray(users)
    .filter((item) => Boolean(item?.user || item?.label))
    .slice(0, 5)
    .map((item, index) => ({
      label: item.user || item.label,
      value: toCount(item.count || item.value),
      color: BAR_COLORS[index % BAR_COLORS.length],
    }));
}

function buildTopUsersFromLogs(items) {
  const counts = new Map();

  safeArray(items).forEach((item) => {
    const user = String(item?.user || "").trim();
    if (!user || user === "-") return;
    counts.set(user, (counts.get(user) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((item, index) => ({
      ...item,
      color: BAR_COLORS[index % BAR_COLORS.length],
    }));
}

function buildHostData(events) {
  const hostCounts = new Map();

  safeArray(events).forEach((event) => {
    const host = event?.agentName || "-";
    hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
  });

  return Array.from(hostCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildFileSeverityCounts(items) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  safeArray(items).forEach((item) => {
    const severity = getMaxFileSeverity(item);
    counts[severity] = (counts[severity] || 0) + 1;
  });

  return counts;
}

function buildFimSeverityCounts(events) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };

  safeArray(events).forEach((event) => {
    const severity = getFimSeverity(event?.ruleLevel);
    counts[severity] = (counts[severity] || 0) + 1;
  });

  return counts;
}

function buildMlCounts(labels) {
  const counts = {
    benign: 0,
    medium: 0,
    high: 0,
    critical: 0,
    topRiskLabel: "-",
    anomalies: 0,
  };

  const nonBenign = [];

  safeArray(labels).forEach((item) => {
    const count = toCount(item?.count);
    const riskClass = classifyMlLabel(item?.label);

    if (riskClass === "low") counts.benign += count;
    if (riskClass === "medium") counts.medium += count;
    if (riskClass === "high") counts.high += count;
    if (riskClass === "critical") counts.critical += count;

    if (riskClass !== "low") {
      nonBenign.push({
        label: item?.label,
        count,
      });
    }
  });

  counts.anomalies = counts.medium + counts.high + counts.critical;
  counts.topRiskLabel =
    nonBenign.sort((a, b) => b.count - a.count)[0]?.label || safeArray(labels)[0]?.label || "-";

  return counts;
}

function buildRiskDistribution({
  attackSuspicious,
  fileStats,
  fileSeverityCounts,
  fimSeverityCounts,
  mlCounts,
}) {
  return [
    {
      label: "Critical",
      value:
        fileSeverityCounts.CRITICAL +
        fimSeverityCounts.Critical +
        mlCounts.critical,
      color: RISK_COLORS.Critical,
    },
    {
      label: "High",
      value:
        attackSuspicious +
        fileSeverityCounts.HIGH +
        fimSeverityCounts.High +
        mlCounts.high,
      color: RISK_COLORS.High,
    },
    {
      label: "Medium",
      value:
        fileSeverityCounts.MEDIUM +
        fimSeverityCounts.Medium +
        mlCounts.medium,
      color: RISK_COLORS.Medium,
    },
    {
      label: "Low",
      value:
        toCount(fileStats?.cleanScans) +
        fileSeverityCounts.LOW +
        fimSeverityCounts.Low +
        mlCounts.benign,
      color: RISK_COLORS.Low,
    },
  ];
}

function buildThreatTypes({
  attackSuspicious,
  fileThreats,
  fimTotal,
  mlAnomalies,
}) {
  return [
    { label: "Suspicious Commands", value: attackSuspicious, color: "#ef4444" },
    { label: "Malicious Files", value: fileThreats, color: "#f97316" },
    { label: "FIM Changes", value: fimTotal, color: "#eab308" },
    { label: "ML Anomalies", value: mlAnomalies, color: "#a78bfa" },
  ];
}

function createEmptyDashboardData(rangeKey = "24h") {
  const emptySeries = bucketSeries([], () => Date.now(), () => 0, rangeKey);

  return {
    stats: {
      totalAttacks: 0,
      totalThreats: 0,
      fileScanned: 0,
      fimEvents: 0,
      suspiciousActivities: 0,
      avgRiskScore: 0,
      systemHealth: 100,
    },
    userRanking: [],
    riskDistribution: [
      { label: "Critical", value: 0, color: RISK_COLORS.Critical },
      { label: "High", value: 0, color: RISK_COLORS.High },
      { label: "Medium", value: 0, color: RISK_COLORS.Medium },
      { label: "Low", value: 0, color: RISK_COLORS.Low },
    ],
    hostData: [],
    threatTypes: buildThreatTypes({
      attackSuspicious: 0,
      fileThreats: 0,
      fimTotal: 0,
      mlAnomalies: 0,
    }),
    commandEvents: emptySeries,
    fileEvents: emptySeries,
    fimEvents: emptySeries,
    mlEvents: emptySeries,
    quickStats: {
      attack: { totalCommands: 0, peak: 0, avg: 0, suspicious: 0 },
      file: { scanned: 0, threats: 0, detectionRate: 0, health: 100 },
      fim: { totalEvents: 0, peak: 0, avg: 0, suspicious: 0 },
      ml: { predictions: 0, anomalies: 0, confidence: 0, topRisk: "-" },
    },
    warnings: [],
    lastUpdated: null,
  };
}

async function fetchMlTimeline(minutes) {
  try {
    return await fetchJson(`${API_ROOT}/ml/predictions/timeline?minutes=${minutes}`);
  } catch (error) {
    const fallback = await fetchJson(
      `${API_ROOT}/ml/predictions/timeline-mock?minutes=${minutes}`
    );
    return {
      ...fallback,
      fallbackNotice: "ML timeline menggunakan fallback mock karena endpoint real-time gagal.",
    };
  }
}

function buildWarningMessage(key, error) {
  const sourceNames = {
    attackStats: "attack stats",
    attackTimeline: "attack timeline",
    fileStats: "file scan stats",
    fileTimeline: "file scan timeline",
    fileSuspicious: "suspicious file list",
    fimEvents: "FIM events",
    mlStats: "ML stats",
    mlTimeline: "ML timeline",
  };

  return `${sourceNames[key] || key}: ${error?.message || "request failed"}`;
}

export async function getMainDashboardData(rangeKey = "24h") {
  const minutes = RANGE_TO_MINUTES[rangeKey] || RANGE_TO_MINUTES["24h"];
  const { start, end } = getRangeWindow(rangeKey);
  const fimParams = new URLSearchParams({
    page: "1",
    size: "1000",
    start,
    end,
  });
  const fileSuspiciousParams = new URLSearchParams({
    page: "1",
    limit: "500",
    start,
    end,
  });
  const attackListParams = new URLSearchParams({
    page: "1",
    limit: "500",
    start,
    end,
  });

  const requestEntries = [
    ["attackStats", fetchJson(`${API_ROOT}/linux-commands/stats`)],
    ["attackLogs", fetchJson(`${API_ROOT}/linux-commands?${attackListParams.toString()}`)],
    ["attackTimeline", fetchJson(`${API_ROOT}/linux-commands/timeline?minutes=${minutes}`)],
    ["fileStats", fetchJson(`${API_ROOT}/file-scans/stats`)],
    ["fileTimeline", fetchJson(`${API_ROOT}/file-scans/timeline?minutes=${minutes}`)],
    [
      "fileSuspicious",
      fetchJson(`${API_ROOT}/file-scans/suspicious?${fileSuspiciousParams.toString()}`),
    ],
    ["fimEvents", fetchJson(`${API_ROOT}/events?${fimParams.toString()}`)],
    ["mlStats", fetchJson(`${API_ROOT}/ml/predictions/stats`)],
    ["mlTimeline", fetchMlTimeline(minutes)],
  ];

  const settled = await Promise.allSettled(requestEntries.map(([, request]) => request));
  const responses = {};
  const warnings = [];
  let successCount = 0;

  settled.forEach((result, index) => {
    const key = requestEntries[index][0];

    if (result.status === "fulfilled") {
      responses[key] = result.value;
      successCount += 1;
      if (result.value?.fallbackNotice) {
        warnings.push(result.value.fallbackNotice);
      }
      return;
    }

    responses[key] = null;
    warnings.push(buildWarningMessage(key, result.reason));
  });

  if (successCount === 0) {
    throw new Error("All dashboard data sources are currently unavailable.");
  }

  const attackStats = responses.attackStats?.data || {};
  const attackLogs = safeArray(responses.attackLogs?.data);
  const attackTimelineRaw = safeArray(responses.attackTimeline?.data);
  const fileStats = responses.fileStats?.data || {};
  const fileTimelineRaw = safeArray(responses.fileTimeline?.data);
  const suspiciousFiles = safeArray(responses.fileSuspicious?.data);
  const fimEventsRaw = safeArray(responses.fimEvents?.data);
  const fimTotalHits = toCount(responses.fimEvents?.total_hits);
  const mlStats = responses.mlStats?.data || {};
  const mlTimelineRaw = safeArray(responses.mlTimeline?.data);

  const attackSuspicious = toCount(attackStats.suspiciousCommands);
  const fileThreats = toCount(fileStats.suspiciousScans);
  const fileScanned = toCount(fileStats.totalSuccessScans);
  const fimSeverityCounts = buildFimSeverityCounts(fimEventsRaw);
  const fileSeverityCounts = buildFileSeverityCounts(suspiciousFiles);
  const fimSuspicious = fimSeverityCounts.Critical + fimSeverityCounts.High;
  const mlCounts = buildMlCounts(mlStats.labels);
  const mlPredictions = toCount(mlStats.totalPredictions);

  const commandEvents = bucketSeries(
    attackTimelineRaw,
    (item) => item?.timestamp,
    (item) => item?.total,
    rangeKey
  );
  const fileEvents = bucketSeries(
    fileTimelineRaw,
    (item) => item?.timestamp,
    (item) => item?.suspicious ?? item?.total,
    rangeKey
  );
  const fimEvents = bucketSeries(
    fimEventsRaw,
    (item) => item?.timestamp,
    () => 1,
    rangeKey
  );
  const mlEvents = bucketSeries(
    mlTimelineRaw,
    (item) => item?.timestamp,
    (item) => item?.total,
    rangeKey
  );

  const riskDistribution = buildRiskDistribution({
    attackSuspicious,
    fileStats,
    fileSeverityCounts,
    fimSeverityCounts,
    mlCounts,
  });

  const riskIndex = riskDistribution.reduce(
    (accumulator, item) => ({ ...accumulator, [item.label]: toCount(item.value) }),
    {}
  );
  const totalRiskSignals = riskDistribution.reduce(
    (sum, item) => sum + toCount(item.value),
    0
  );

  const avgRiskScore = totalRiskSignals
    ? round(
        ((riskIndex.Critical * 4 + riskIndex.High * 3 + riskIndex.Medium * 1.5) /
          (totalRiskSignals * 4)) *
          10
      )
    : 0;

  const attackHealth = toCount(attackStats.totalCommands)
    ? clamp(100 - (attackSuspicious / toCount(attackStats.totalCommands)) * 100, 0, 100)
    : 100;
  const fileHealth = toCount(fileStats.totalEvents)
    ? clamp(
        ((toCount(fileStats.totalEvents) - toCount(fileStats.totalErrorScans)) /
          toCount(fileStats.totalEvents)) *
          100,
        0,
        100
      )
    : 100;
  const fimHealth = fimTotalHits
    ? clamp(100 - (fimSuspicious / fimTotalHits) * 100, 0, 100)
    : 100;
  const mlHealth = mlPredictions
    ? clamp((mlCounts.benign / mlPredictions) * 100, 0, 100)
    : 100;
  const systemHealth = round(
    (attackHealth + fileHealth + fimHealth + mlHealth) / 4
  );

  const commandSummary = getSeriesSummary(commandEvents);
  const fileSummary = getSeriesSummary(fileEvents);
  const fimSummary = getSeriesSummary(fimEvents);

  const userRanking =
    buildTopUsers(attackStats.users).length > 0
      ? buildTopUsers(attackStats.users)
      : buildTopUsersFromLogs(attackLogs);

  return {
    stats: {
      totalAttacks: toCount(attackStats.totalCommands),
      totalThreats: fileThreats + mlCounts.anomalies,
      fileScanned,
      fimEvents: fimTotalHits,
      suspiciousActivities: attackSuspicious + fimSuspicious,
      avgRiskScore,
      systemHealth,
    },
    userRanking,
    riskDistribution,
    hostData: buildHostData(fimEventsRaw),
    threatTypes: buildThreatTypes({
      attackSuspicious,
      fileThreats,
      fimTotal: fimTotalHits,
      mlAnomalies: mlCounts.anomalies,
    }),
    commandEvents,
    fileEvents,
    fimEvents,
    mlEvents,
    quickStats: {
      attack: {
        totalCommands: toCount(attackStats.totalCommands),
        peak: commandSummary.peak,
        avg: commandSummary.avg,
        suspicious: attackSuspicious,
      },
      file: {
        scanned: fileScanned,
        threats: fileThreats,
        detectionRate: fileScanned ? round((fileThreats / fileScanned) * 100) : 0,
        health: round(fileHealth),
      },
      fim: {
        totalEvents: fimTotalHits,
        peak: fimSummary.peak,
        avg: fimSummary.avg,
        suspicious: fimSuspicious,
      },
      ml: {
        predictions: mlPredictions,
        anomalies: mlCounts.anomalies,
        confidence: round(toCount(mlStats.overallAvgConfidence) * 100),
        topRisk: formatLabel(mlCounts.topRiskLabel),
      },
    },
    warnings,
    lastUpdated: new Date().toISOString(),
  };
}

export { createEmptyDashboardData };
