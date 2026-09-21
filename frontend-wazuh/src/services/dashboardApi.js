import { API_BASE_URL } from "../config/Api";
import {
  buildTimelineSeries,
  createDefaultDateRange,
  getDateRangeMinutes,
  getIsoDateRange,
} from "../utils/dateRange";

const API_ROOT = `${API_BASE_URL}/api`;

const BAR_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981"];
const RISK_COLORS = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#84cc16",
};

const FILE_SEVERITY_ORDER = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
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

function bucketSeries(items, getTimestamp, getValue, dateRange) {
  return buildTimelineSeries(items, getTimestamp, getValue, dateRange);
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

function normalizeFileSeverity(value) {
  const severity = String(value || "").toUpperCase();
  return FILE_SEVERITY_ORDER[severity] !== undefined ? severity : "HIGH";
}

function getMaxFileSeverity(item) {
  const findings = safeArray(item?.findings);

  if (!findings.length) {
    return toCount(item?.findingsCount) > 0 ? "HIGH" : "LOW";
  }

  return findings.reduce((currentMax, finding) => {
    const nextSeverity = normalizeFileSeverity(
      finding?.severity || finding?.risk || finding?.level
    );
    return FILE_SEVERITY_ORDER[nextSeverity] > FILE_SEVERITY_ORDER[currentMax]
      ? nextSeverity
      : currentMax;
  }, "LOW");
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

function buildTopRanking(items, getKey, slice = 20) {
  const counts = new Map();

  safeArray(items).forEach((item) => {
    const key = String(getKey(item) || "").trim();
    if (!key || key === "-" || key === "Unknown agent") return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, value], index) => ({
      label,
      value,
      color: BAR_COLORS[index % BAR_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, slice);
}

function buildAgentRankingFromAgg(buckets, pickLabel) {
  // Memetakan hasil agregasi full-range backend (sudah mengikuti filter
  // tanggal start/end) menjadi [{ label, value }], tanpa batas 5.
  return safeArray(buckets)
    .map((bucket, index) => {
      const label = String(pickLabel(bucket) || "").trim();
      if (!label || label === "-") return null;
      return {
        label,
        value: toCount(bucket?.count ?? bucket?.doc_count),
        color: BAR_COLORS[index % BAR_COLORS.length],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);
}

function buildFimAgentRanking(events) {
  return buildTopRanking(events, (e) => e?.agentName || e?.agent_name);
}

function buildFileAgentRanking(files) {
  return buildTopRanking(files, (f) => f?.agentName || f?.agent_name);
}

function buildMlAgentRanking(predictions) {
  const byAgent = buildTopRanking(
    predictions,
    (p) => p?.agent || p?.agentName || p?.agent_name || (p?.agent && p?.agent?.name)
  );
  // Fallback: kalau agent.hostname kosong ("-"), pakai sourceIp dari prediksi yang sama
  // supaya tab ML tetap menampilkan data yang sesuai, bukan kosong.
  if (byAgent.length > 0) return byAgent;
  return buildTopRanking(predictions, (p) => p?.sourceIp || p?.source_ip || p?.src);
}

function buildHostAgentRanking(logs) {
  return buildTopRanking(logs, (l) => l?.agentName || l?.agent_name || (l?.agent && l?.agent.name));
}

function resolveFimPath(event) {
  return event?.syscheckPath || (event?.syscheck && event.syscheck.path) || event?.filePath || event?.path;
}

function resolveAgentName(item) {
  return item?.agentName || item?.agent_name || (item?.agent && item.agent.name) || "Unknown agent";
}

function buildMostChangedFiles(events) {
  const pathMap = new Map();

  safeArray(events).forEach((event) => {
    const path = String(resolveFimPath(event) || "").trim();
    if (!path || path === "-") return;

    const entry = pathMap.get(path) || { value: 0, agentCounts: new Map() };
    entry.value += 1;

    const agent = String(resolveAgentName(event) || "").trim();
    if (agent && agent !== "-" && agent !== "Unknown agent") {
      entry.agentCounts.set(agent, (entry.agentCounts.get(agent) || 0) + 1);
    }

    pathMap.set(path, entry);
  });

  return Array.from(pathMap.entries())
    .map(([path, entry], index) => {
      const agent = Array.from(entry.agentCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        label: path,
        value: entry.value,
        sub: agent,
        color: BAR_COLORS[index % BAR_COLORS.length],
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
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

function aggregateMlTimelineLabels(timeline) {
  const totals = new Map();

  safeArray(timeline).forEach((bucket) => {
    safeArray(bucket?.labels).forEach((entry) => {
      const label = entry?.label ?? entry?.key ?? entry?.name;
      if (label === undefined || label === null || label === "") return;
      totals.set(label, (totals.get(label) || 0) + toCount(entry?.count ?? entry?.doc_count ?? entry?.value));
    });
  });

  return Array.from(totals.entries()).map(([label, count]) => ({ label, count }));
}

function resolveMlLabels(mlStats, mlTimelineRaw, mlPredictionsRaw) {
  const statsLabels = safeArray(mlStats?.labels).filter(
    (item) => item && (item.label !== undefined || item.key !== undefined)
  ).map((item) => ({
    label: item.label ?? item.key,
    count: toCount(item.count ?? item.doc_count ?? item.value),
    avgConfidence: item.avgConfidence ?? null,
  }));

  if (statsLabels.some((item) => toCount(item.count) > 0)) return statsLabels;

  // Fallback 1: rangkum label per-bucket dari timeline supaya grafik
  // Threat Classification tetap menampilkan sinyal ML berbahaya/suspicious
  // meski endpoint stats gagal / kosong untuk rentang tanggal terpilih.
  const timelineLabels = aggregateMlTimelineLabels(mlTimelineRaw);
  if (timelineLabels.some((item) => toCount(item.count) > 0)) return timelineLabels;

  // Fallback 2 (seperti MlDashboard): hitung langsung dari daftar prediksi
  // mentah /api/ml/predictions agar label berbahaya tetap muncul di UI.
  return aggregateMlPredictionLabels(mlPredictionsRaw);
}

function aggregateMlPredictionLabels(predictions) {
  const totals = new Map();

  safeArray(predictions).forEach((prediction) => {
    const label =
      prediction?.predictedLabel ?? prediction?.predicted_label ??
      prediction?.label ?? prediction?.ml?.predicted_label ?? "unknown";
    if (!label) return;
    totals.set(label, (totals.get(label) || 0) + 1);
  });

  return Array.from(totals.entries()).map(([label, count]) => ({ label, count }));
}

const ML_THREAT_COLOR = "#a78bfa";

function buildThreatTypes({
  attackSuspicious,
  fileThreats,
  fimTotal,
  mlAnomalies,
  mlLabels = [],
}) {
  // ML dijadikan 1 bar agregat saja ("ML Threats") = total semua label
  // berbahaya/suspicious, agar tidak memecah grafik per label.
  const mlDetailTotal = safeArray(mlLabels)
    .filter((item) => classifyMlLabel(item?.label) !== "low")
    .reduce((sum, item) => sum + toCount(item?.count), 0);
  const mlValue = mlDetailTotal > 0 ? mlDetailTotal : toCount(mlAnomalies);

  // Bar ML selalu disertakan (walau 0) agar grafik Threat Classification
  // selalu menampilkan section ML di UI dashboard.
  const baseItems = [
    { label: "Suspicious Commands", value: attackSuspicious, color: "#ef4444" },
    { label: "Malicious Files", value: fileThreats, color: "#f97316" },
    { label: "FIM Changes", value: fimTotal, color: "#eab308" },
  ].filter((item) => toCount(item.value) > 0);

  return [
    ...baseItems,
    { label: "ML Threats", value: mlValue, color: ML_THREAT_COLOR },
  ];
}

function createEmptyDashboardData(dateRange = createDefaultDateRange()) {
  const emptySeries = bucketSeries([], () => Date.now(), () => 0, dateRange);

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
    topRankings: {
      host: [],
      fimAgents: [],
      file: [],
      ml: [],
    },
    riskDistribution: [
      { label: "Critical", value: 0, color: RISK_COLORS.Critical },
      { label: "High", value: 0, color: RISK_COLORS.High },
      { label: "Medium", value: 0, color: RISK_COLORS.Medium },
      { label: "Low", value: 0, color: RISK_COLORS.Low },
    ],
    mostChangedFiles: [],
    threatTypes: buildThreatTypes({
      attackSuspicious: 0,
      fileThreats: 0,
      fimTotal: 0,
      mlAnomalies: 0,
      mlLabels: [],
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
    mlMeta: { totalLabels: 0, suspiciousLabels: 0, source: "none" },
    warnings: [],
    lastUpdated: null,
  };
}

function fetchMlTimeline(minutes, dateRange) {
  const params = new URLSearchParams({
    minutes: String(minutes),
    ...getIsoDateRange(dateRange),
  });

  return fetchJson(`${API_ROOT}/ml/predictions/timeline?${params.toString()}`);
}

function buildWarningMessage(key, error) {
  const sourceNames = {
    attackStats: "attack stats",
    attackTimeline: "attack timeline",
    fileStats: "file scan stats",
    fileTimeline: "file scan timeline",
    fileSuspicious: "suspicious file list",
    fimEvents: "FIM events",
    fimAgentStats: "FIM agent stats",
    fimDistribution: "FIM severity distribution",
    mlStats: "ML stats",
    mlTimeline: "ML timeline",
    mlPredictions: "ML predictions",
  };

  return `${sourceNames[key] || key}: ${error?.message || "request failed"}`;
}

export async function getMainDashboardData(dateRange = createDefaultDateRange()) {
  const minutes = getDateRangeMinutes(dateRange);
  const { start, end } = getIsoDateRange(dateRange);
  const rangeParams = new URLSearchParams({ start, end });
  const timelineParams = new URLSearchParams({
    minutes: String(minutes),
    start,
    end,
  });
  const fimParams = new URLSearchParams({
    page: "1",
    size: "1000",
    start,
    end,
  });
  const fimTimelineParams = new URLSearchParams({ start, end });
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
  // NOTE: Grafik Threat Classification TIDAK memakai /ml/predictions (paginated hits).
  // Ia memakai /ml/predictions/stats + /ml/predictions/timeline yang merupakan
  // agregasi Elasticsearch full-range sesuai start/end (size:0, tanpa limit hits).
  // Request predictions di bawah ini HANYA untuk ranking agent ML (top-5) +
  // fallback darurat bila stats & timeline gagal, jadi limit kecil sudah cukup
  // dan tidak memengaruhi grafik.
  const mlRankingParams = new URLSearchParams({
    page: "1",
    limit: "200",
    start,
    end,
  });

  const requestEntries = [
    ["attackStats", fetchJson(`${API_ROOT}/linux-commands/stats?${rangeParams.toString()}`)],
    ["attackLogs", fetchJson(`${API_ROOT}/linux-commands?${attackListParams.toString()}`)],
    ["attackTimeline", fetchJson(`${API_ROOT}/linux-commands/timeline?${timelineParams.toString()}`)],
    ["fileStats", fetchJson(`${API_ROOT}/file-scans/stats?${rangeParams.toString()}`)],
    ["fileTimeline", fetchJson(`${API_ROOT}/file-scans/timeline?${timelineParams.toString()}`)],
    [
      "fileSuspicious",
      fetchJson(`${API_ROOT}/file-scans/suspicious?${fileSuspiciousParams.toString()}`),
    ],
    ["fimEvents", fetchJson(`${API_ROOT}/events?${fimParams.toString()}`)],
    ["fimTimeline", fetchJson(`${API_ROOT}/events/timeline?${fimTimelineParams.toString()}`)],
    ["fimAgentStats", fetchJson(`${API_ROOT}/events/agents/stats?${rangeParams.toString()}`)],
    ["fimDistribution", fetchJson(`${API_ROOT}/events/distribution/stats?${rangeParams.toString()}`)],
    ["mlStats", fetchJson(`${API_ROOT}/ml/predictions/stats?${rangeParams.toString()}`)],
    ["mlTimeline", fetchMlTimeline(minutes, dateRange)],
    ["mlPredictions", fetchJson(`${API_ROOT}/ml/predictions?${mlRankingParams.toString()}`)],
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
      return;
    }

    responses[key] = null;
    warnings.push(buildWarningMessage(key, result.reason));
  });

  if (successCount === 0) {
    throw new Error("All dashboard data sources are currently unavailable.");
  }

  // mlPredictions hanya sumber enrichment opsional untuk Threat Classification.
  // Jangan tampilkan warning "partial data" kalau stats/timeline ML sudah OK.
  if (responses.mlStats || responses.mlTimeline) {
    const mlPredWarningIndex = warnings.findIndex((message) =>
      String(message).startsWith("ML predictions")
    );
    if (mlPredWarningIndex >= 0) warnings.splice(mlPredWarningIndex, 1);
  }

  // fimAgentStats hanya enrichment untuk ranking agent FIM; kalau daftar
  // event FIM sudah OK, fallback hitung dari sampel tetap tersedia.
  if (responses.fimEvents) {
    const fimAgentWarningIndex = warnings.findIndex((message) =>
      String(message).startsWith("FIM agent stats")
    );
    if (fimAgentWarningIndex >= 0) warnings.splice(fimAgentWarningIndex, 1);
  }

  const attackStats = responses.attackStats?.data || {};
  const attackLogs = safeArray(responses.attackLogs?.data);
  const attackTimelineRaw = safeArray(responses.attackTimeline?.data);
  const fileStats = responses.fileStats?.data || {};
  const fileTimelineRaw = safeArray(responses.fileTimeline?.data);
  const suspiciousFiles = safeArray(responses.fileSuspicious?.data);
  const fimEventsRaw = safeArray(responses.fimEvents?.data);
  const fimTimelineRaw = safeArray(responses.fimTimeline?.data);
  const fimAgentBuckets = safeArray(responses.fimAgentStats?.data);
  const fimTotalHits = toCount(responses.fimEvents?.total_hits);
  const mlStats = responses.mlStats?.data || {};
  const mlTimelineRaw = safeArray(responses.mlTimeline?.data);
  const mlPredictionsRaw = safeArray(responses.mlPredictions?.data);

  const attackSuspicious = toCount(attackStats.suspiciousCommands);
  const fileThreats = toCount(fileStats.suspiciousScans);
  const fileScanned = toCount(fileStats.totalSuccessScans);
  // Full-range severity (no 1000-sample cap). Preferred source is the
  // lightweight distribution aggregation; if that endpoint is unavailable
  // (e.g. production backend predates the route), fall back to one adaptive
  // full-range fetch sized to the actual total_hits (capped by the index
  // max_result_window of 10000). Page-1 sample is the last resort.
  const fimDistSeverity = safeArray(responses.fimDistribution?.severity);
  let fimSeverityCounts = null;
  let fimSeverityExact = false;
  if (fimDistSeverity.length) {
    fimSeverityCounts = fimDistSeverity.reduce(
      (accumulator, item) => {
        const label = String(item?.label || "");
        if (label in accumulator) accumulator[label] = toCount(item?.value);
        return accumulator;
      },
      { Critical: 0, High: 0, Medium: 0, Low: 0 }
    );
    fimSeverityExact = true;
  } else {
    const adaptiveSize = Math.min(Math.max(fimTotalHits, 1), 10000);
    if (adaptiveSize > fimEventsRaw.length) {
      try {
        const fullParams = new URLSearchParams({
          page: "1",
          size: String(adaptiveSize),
          start,
          end,
        });
        const fullRes = await fetchJson(`${API_ROOT}/events?${fullParams.toString()}`);
        const fullData = safeArray(fullRes?.data);
        if (fullData.length) {
          fimSeverityCounts = buildFimSeverityCounts(fullData);
          fimSeverityExact = fullData.length >= fimTotalHits;
        }
      } catch {
        // fall through to sample counting below
      }
    }
    if (!fimSeverityCounts) {
      fimSeverityCounts = buildFimSeverityCounts(fimEventsRaw);
    }
  }
  if (fimSeverityExact) {
    const warningIndex = warnings.findIndex((message) =>
      String(message).startsWith("FIM severity distribution")
    );
    if (warningIndex >= 0) warnings.splice(warningIndex, 1);
  }
  const fileSeverityCounts = buildFileSeverityCounts(suspiciousFiles);
  const fimSuspicious = fimSeverityCounts.Critical + fimSeverityCounts.High;
  const mlLabels = resolveMlLabels(mlStats, mlTimelineRaw, mlPredictionsRaw);
  const mlCounts = buildMlCounts(mlLabels);
  const mlPredictions =
    toCount(mlStats.totalPredictions) ||
    mlLabels.reduce((sum, item) => sum + toCount(item.count), 0);

  const commandEvents = bucketSeries(
    attackTimelineRaw,
    (item) => item?.timestamp,
    (item) => item?.total,
    dateRange
  );
  const fileEvents = bucketSeries(
    fileTimelineRaw,
    (item) => item?.timestamp,
    (item) => item?.suspicious ?? item?.total,
    dateRange
  );
  const fimEvents = bucketSeries(
    fimTimelineRaw.length ? fimTimelineRaw : fimEventsRaw,
    (item) => item?.timestamp,
    (item) => item?.total ?? 1,
    dateRange
  );
  const mlEvents = bucketSeries(
    mlTimelineRaw,
    (item) => item?.timestamp,
    (item) => item?.total,
    dateRange
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
  const fimSummary = getSeriesSummary(fimEvents);

  const userRanking =
    buildTopUsers(attackStats.users).length > 0
      ? buildTopUsers(attackStats.users)
      : buildTopUsersFromLogs(attackLogs);

  // Ranking agent: utamakan agregasi full-range backend yang sudah mengikuti
  // filter tanggal (start/end), bukan hitungan dari sampel hits yang terpotong
  // limit (500/1000). Fallback ke sampel hanya bila endpoint agg gagal.
  const hostAgentRanking = safeArray(attackStats.agents).length
    ? buildAgentRankingFromAgg(attackStats.agents, (b) => b?.agent)
    : buildHostAgentRanking(attackLogs);
  const fimAgentRanking = fimAgentBuckets.length
    ? buildAgentRankingFromAgg(fimAgentBuckets, (b) => b?.agent)
    : buildFimAgentRanking(fimEventsRaw);
  const fileAgentRanking = safeArray(fileStats.topAgents).length
    ? buildAgentRankingFromAgg(fileStats.topAgents, (b) => b?.name)
    : buildFileAgentRanking(suspiciousFiles);

  const topRankings = {
    host: hostAgentRanking,
    fimAgents: fimAgentRanking,
    file: fileAgentRanking,
    ml: buildMlAgentRanking(mlPredictionsRaw),
  };

  const mostChangedFiles = buildMostChangedFiles(fimEventsRaw);

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
    topRankings,
    riskDistribution,
    mostChangedFiles,
    threatTypes: buildThreatTypes({
      attackSuspicious,
      fileThreats,
      fimTotal: fimTotalHits,
      mlAnomalies: mlCounts.anomalies,
      mlLabels,
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
    mlMeta: {
      totalLabels: mlLabels.length,
      suspiciousLabels: safeArray(mlLabels).filter(
        (item) =>
          classifyMlLabel(item?.label) !== "low" && toCount(item?.count) > 0
      ).length,
      source: responses.mlStats
        ? "stats"
        : responses.mlTimeline
          ? "timeline"
          : responses.mlPredictions
            ? "predictions"
            : "none",
    },
    warnings,
    lastUpdated: new Date().toISOString(),
  };
}

export { createEmptyDashboardData };
