// services/botDetectionService.js
// Shadow-mode Bot Detection: ML botnet alerts (Zeek conn.log, ML model)
// + behavior alerts (SUSPECTED_HTTP_BRUTE_FORCE / SUSPECTED_PORT_SCAN).
// Monitoring only — no mitigation actions are exposed anywhere here.

import es from "../config/elasticsearch.js";
import {
  unwrapEsResponse,
  getHits,
  getTotalHits,
  getField,
  exactMatchClause,
  buildOptionalExactFilter,
  buildContainsClause,
  normalizePagination,
  getHistogramInterval
} from "../utils/esHelpers.js";

export const ML_ALERTS_INDEX = "capstone-zeek-botnet-alerts-*";
export const BEHAVIOR_ALERTS_INDEX = "capstone-zeek-behavior-alerts-*";

const ML_INDEX_PREFIX = "capstone-zeek-botnet-alerts-";
const BEHAVIOR_INDEX_PREFIX = "capstone-zeek-behavior-alerts-";

// Canonical behavior detector types (alert_type). Legacy detector versions
// emitted SUSPECTED_* names — they are canonicalized, never double counted.
export const BEHAVIOR_TYPES = [
  "HTTP_BRUTE_FORCE",
  "SSH_BRUTE_FORCE",
  "PORT_SCAN",
  "HOST_SCAN",
  "CONNECTION_FLOOD",
  "BEACONING"
];

const LEGACY_TYPE_MAP = {
  SUSPECTED_HTTP_BRUTE_FORCE: "HTTP_BRUTE_FORCE",
  SUSPECTED_PORT_SCAN: "PORT_SCAN"
};

function canonicalBehaviorType(value) {
  const upper = String(value || "").toUpperCase();
  return LEGACY_TYPE_MAP[upper] || upper;
}

// alert_type values accepted by Elasticsearch for each canonical type.
const BEHAVIOR_TYPE_FILTER_VALUES = {
  HTTP_BRUTE_FORCE: ["HTTP_BRUTE_FORCE", "SUSPECTED_HTTP_BRUTE_FORCE"],
  SSH_BRUTE_FORCE: ["SSH_BRUTE_FORCE"],
  PORT_SCAN: ["PORT_SCAN", "SUSPECTED_PORT_SCAN"],
  HOST_SCAN: ["HOST_SCAN"],
  CONNECTION_FLOOD: ["CONNECTION_FLOOD"],
  BEACONING: ["BEACONING"]
};

function isIndexNotFound(err) {
  const type =
    err?.meta?.body?.error?.type ||
    err?.body?.error?.type ||
    err?.meta?.body?.error?.reason ||
    "";
  return String(type).includes("index_not_found_exception");
}

// Runs an ES search that tolerates a not-yet-created index:
// returns { response, missing } where missing=true means the index
// does not exist (dataset treated as empty, never HTTP 500).
async function safeSearch(params) {
  try {
    const response = unwrapEsResponse(await es.search(params));
    return { response, missing: false };
  } catch (err) {
    if (isIndexNotFound(err)) {
      return { response: { hits: { total: { value: 0 }, hits: [] }, aggregations: {} }, missing: true };
    }
    throw err;
  }
}

function resolveTimeRange(query = {}) {
  // Dashboard always sends start/end; default to last 24h when absent
  // so aggregations never scan an unbounded range.
  if (query.start || query.end) {
    const range = {};
    if (query.start) range.gte = query.start;
    if (query.end) range.lte = query.end;
    return range;
  }
  return { gte: "now-24h", lte: "now" };
}

function normalizeDetector(value) {
  const v = String(value || "all").toLowerCase();
  if (v === "ml" || v === "ml_botnet" || v === "botnet") return "ml";
  if (v === "behavior" || v === "behaviour") return "behavior";
  return "all";
}

function normalizeBehaviorType(value) {
  const v = String(value || "all").toUpperCase();
  if (v === "HTTP" || v === "HTTP_BRUTE_FORCE" || v === "HTTP_BRUTEFORCE") return "HTTP_BRUTE_FORCE";
  if (v === "SSH" || v === "SSH_BRUTE_FORCE" || v === "SSH_BRUTEFORCE") return "SSH_BRUTE_FORCE";
  if (v === "PORT" || v === "PORT_SCAN" || v === "PORTSCAN") return "PORT_SCAN";
  if (v === "HOST" || v === "HOST_SCAN" || v === "HOSTSCAN") return "HOST_SCAN";
  if (v === "FLOOD" || v === "CONNECTION" || v === "CONNECTION_FLOOD" || v === "CONNECTIONFLOOD") return "CONNECTION_FLOOD";
  if (v === "BEACON" || v === "BEACONING") return "BEACONING";
  if (v === "SUSPECTED_HTTP_BRUTE_FORCE") return "HTTP_BRUTE_FORCE";
  if (v === "SUSPECTED_PORT_SCAN") return "PORT_SCAN";
  if (BEHAVIOR_TYPES.includes(v)) return v;
  return "all";
}

function buildSearchClause(query) {
  const q = String(query.search || query.q || "").trim();
  if (!q) return null;
  const ors = ["src_ip", "dst_ip", "uid", "uri", "reason", "agent.name", "host.hostname", "host.name"]
    .map((field) => buildContainsClause(field, q))
    .filter(Boolean);
  if (!ors.length) return null;
  return { bool: { should: ors, minimum_should_match: 1 } };
}

// Shared bool-filter for both indices. forMl=true applies ML-only
// filters (proto, minProbability); otherwise behavior-only filters
// (alert_type, severity, detection_source, protocol) are applied.
function buildFilter(query = {}, { forMl }) {
  const filter = [{ range: { "@timestamp": resolveTimeRange(query) } }];

  const push = (clause) => {
    if (clause) filter.push(clause);
  };

  push(buildOptionalExactFilter("src_ip", query.srcIp || query.src_ip));
  push(buildOptionalExactFilter("dst_ip", query.dstIp || query.dst_ip));
  push(buildOptionalExactFilter("agent.name", query.agent || query.agentName));

  if (forMl) {
    const proto = String(query.protocol || "").trim().toLowerCase();
    if (proto) push(buildOptionalExactFilter("proto", proto));
    const minProb = Number(query.minProbability ?? query.min_probability);
    if (Number.isFinite(minProb)) {
      filter.push({ range: { botnet_probability: { gte: minProb } } });
    }
  } else {
    const behaviorType = normalizeBehaviorType(query.behaviorType || query.behavior_type);
    if (behaviorType !== "all") {
      // Robust across mappings: match keyword sub-field or plain field.
      const accepted = BEHAVIOR_TYPE_FILTER_VALUES[behaviorType] || [behaviorType];
      filter.push({
        bool: {
          should: accepted.flatMap((acceptedValue) => [
            { term: { "alert_type.keyword": acceptedValue } },
            { term: { alert_type: acceptedValue } }
          ]),
          minimum_should_match: 1
        }
      });
    }
    const severity = String(query.severity || "").trim().toUpperCase();
    if (severity && severity !== "ALL") push(buildOptionalExactFilter("severity", severity));
    const detectionSource = String(query.detectionSource || query.detection_source || "").trim();
    if (detectionSource) push(buildOptionalExactFilter("detection_source", detectionSource));
    const protocol = String(query.protocol || "").trim().toLowerCase();
    if (protocol) push(buildOptionalExactFilter("protocol", protocol));
  }

  const searchClause = buildSearchClause(query);
  if (searchClause) filter.push(searchClause);

  return filter;
}

function getMinutes(query = {}) {
  const range = resolveTimeRange(query);
  const startMs = range.gte ? new Date(range.gte).getTime() : NaN;
  const endMs = range.lte ? new Date(range.lte).getTime() : Date.now();
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    return Math.max(Math.ceil((endMs - startMs) / 60000), 1);
  }
  return 24 * 60;
}

function resolveAgent(src) {
  // agent.hostname di mapping bisa berupa alias / tidak ada di _source,
  // jadi baca agent.name dengan fallback ke host.* (seperti mlService).
  for (const path of ["agent.name", "host.hostname", "host.name", "hostname"]) {
    const value = getField(src, path);
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized && normalized !== "-") return normalized;
  }
  return null;
}

function firstScalar(src, paths = []) {
  for (const path of paths) {
    const value = getField(src, path);
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized && normalized !== "-") return normalized;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function firstNumber(src, paths = []) {
  for (const path of paths) {
    const raw = getField(src, path);
    // null/undefined/"" must stay missing: Number(null) === 0 would
    // turn absent counters into fake zeros.
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function firstArray(src, paths = []) {
  for (const path of paths) {
    const value = getField(src, path);
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return null;
}

// Primary count/indicator metric per behavior type:
// { value, label } — label is a short unit ("attempts", "conns", "ports", "hosts").
function behaviorPrimary(src, alertType) {
  switch (alertType) {
    case "HTTP_BRUTE_FORCE":
      return { value: firstNumber(src, ["attempts_in_window", "request_count", "count"]), label: "attempts" };
    case "SSH_BRUTE_FORCE":
      return { value: firstNumber(src, ["attempts_in_window", "connections_in_window", "connection_count", "count"]), label: "attempts" };
    case "PORT_SCAN":
      return { value: firstNumber(src, ["unique_destination_ports", "unique_ports", "count"]), label: "ports" };
    case "HOST_SCAN":
      return { value: firstNumber(src, ["unique_hosts", "unique_host_count", "unique_destination_hosts", "count"]), label: "hosts" };
    case "CONNECTION_FLOOD":
      return { value: firstNumber(src, ["connections_in_window", "connection_count", "count"]), label: "conns" };
    case "BEACONING":
      return { value: firstNumber(src, ["connections_observed", "connection_count", "count"]), label: "conns" };
    default:
      return {
        value: firstNumber(src, ["connections_in_window", "connections_observed", "attempts_in_window", "request_count", "connection_count", "unique_destination_ports", "unique_hosts", "count"]),
        label: "events"
      };
  }
}

function normalizeAlert(hit) {
  const src = hit._source || {};
  const index = hit._index || "";
  const isMl = index.startsWith(ML_INDEX_PREFIX);
  const modeRaw = getField(src, "detector_mode") ?? getField(src, "mode") ?? "shadow";

  const base = {
    id: hit._id,
    index,
    timestamp: getField(src, "processed_at_utc") || getField(src, "@timestamp"),
    eventTimestamp: isMl
      ? getField(src, "zeek_ts")
      : getField(src, "event_ts"),
    mode: String(modeRaw || "shadow").toLowerCase(),
    agent: resolveAgent(src),
    raw: src
  };

  if (isMl) {
    const numOrNull = (raw) =>
      raw === null || raw === undefined || raw === "" || !Number.isFinite(Number(raw)) ? null : Number(raw);
    const probability = numOrNull(getField(src, "botnet_probability"));
    const origBytes = numOrNull(getField(src, "orig_bytes"));
    const respBytes = numOrNull(getField(src, "resp_bytes"));
    const origPkts = numOrNull(getField(src, "orig_pkts"));
    const respPkts = numOrNull(getField(src, "resp_pkts"));
    return {
      ...base,
      detectorType: "ml",
      detectionType: "BOTNET",
      severity: null,
      sourceIp: getField(src, "src_ip"),
      sourcePort: getField(src, "src_port"),
      destinationIp: getField(src, "dst_ip"),
      destinationPort: getField(src, "dst_port"),
      protocol: getField(src, "proto"),
      indicator: getField(src, "service") || getField(src, "conn_state"),
      probability: Number.isFinite(probability) ? probability : null,
      threshold: getField(src, "threshold") ?? 0.5,
      origBytes: Number.isFinite(origBytes) ? origBytes : null,
      respBytes: Number.isFinite(respBytes) ? respBytes : null,
      totalBytes: Number.isFinite(origBytes) || Number.isFinite(respBytes)
        ? (Number.isFinite(origBytes) ? origBytes : 0) + (Number.isFinite(respBytes) ? respBytes : 0)
        : null,
      origPkts: Number.isFinite(origPkts) ? origPkts : null,
      respPkts: Number.isFinite(respPkts) ? respPkts : null,
      totalPackets: Number.isFinite(origPkts) || Number.isFinite(respPkts)
        ? (Number.isFinite(origPkts) ? origPkts : 0) + (Number.isFinite(respPkts) ? respPkts : 0)
        : null
    };
  }

  const rawType = String(getField(src, "alert_type") || "");
  const alertType = canonicalBehaviorType(rawType);
  const primary = behaviorPrimary(src, alertType);
  return {
    ...base,
    detectorType: "behavior",
    detectionType: BEHAVIOR_TYPES.includes(alertType) ? alertType : rawType,
    alertType: rawType,
    severity: getField(src, "severity"),
    sourceIp: firstScalar(src, ["source_ip", "src_ip", "source.ip"]),
    sourcePort: firstScalar(src, ["source_port", "src_port", "source.port"]),
    destinationIp: firstScalar(src, ["destination_ip", "dst_ip", "destination.ip"]),
    destinationPort: firstScalar(src, ["destination_port", "dst_port", "destination.port"]),
    protocol: firstScalar(src, ["protocol", "proto"]) || null,
    method: firstScalar(src, ["method"]) || null,
    uri: firstScalar(src, ["uri"]) || null,
    httpHost: firstScalar(src, ["http_host", "http.hostname", "url.domain", "host"]) || null,
    // Legacy-compatible fields (kept for existing consumers).
    attempts: firstNumber(src, ["attempts_in_window", "request_count"]) ?? null,
    uniqueSourcePorts: firstNumber(src, ["unique_source_ports"]) ?? null,
    uniqueDestinationPorts: firstNumber(src, ["unique_destination_ports", "unique_ports"]) ?? null,
    destinationPorts: firstArray(src, ["destination_ports"]) || null,
    destinationHosts: firstArray(src, ["destination_hosts", "target_hosts", "unique_host_list"]) || null,
    // Generic primary metric used by table highlight + cards.
    primaryValue: primary.value,
    primaryLabel: primary.label,
    threshold: firstNumber(src, ["threshold", "beacon_min_connections"]) ?? null,
    windowSeconds: firstNumber(src, ["window_seconds", "observation_window_seconds"]) ?? null,
    reason: firstScalar(src, ["reason", "message", "description"]) || null,
    detectionSource: firstScalar(src, ["detection_source", "source"]) || null,
    category: firstScalar(src, ["category"]) || null,
    connStateCounts: getField(src, "conn_state_counts") || null,
    meanInterval: firstNumber(src, ["mean_interval_seconds", "mean_interval", "avg_interval"]),
    intervalCv: firstNumber(src, ["interval_cv"]),
    intervalStddev: firstNumber(src, ["interval_stddev_seconds", "interval_stddev"]),
    minInterval: firstNumber(src, ["min_interval_seconds", "min_interval"]),
    maxInterval: firstNumber(src, ["max_interval_seconds", "max_interval"]),
    connectionsObserved: firstNumber(src, ["connections_observed"]),
    beaconMaxCv: firstNumber(src, ["beacon_max_cv"])
  };
}

export async function getSummary(query = {}) {
  const detector = normalizeDetector(query.detector);
  const wantMl = detector !== "behavior";
  const wantBehavior = detector !== "ml";

  let ml = { response: null, missing: !wantMl };
  let behavior = { response: null, missing: !wantBehavior };

  if (wantMl) {
    ml = await safeSearch({
      index: ML_ALERTS_INDEX,
      ignore_unavailable: true,
      allow_no_indices: true,
      size: 0,
      track_total_hits: true,
      query: { bool: { filter: buildFilter(query, { forMl: true }) } },
      aggs: {
        avg_probability: { avg: { field: "botnet_probability" } },
        max_probability: { max: { field: "botnet_probability" } },
        min_probability: { min: { field: "botnet_probability" } }
      }
    });
  }

  if (wantBehavior) {
    behavior = await safeSearch({
      index: BEHAVIOR_ALERTS_INDEX,
      ignore_unavailable: true,
      allow_no_indices: true,
      size: 0,
      track_total_hits: true,
      query: { bool: { filter: buildFilter(query, { forMl: false }) } },
      aggs: {
        by_type: { terms: { field: "alert_type.keyword", size: 20 } },
        by_severity: { terms: { field: "severity.keyword", size: 10 } },
        unique_sources: { cardinality: { field: "src_ip.keyword" } },
        unique_targets: { cardinality: { field: "dst_ip.keyword" } },
        last_alert: { max: { field: "@timestamp" } }
      }
    });
  }

  const mlCount = ml.response ? getTotalHits(ml.response) : 0;
  const behaviorTotal = behavior.response ? getTotalHits(behavior.response) : 0;
  const typeBuckets = behavior.response?.aggregations?.by_type?.buckets || [];
  const byType = Object.fromEntries(BEHAVIOR_TYPES.map((t) => [t, 0]));
  for (const bucket of typeBuckets) {
    const canonical = canonicalBehaviorType(bucket.key);
    if (byType[canonical] !== undefined) byType[canonical] += Number(bucket.doc_count || 0);
  }
  const severityBuckets = behavior.response?.aggregations?.by_severity?.buckets || [];
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const bucket of severityBuckets) {
    const key = String(bucket.key || "").toLowerCase();
    if (bySeverity[key] !== undefined) bySeverity[key] += Number(bucket.doc_count || 0);
  }
  const lastAlertMs = behavior.response?.aggregations?.last_alert?.value ?? null;

  return {
    mlBotnetAlerts: mlCount,
    averageBotnetProbability: ml.response?.aggregations?.avg_probability?.value ?? null,
    maxBotnetProbability: ml.response?.aggregations?.max_probability?.value ?? null,
    minBotnetProbability: ml.response?.aggregations?.min_probability?.value ?? null,
    httpBruteForceAlerts: byType.HTTP_BRUTE_FORCE,
    portScanAlerts: byType.PORT_SCAN,
    behaviorTotal,
    byType,
    bySeverity,
    uniqueSources: behavior.response?.aggregations?.unique_sources?.value ?? 0,
    uniqueTargets: behavior.response?.aggregations?.unique_targets?.value ?? 0,
    lastAlert: Number.isFinite(lastAlertMs) ? new Date(lastAlertMs).toISOString() : null,
    totalAlerts: mlCount + behaviorTotal,
    mlAvailable: !ml.missing,
    behaviorAvailable: !behavior.missing
  };
}

export async function getTrend(query = {}) {
  const detector = normalizeDetector(query.detector);
  const minutes = getMinutes(query);
  const interval = getHistogramInterval(minutes);
  const range = resolveTimeRange(query);

  const histogramAgg = (subAggs) => ({
    date_histogram: {
      field: "@timestamp",
      fixed_interval: interval,
      min_doc_count: 0,
      ...(range.gte && range.lte ? { extended_bounds: { min: range.gte, max: range.lte } } : {})
    },
    ...(subAggs ? { aggs: subAggs } : {})
  });

  const [ml, behavior] = await Promise.all([
    detector === "behavior"
      ? { response: null }
      : safeSearch({
          index: ML_ALERTS_INDEX,
          ignore_unavailable: true,
          allow_no_indices: true,
          size: 0,
          query: { bool: { filter: buildFilter(query, { forMl: true }) } },
          aggs: { over_time: histogramAgg() }
        }),
    detector === "ml"
      ? { response: null }
      : safeSearch({
          index: BEHAVIOR_ALERTS_INDEX,
          ignore_unavailable: true,
          allow_no_indices: true,
          size: 0,
          query: { bool: { filter: buildFilter(query, { forMl: false }) } },
          aggs: {
            over_time: histogramAgg({
              by_type: { terms: { field: "alert_type.keyword", size: 20 } }
            })
          }
        })
  ]);

  const merged = new Map();
  const blankBehaviorCounts = () => Object.fromEntries(BEHAVIOR_TYPES.map((t) => [t, 0]));
  const ensure = (key, asString) => {
    if (!merged.has(key)) {
      merged.set(key, { timestamp: asString, mlBotnet: 0, ...blankBehaviorCounts() });
    }
    return merged.get(key);
  };

  for (const bucket of ml.response?.aggregations?.over_time?.buckets || []) {
    const point = ensure(bucket.key, bucket.key_as_string);
    point.mlBotnet += Number(bucket.doc_count || 0);
  }
  for (const bucket of behavior.response?.aggregations?.over_time?.buckets || []) {
    const point = ensure(bucket.key, bucket.key_as_string);
    for (const sub of bucket.by_type?.buckets || []) {
      const canonical = canonicalBehaviorType(sub.key);
      if (point[canonical] !== undefined) point[canonical] += Number(sub.doc_count || 0);
    }
  }

  return Array.from(merged.entries())
    .sort(([a], [b]) => a - b)
    .map(([, point]) => point);
}

export async function getDistribution(query = {}) {
  const summary = await getSummary(query);
  return [
    { type: "ML Botnet", count: summary.mlBotnetAlerts },
    { type: "HTTP Brute Force", count: summary.byType?.HTTP_BRUTE_FORCE || 0 },
    { type: "SSH Brute Force", count: summary.byType?.SSH_BRUTE_FORCE || 0 },
    { type: "Port Scan", count: summary.byType?.PORT_SCAN || 0 },
    { type: "Host Scan", count: summary.byType?.HOST_SCAN || 0 },
    { type: "Connection Flood", count: summary.byType?.CONNECTION_FLOOD || 0 },
    { type: "Beaconing", count: summary.byType?.BEACONING || 0 }
  ];
}

async function termsTop(query, field, size, forMl) {
  const { response } = await safeSearch({
    index: forMl ? ML_ALERTS_INDEX : BEHAVIOR_ALERTS_INDEX,
    ignore_unavailable: true,
    allow_no_indices: true,
    size: 0,
    track_total_hits: false,
    query: { bool: { filter: buildFilter(query, { forMl }) } },
    aggs: { top: { terms: { field: `${field}.keyword`, size } } }
  });
  return (response?.aggregations?.top?.buckets || []).map((b) => ({
    key: b.key,
    count: b.doc_count
  }));
}

export async function getTopSources(query = {}) {
  const detector = normalizeDetector(query.detector);
  const size = Math.min(Math.max(parseInt(query.size || "5", 10) || 5, 1), 20);
  const combined = new Map();

  const mergeBuckets = (buckets) => {
    for (const b of buckets) {
      if (b.key === undefined || b.key === null || b.key === "") continue;
      combined.set(b.key, (combined.get(b.key) || 0) + Number(b.count || 0));
    }
  };

  if (detector !== "behavior") mergeBuckets(await termsTop(query, "src_ip", size * 2, true));
  if (detector !== "ml") mergeBuckets(await termsTop(query, "src_ip", size * 2, false));

  return Array.from(combined.entries())
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, size);
}

export async function getTopDestinations(query = {}) {
  const detector = normalizeDetector(query.detector);
  const size = 5;
  const combined = new Map();

  if (detector !== "behavior") {
    for (const b of await termsTop(query, "dst_ip", size * 2, true)) {
      if (b.key === undefined || b.key === null || b.key === "") continue;
      combined.set(b.key, (combined.get(b.key) || 0) + Number(b.count || 0));
    }
  }
  if (detector !== "ml") {
    for (const b of await termsTop(query, "dst_ip", size * 2, false)) {
      if (b.key === undefined || b.key === null || b.key === "") continue;
      combined.set(b.key, (combined.get(b.key) || 0) + Number(b.count || 0));
    }
  }

  const destinations = Array.from(combined.entries())
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, size);

  // ML-only enrichment: most targeted destination ports.
  let topPorts = [];
  if (detector !== "behavior") {
    const { response } = await safeSearch({
      index: ML_ALERTS_INDEX,
      ignore_unavailable: true,
      allow_no_indices: true,
      size: 0,
      track_total_hits: false,
      query: { bool: { filter: buildFilter(query, { forMl: true }) } },
      aggs: { top_ports: { terms: { field: "dst_port", size } } }
    });
    topPorts = (response?.aggregations?.top_ports?.buckets || []).map((b) => ({
      port: b.key,
      count: b.doc_count
    }));
  }

  return { destinations, topPorts };
}

export async function getTopAgents(query = {}) {
  const detector = normalizeDetector(query.detector);
  const combined = new Map();

  const collect = async (forMl) => {
    try {
      const { response } = await safeSearch({
        index: forMl ? ML_ALERTS_INDEX : BEHAVIOR_ALERTS_INDEX,
        ignore_unavailable: true,
        allow_no_indices: true,
        size: 0,
        track_total_hits: false,
        query: { bool: { filter: buildFilter(query, { forMl }) } },
        aggs: { by_agent: { terms: { field: "agent.name.keyword", size: 100 } } }
      });
      return response?.aggregations?.by_agent?.buckets || [];
    } catch {
      // Satu index bermasalah (mis. beda mapping) tidak boleh
      // menggagalkan seluruh endpoint — anggap kosong.
      return [];
    }
  };

  const jobs = [];
  if (detector !== "behavior") jobs.push(collect(true));
  if (detector !== "ml") jobs.push(collect(false));

  for (const buckets of await Promise.all(jobs)) {
    for (const b of buckets) {
      if (b.key === undefined || b.key === null || b.key === "" || b.key === "-") continue;
      combined.set(b.key, (combined.get(b.key) || 0) + Number(b.doc_count || 0));
    }
  }

  const ranked = Array.from(combined.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { agents: ranked.slice(0, 5), uniqueAgents: ranked.length };
}

const PROBABILITY_RANGES = [
  { key: "0.50–0.59", from: 0.5, to: 0.6 },
  { key: "0.60–0.69", from: 0.6, to: 0.7 },
  { key: "0.70–0.79", from: 0.7, to: 0.8 },
  { key: "0.80–0.89", from: 0.8, to: 0.9 },
  { key: "0.90–1.00", from: 0.9, to: 1.01 }
];

export async function getProbability(query = {}) {
  if (normalizeDetector(query.detector) === "behavior") {
    return {
      available: true,
      total: 0,
      average: null,
      maximum: null,
      minimum: null,
      threshold: 0.5,
      buckets: PROBABILITY_RANGES.map(({ key }) => ({ range: key, count: 0 }))
    };
  }
  const { response, missing } = await safeSearch({
    index: ML_ALERTS_INDEX,
    ignore_unavailable: true,
    allow_no_indices: true,
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: buildFilter(query, { forMl: true }) } },
    aggs: {
      avg_probability: { avg: { field: "botnet_probability" } },
      max_probability: { max: { field: "botnet_probability" } },
      min_probability: { min: { field: "botnet_probability" } },
      by_range: {
        range: {
          field: "botnet_probability",
          keyed: true,
          ranges: PROBABILITY_RANGES.map(({ key, from, to }) => ({ key, from, to }))
        }
      }
    }
  });

  const buckets = response?.aggregations?.by_range?.buckets || {};
  return {
    available: !missing,
    total: getTotalHits(response),
    average: response?.aggregations?.avg_probability?.value ?? null,
    maximum: response?.aggregations?.max_probability?.value ?? null,
    minimum: response?.aggregations?.min_probability?.value ?? null,
    threshold: 0.5,
    buckets: PROBABILITY_RANGES.map(({ key }) => ({
      range: key,
      count: Number(buckets[key]?.doc_count || 0)
    }))
  };
}

export async function getTraffic(query = {}) {
  // Traffic volume only exists on ML botnet documents
  // (orig_bytes/resp_bytes/orig_pkts/resp_pkts from Zeek conn.log).
  if (normalizeDetector(query.detector) === "behavior") {
    return {
      available: true,
      totalBytes: 0,
      averageBytes: 0,
      totalPackets: 0,
      totalConnections: 0,
      topTalkers: [],
      topDestinations: [],
      topVMs: []
    };
  }

  const bytesSubAggs = {
    ob: { sum: { field: "orig_bytes" } },
    rb: { sum: { field: "resp_bytes" } },
    op: { sum: { field: "orig_pkts" } },
    rp: { sum: { field: "resp_pkts" } }
  };

  const { response, missing } = await safeSearch({
    index: ML_ALERTS_INDEX,
    ignore_unavailable: true,
    allow_no_indices: true,
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: buildFilter(query, { forMl: true }) } },
    aggs: {
      ...bytesSubAggs,
      top_src: {
        terms: { field: "src_ip.keyword", size: 100 },
        aggs: bytesSubAggs
      },
      top_dst: {
        terms: { field: "dst_ip.keyword", size: 100 },
        aggs: bytesSubAggs
      },
      top_agent_traffic: {
        terms: { field: "agent.name.keyword", size: 100 },
        aggs: bytesSubAggs
      }
    }
  });

  const num = (v) => Number(v) || 0;
  const totalBytes = num(response?.aggregations?.ob?.value) + num(response?.aggregations?.rb?.value);
  const totalPackets = num(response?.aggregations?.op?.value) + num(response?.aggregations?.rp?.value);
  const totalConnections = getTotalHits(response);

  const mapBuckets = (buckets) => (buckets || [])
    .filter((b) => b.key !== undefined && b.key !== null && b.key !== "")
    .map((b) => ({
      ip: b.key,
      bytes: num(b.ob?.value) + num(b.rb?.value),
      packets: num(b.op?.value) + num(b.rp?.value),
      connections: b.doc_count || 0
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5);

  // Top VMs by Traffic: total bytes per reporting agent (agent.name).
  const topVMs = (response?.aggregations?.top_agent_traffic?.buckets || [])
    .filter((b) => b.key !== undefined && b.key !== null && b.key !== "" && b.key !== "-")
    .map((b) => ({
      agent: b.key,
      bytes: num(b.ob?.value) + num(b.rb?.value),
      packets: num(b.op?.value) + num(b.rp?.value),
      connections: b.doc_count || 0
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5);

  return {
    available: !missing,
    totalBytes,
    averageBytes: totalConnections > 0 ? totalBytes / totalConnections : 0,
    totalPackets,
    totalConnections,
    topTalkers: mapBuckets(response?.aggregations?.top_src?.buckets),
    topDestinations: mapBuckets(response?.aggregations?.top_dst?.buckets),
    topVMs
  };
};

export async function getTrafficTimeline(query = {}) {
  // Bytes over time per agent — feeds the Top VMs wave chart.
  if (normalizeDetector(query.detector) === "behavior") {
    return { agents: [], points: [] };
  }
  const minutes = getMinutes(query);
  const interval = getHistogramInterval(minutes);
  const range = resolveTimeRange(query);

  const { response } = await safeSearch({
    index: ML_ALERTS_INDEX,
    ignore_unavailable: true,
    allow_no_indices: true,
    size: 0,
    query: { bool: { filter: buildFilter(query, { forMl: true }) } },
    aggs: {
      over_time: {
        date_histogram: {
          field: "@timestamp",
          fixed_interval: interval,
          min_doc_count: 0,
          ...(range.gte && range.lte ? { extended_bounds: { min: range.gte, max: range.lte } } : {})
        },
        aggs: {
          by_agent: {
            terms: { field: "agent.name.keyword", size: 5 },
            aggs: {
              ob: { sum: { field: "orig_bytes" } },
              rb: { sum: { field: "resp_bytes" } }
            }
          }
        }
      }
    }
  });

  const totals = new Map();
  const rows = (response?.aggregations?.over_time?.buckets || []).map((bucket) => {
    const point = { timestamp: bucket.key_as_string };
    for (const sub of bucket.by_agent?.buckets || []) {
      if (sub.key === undefined || sub.key === null || sub.key === "" || sub.key === "-") continue;
      const bytes = (Number(sub.ob?.value) || 0) + (Number(sub.rb?.value) || 0);
      point[sub.key] = bytes;
      totals.set(sub.key, (totals.get(sub.key) || 0) + bytes);
    }
    return { key: bucket.key, point };
  });

  const agents = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const points = rows
    .sort((a, b) => a.key - b.key)
    .map(({ point }) => {
      const full = { timestamp: point.timestamp };
      for (const name of agents) full[name] = Number(point[name]) || 0;
      return full;
    });

  return { agents, points };
}

const BEHAVIOR_SUMMARY_NUM_FIELD = {
  HTTP_BRUTE_FORCE: "attempts_in_window",
  SSH_BRUTE_FORCE: "attempts_in_window",
  PORT_SCAN: "unique_destination_ports",
  HOST_SCAN: "unique_hosts",
  CONNECTION_FLOOD: "connections_in_window",
  BEACONING: "connections_observed"
};

export async function getBehaviorSummary(query = {}) {
  if (normalizeDetector(query.detector) === "ml") {
    return {
      available: true,
      types: Object.fromEntries(
        BEHAVIOR_TYPES.map((t) => [t, { total: 0, averagePrimary: null, maximumPrimary: null, topSourceIp: null, topDestinationIp: null }])
      )
    };
  }

  const summarizeType = async (alertType) => {
    const accepted = BEHAVIOR_TYPE_FILTER_VALUES[alertType] || [alertType];
    const { response } = await safeSearch({
      index: BEHAVIOR_ALERTS_INDEX,
      ignore_unavailable: true,
      allow_no_indices: true,
      size: 0,
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            ...buildFilter({ ...query, behaviorType: "all" }, { forMl: false }),
            {
              bool: {
                should: accepted.flatMap((acceptedValue) => [
                  { term: { "alert_type.keyword": acceptedValue } },
                  { term: { alert_type: acceptedValue } }
                ]),
                minimum_should_match: 1
              }
            }
          ]
        }
      },
      aggs: {
        avg_primary: { avg: { field: BEHAVIOR_SUMMARY_NUM_FIELD[alertType] } },
        max_primary: { max: { field: BEHAVIOR_SUMMARY_NUM_FIELD[alertType] } },
        top_sources: { terms: { field: "src_ip.keyword", size: 1 } },
        top_destinations: { terms: { field: "dst_ip.keyword", size: 1 } }
      }
    });
    return {
      total: getTotalHits(response),
      averagePrimary: response?.aggregations?.avg_primary?.value ?? null,
      maximumPrimary: response?.aggregations?.max_primary?.value ?? null,
      topSourceIp: response?.aggregations?.top_sources?.buckets?.[0]?.key ?? null,
      topDestinationIp: response?.aggregations?.top_destinations?.buckets?.[0]?.key ?? null
    };
  };

  const entries = await Promise.all(
    BEHAVIOR_TYPES.map(async (alertType) => [alertType, await summarizeType(alertType)])
  );

  return {
    available: true,
    types: Object.fromEntries(entries)
  };
}

export async function listAlerts(query = {}) {
  const detector = normalizeDetector(query.detector);
  const { page, limit, from } = normalizePagination(query, { maxLimit: 10000 });
  const order = String(query.order || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const sort = [{ "@timestamp": { order } }];

  const targets = [];
  if (detector !== "behavior") targets.push({ index: ML_ALERTS_INDEX, forMl: true });
  if (detector !== "ml") targets.push({ index: BEHAVIOR_ALERTS_INDEX, forMl: false });

  const mlFilter = buildFilter(query, { forMl: true });
  const behaviorFilter = buildFilter(query, { forMl: false });

  // Indices have different mappings: query each with its own filter, then
  // merge + sort in memory. Slices always start at from=0 on the ES side
  // (windowing happens in memory), so the fetch size alone must respect
  // the Elasticsearch max_result_window (10000).
  const fetchCount = Math.min(from + limit, 10000);

  const searches = [];
  for (const target of targets) {
    searches.push(
      safeSearch({
        index: target.index,
        ignore_unavailable: true,
        allow_no_indices: true,
        size: fetchCount,
        track_total_hits: true,
        sort,
        query: { bool: { filter: target.forMl ? mlFilter : behaviorFilter } }
      })
    );
  }

  const results = await Promise.all(searches);
  let total = 0;
  const merged = [];
  for (const { response } of results) {
    total += getTotalHits(response);
    for (const hit of getHits(response)) merged.push(normalizeAlert(hit));
  }

  merged.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return order === "asc" ? ta - tb : tb - ta;
  });

  return {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit) || 1, 1)
    },
    data: merged.slice(from, from + limit)
  };
}

export async function getAlertDetail(index, id) {
  const cleanIndex = String(index || "");
  const cleanId = String(id || "");
  const allowed =
    (cleanIndex.startsWith(ML_INDEX_PREFIX) || cleanIndex.startsWith(BEHAVIOR_INDEX_PREFIX)) &&
    !/[*?,\s"']/.test(cleanIndex) &&
    cleanId.length > 0;

  if (!allowed) {
    const err = new Error("Invalid index or id");
    err.statusCode = 400;
    throw err;
  }

  let response;
  try {
    response = unwrapEsResponse(await es.get({ index: cleanIndex, id: cleanId }));
  } catch (err) {
    if (err?.meta?.statusCode === 404 || err?.statusCode === 404) {
      const notFound = new Error("Alert not found");
      notFound.statusCode = 404;
      throw notFound;
    }
    throw err;
  }

  const source = response?._source || response?.body?._source;
  if (!source) {
    const notFound = new Error("Alert not found");
    notFound.statusCode = 404;
    throw notFound;
  }

  return normalizeAlert({ _id: response._id || cleanId, _index: cleanIndex, _source: source });
}
