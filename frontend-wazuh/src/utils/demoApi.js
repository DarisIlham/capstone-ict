// Demo API: interseptor fetch global untuk MODE DEMO. Saat aktif, seluruh
// endpoint data (/api/...) dijawab dengan data dummy yang konsisten —
// API/Elasticsearch asli TIDAK disentuh (tidak dibaca, tidak ditulis).
//
// Yang dilewatkan (tetap asli): auth, users, notifications, presence,
// virustotal, health, hunting, db. Login tetap asli.

import {
  isDemoMode,
  seededRng,
  pick,
  int,
  DEMO_AGENTS,
  DEMO_USERS,
  DEMO_PUBLIC_IPS,
  DEMO_PRIVATE_IPS,
  DEMO_URIS,
  DEMO_ML_LABELS,
  pickWeighted,
  DEMO_COMMANDS,
  DEMO_FILES,
  DEMO_FINDINGS,
  DEMO_FIM_PATHS,
  DEMO_FIM_EVENTS,
  demoRange,
  demoPage,
  paginate,
  bucketize,
} from "./demoMode";

const PASS_THROUGH = [
  "/api/auth/",
  "/api/users/",
  "/api/notifications/",
  "/api/virustotal/",
  "/api/health",
  "/api/hunting",
  "/api/db/",
];

function shouldMock(url) {
  if (!isDemoMode() || typeof url !== "string") return false;
  let path = "";
  try {
    path = new URL(url, window.location.origin).pathname;
  } catch {
    return false;
  }
  if (!path.includes("/api/")) return false;
  if (PASS_THROUGH.some((p) => path.includes(p))) return false;
  return true;
}

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function pagedEnvelope(list, page, limit, extra = {}) {
  const { slice, pagination } = paginate(list, page, limit);
  return { success: true, pagination, data: slice, ...extra };
}

// ═══════════════ BOT DETECTION ═══════════════
const BOT_BEHAVIOR_TYPES = [
  "HTTP_BRUTE_FORCE",
  "SSH_BRUTE_FORCE",
  "PORT_SCAN",
  "HOST_SCAN",
  "CONNECTION_FLOOD",
  "BEACONING",
];

function buildBotAlerts(startMs, endMs) {
  const rnd = seededRng(1001);
  const alerts = [];
  let n = 0;
  const iso = (ms) => new Date(ms).toISOString();
  const span = endMs - startMs;
  const at = (f) => startMs + Math.floor(span * f);
  // Volume proporsional rentang: ~4 alert ML/jam (min 8, maks 1500).
  const hours = Math.max(span / 3600000, 0.25);
  const scale = Math.min(Math.max(hours / 24, 0.15), 30);

  // — ML botnet alerts —
  const mlCount = Math.min(Math.max(Math.round(96 * scale), 8), 1500);
  for (let i = 0; i < mlCount; i += 1) {
    const t = at(rnd());
    const agent = pick(rnd, DEMO_AGENTS);
    const prob = 0.5 + rnd() * 0.49;
    const ob = int(rnd, 200, 90000);
    const rb = int(rnd, 100, 60000);
    const op = int(rnd, 2, 900);
    const rp = int(rnd, 1, 600);
    n += 1;
    alerts.push({
      id: `demo-ml-${n}`,
      index: "capstone-zeek-botnet-alerts-demo",
      timestamp: iso(t),
      eventTimestamp: iso(t - 1000),
      mode: "shadow",
      agent: agent.name,
      detectorType: "ml",
      detectionType: "BOTNET",
      severity: null,
      sourceIp: pick(rnd, DEMO_PUBLIC_IPS),
      sourcePort: int(rnd, 1024, 65535),
      destinationIp: pick(rnd, DEMO_PRIVATE_IPS),
      destinationPort: pick(rnd, [80, 443, 8080, 22]),
      protocol: pick(rnd, ["tcp", "tcp", "tcp", "udp"]),
      indicator: pick(rnd, ["http", "ssl", "dns", "SF", "S0"]),
      probability: Math.round(prob * 10000) / 10000,
      threshold: 0.5,
      origBytes: ob,
      respBytes: rb,
      totalBytes: ob + rb,
      origPkts: op,
      respPkts: rp,
      totalPackets: op + rp,
      rulePackets: op + rp,
      hits: int(rnd, 1, 12),
      totalTrafficBytes: ob + rb,
    });
  }

  // — Behavior alerts (distribusi jumlah ikut skala rentang, maks ~1450) —
  const sevPool = ["critical", "high", "medium", "medium", "low"];
  const bScale = Math.min(scale, 17);
  const behaviorPlan = [
    ["HTTP_BRUTE_FORCE", Math.max(2, Math.round(26 * bScale))],
    ["SSH_BRUTE_FORCE", Math.max(1, Math.round(14 * bScale))],
    ["PORT_SCAN", Math.max(1, Math.round(18 * bScale))],
    ["HOST_SCAN", Math.max(0, Math.round(9 * bScale))],
    ["CONNECTION_FLOOD", Math.max(1, Math.round(11 * bScale))],
    ["BEACONING", Math.max(0, Math.round(7 * bScale))],
  ];
  for (const [type, count] of behaviorPlan) {
    for (let i = 0; i < count; i += 1) {
      const t = at(rnd());
      const agent = pick(rnd, DEMO_AGENTS);
      const attempts = int(rnd, 20, 400);
      const windowSeconds = 60;
      n += 1;
      alerts.push({
        id: `demo-behavior-${n}`,
        index: "capstone-zeek-behavior-alerts-demo",
        timestamp: iso(t),
        eventTimestamp: iso(t - 500),
        mode: "shadow",
        agent: agent.name,
        detectorType: "behavior",
        detectionType: type,
        alertType: type,
        severity: pick(rnd, sevPool),
        sourceIp: pick(rnd, DEMO_PUBLIC_IPS),
        sourcePort: int(rnd, 1024, 65535),
        destinationIp: pick(rnd, DEMO_PRIVATE_IPS),
        destinationPort: pick(rnd, [80, 443, 22, 8080]),
        protocol: pick(rnd, ["tcp", "tcp", "udp"]),
        method: type === "HTTP_BRUTE_FORCE" ? "POST" : null,
        uri: type === "HTTP_BRUTE_FORCE" ? pick(rnd, DEMO_URIS) : null,
        httpHost: null,
        attempts,
        attempts_in_window: attempts,
        uniqueSourcePorts: int(rnd, 1, 8),
        uniqueDestinationPorts: type === "PORT_SCAN" ? int(rnd, 15, 120) : int(rnd, 1, 5),
        unique_destination_ports: type === "PORT_SCAN" ? int(rnd, 15, 120) : undefined,
        unique_hosts: type === "HOST_SCAN" ? int(rnd, 10, 80) : undefined,
        connections_in_window: ["SSH_BRUTE_FORCE", "CONNECTION_FLOOD"].includes(type) ? attempts : undefined,
        connections_observed: type === "BEACONING" ? attempts : undefined,
        destinationPorts: null,
        destinationHosts: null,
        primaryValue: attempts,
        primaryLabel: "attempts",
        threshold: Math.max(5, Math.round(attempts / 3)),
        windowSeconds,
        reason: `${type.replace(/_/g, " ")} burst from single source`,
        detectionSource: "zeek",
        category: "reconnaissance",
        connStateCounts: null,
        meanInterval: null,
        intervalCv: null,
        intervalStddev: null,
        minInterval: null,
        maxInterval: null,
        connectionsObserved: type === "BEACONING" ? attempts : null,
        beaconMaxCv: null,
      });
    }
  }
  alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return alerts;
}

function botFilterAlerts(alerts, q) {
  const detector = String(q.get("detector") || "all").toLowerCase();
  const behaviorType = String(q.get("behaviorType") || q.get("behavior_type") || "all");
  const protocol = String(q.get("protocol") || "").toLowerCase();
  const minProb = Number(q.get("minProbability") ?? q.get("min_probability"));
  const minPackets = Number(q.get("minPackets") ?? q.get("min_packets"));
  const agent = q.get("agent") || q.get("agentName");
  const srcIp = q.get("srcIp") || q.get("src_ip");
  const dstIp = q.get("dstIp") || q.get("dst_ip");
  const search = String(q.get("search") || q.get("q") || "").toLowerCase();
  return alerts.filter((a) => {
    if (detector === "ml" || detector === "ml_botnet" || detector === "botnet") {
      if (a.detectorType !== "ml") return false;
    } else if (detector === "behavior" || detector === "behaviour") {
      if (a.detectorType !== "behavior") return false;
    }
    if (behaviorType && behaviorType !== "all" && a.detectorType === "behavior") {
      const bt = behaviorType.toUpperCase();
      const dt = String(a.detectionType || "").toUpperCase();
      if (dt !== bt && !dt.includes(bt) &&
          !(bt === "HTTP" && a.detectionType === "HTTP_BRUTE_FORCE") &&
          !(bt === "SSH" && a.detectionType === "SSH_BRUTE_FORCE") &&
          !(bt === "PORT" && a.detectionType === "PORT_SCAN") &&
          !(bt === "HOST" && a.detectionType === "HOST_SCAN") &&
          !(bt === "FLOOD" && a.detectionType === "CONNECTION_FLOOD") &&
          !(bt === "BEACON" && a.detectionType === "BEACONING")) return false;
    }
    if (protocol && String(a.protocol || "").toLowerCase() !== protocol) return false;
    if (Number.isFinite(minProb) && (a.probability ?? 1) < minProb) return false;
    if (Number.isFinite(minPackets) && (a.rulePackets ?? a.totalPackets ?? 0) < minPackets) return false;
    if (agent && a.agent !== agent) return false;
    if (srcIp && a.sourceIp !== srcIp) return false;
    if (dstIp && a.destinationIp !== dstIp) return false;
    if (search) {
      const hay = [a.sourceIp, a.destinationIp, a.agent, a.reason, a.uri].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function demoBotSummary(alerts, endMs) {
  const ml = alerts.filter((a) => a.detectorType === "ml");
  const behavior = alerts.filter((a) => a.detectorType === "behavior");
  const byType = Object.fromEntries(BOT_BEHAVIOR_TYPES.map((t) => [t, 0]));
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const sources = new Set();
  const targets = new Set();
  for (const b of behavior) {
    if (byType[b.detectionType] !== undefined) byType[b.detectionType] += 1;
    const sev = String(b.severity || "").toLowerCase();
    if (bySeverity[sev] !== undefined) bySeverity[sev] += 1;
    if (b.sourceIp) sources.add(b.sourceIp);
    if (b.destinationIp) targets.add(b.destinationIp);
  }
  const probs = ml.map((a) => a.probability).filter((v) => Number.isFinite(v));
  return {
    mlBotnetAlerts: ml.length,
    averageBotnetProbability: probs.length ? probs.reduce((s, v) => s + v, 0) / probs.length : null,
    maxBotnetProbability: probs.length ? Math.max(...probs) : null,
    minBotnetProbability: probs.length ? Math.min(...probs) : null,
    httpBruteForceAlerts: byType.HTTP_BRUTE_FORCE,
    portScanAlerts: byType.PORT_SCAN,
    behaviorTotal: behavior.length,
    byType,
    bySeverity,
    uniqueSources: sources.size,
    uniqueTargets: targets.size,
    lastAlert: alerts.length ? alerts[0].timestamp : new Date(endMs).toISOString(),
    totalAlerts: alerts.length,
    mlAvailable: true,
    behaviorAvailable: true,
  };
}

function demoBotTrend(alerts, startMs, endMs) {
  const { buckets } = bucketize(startMs, endMs, 24);
  return buckets.map((t) => {
    const next = t + (buckets[1] - buckets[0] || 3600000);
    const point = { timestamp: new Date(t).toISOString(), mlBotnet: 0 };
    for (const bt of BOT_BEHAVIOR_TYPES) point[bt] = 0;
    for (const a of alerts) {
      const ms = new Date(a.timestamp).getTime();
      if (ms >= t && ms < next) {
        if (a.detectorType === "ml") point.mlBotnet += 1;
        else if (point[a.detectionType] !== undefined) point[a.detectionType] += 1;
      }
    }
    return point;
  });
}

function countBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (key === undefined || key === null || key === "" || key === "-") continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

// ═══════════════ ML ═══════════════
function buildMlPredictions(startMs, endMs) {
  const rnd = seededRng(2002);
  const span = endMs - startMs;
  const list = [];
  // ~10 prediksi/jam (min 12, maks 1500).
  const total = Math.min(Math.max(Math.round(10 * Math.max(span / 3600000, 0.25)), 12), 1500);
  for (let i = 0; i < total; i += 1) {
    const t = startMs + Math.floor(span * rnd());
    const label = pickWeighted(rnd, DEMO_ML_LABELS);
    const benign = label === "benign";
    const conf = benign ? 60 + rnd() * 39 : 50 + rnd() * 49;
    const agent = pick(rnd, DEMO_AGENTS);
    list.push({
      id: `demo-pred-${i + 1}`,
      timestamp: new Date(t).toISOString(),
      agent: agent.name,
      sourceIp: pick(rnd, DEMO_PUBLIC_IPS),
      destinationIp: pick(rnd, DEMO_PRIVATE_IPS),
      service: pick(rnd, ["http", "http", "http", "https", "dns"]),
      predictedLabel: label,
      confidence: Math.round(conf * 100) / 100,
      zeekUid: `Cdemo${String(100000 + i)}`,
      httpUri: pick(rnd, DEMO_URIS),
      eventDataset: "webids.prediction",
      modelName: "RF-WEBIDS23",
    });
  }
  list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return list;
}

// ═══════════════ LINUX COMMANDS ═══════════════
function buildLinuxCommands(startMs, endMs) {
  const rnd = seededRng(3003);
  const span = endMs - startMs;
  const list = [];
  // ~7 command/jam (min 10, maks 1200).
  const total = Math.min(Math.max(Math.round(7 * Math.max(span / 3600000, 0.25)), 10), 1200);
  for (let i = 0; i < total; i += 1) {
    const t = startMs + Math.floor(span * rnd());
    const tpl = pick(rnd, DEMO_COMMANDS);
    const agent = pick(rnd, DEMO_AGENTS);
    list.push({
      id: `demo-cmd-${i + 1}`,
      timestamp: new Date(t).toISOString(),
      user: pick(rnd, DEMO_USERS),
      session: String(int(rnd, 3000, 49999)),
      command: tpl.cmd,
      commandName: tpl.name,
      agentName: agent.name,
      hostName: agent.name,
      hostIp: agent.ip,
      message: tpl.cmd,
      logFilePath: "/var/log/auth.log",
      description: tpl.cmd,
      suspicious: tpl.suspicious,
      riskIndicators: tpl.indicators || [],
    });
  }
  list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return list;
}

// ═══════════════ FILE SCANS ═══════════════
const HEX = "0123456789abcdef";
function buildFileScans(startMs, endMs) {
  const rnd = seededRng(4004);
  const span = endMs - startMs;
  const list = [];
  // ~1,5 scan/jam (min 8, maks 300).
  const total = Math.min(Math.max(Math.round(1.5 * Math.max(span / 3600000, 0.25)), 8), 300);
  for (let i = 0; i < total; i += 1) {
    const t = startMs + Math.floor(span * rnd());
    const f = pick(rnd, DEMO_FILES);
    const agent = pick(rnd, DEMO_AGENTS);
    const nFind = int(rnd, 1, 7);
    const findings = [];
    for (let k = 0; k < nFind; k += 1) {
      const tpl = pick(rnd, DEMO_FINDINGS);
      findings.push({ name: tpl.name, indicator: tpl.name, severity: tpl.severity, desc: tpl.desc, risk: tpl.severity });
    }
    let sha = "";
    for (let k = 0; k < 64; k += 1) sha += HEX[Math.floor(rnd() * 16)];
    list.push({
      id: `demo-scan-${i + 1}`,
      timestamp: new Date(t).toISOString(),
      agentId: agent.id,
      agentName: agent.name,
      eventType: "scan",
      scanner: "file-content-scanner",
      filePath: `${f.folder}/${f.name}`,
      fileName: f.name,
      fileType: f.type,
      fileSize: int(rnd, 1024, 4 * 1024 * 1024),
      sha256: sha,
      findingsCount: nFind,
      matchedSourcesCount: int(rnd, 1, 3),
      matchedSources: ["yara-soc"],
      findings,
      extractedUrls: [],
      error: null,
    });
  }
  list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return list;
}

// ═══════════════ FIM EVENTS ═══════════════
function buildFimEvents(startMs, endMs) {
  const rnd = seededRng(5005);
  const span = endMs - startMs;
  const list = [];
  // ~13 event/jam (min 30, maks 1500).
  const total = Math.min(Math.max(Math.round(13 * Math.max(span / 3600000, 0.25)), 30), 1500);
  for (let i = 0; i < total; i += 1) {
    const t = startMs + Math.floor(span * rnd());
    const agent = pick(rnd, DEMO_AGENTS);
    const level = pick(rnd, [5, 5, 5, 7, 7, 7, 7, 9, 12]);
    const ev = pick(rnd, [...DEMO_FIM_EVENTS, "modified", "modified", "added"]);
    const p = pick(rnd, DEMO_FIM_PATHS);
    list.push({
      id: `demo-fim-${i + 1}`,
      timestamp: new Date(t).toISOString(),
      agentName: agent.name,
      username: pick(rnd, [...DEMO_USERS, "system"]),
      syscheckPath: p,
      syscheckEvent: ev,
      ruleDescription: `Integrity checksum changed for ${p}`,
      ruleLevel: level,
      ruleId: pick(rnd, [550, 551, 552, 553, 554]),
      fileDiff: `--- ${p}\n+++ ${p}\n@@ -1,3 +1,3 @@\n demo diff baris 1\n-demo diff baris 2\n+demo diff baris 2 (diubah)`,
    });
  }
  list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return list;
}

// ═══════════════ HOSTS ═══════════════
function buildHosts(endMs) {
  const rnd = seededRng(6006);
  return DEMO_AGENTS.map((a, i) => ({
    id: a.id,
    name: a.name,
    ip: a.ip,
    os: a.os,
    status: i < 3 ? "online" : i === 3 ? "warning" : "offline",
    cpu: Math.round(15 + rnd() * 60),
    memory: Math.round(25 + rnd() * 55),
    disk: Math.round(30 + rnd() * 50),
    uptime: `${int(rnd, 2, 40)} days`,
    lastSeen: new Date(endMs - Math.floor(rnd() * 3600000)).toISOString(),
  }));
}

// ═══════════════ RESPONDER ═══════════════
function ok(body) {
  return { success: true, ...body };
}

function demoBotAlerts(q, startMs, endMs) {
  const all = buildBotAlerts(startMs, endMs);
  const filtered = botFilterAlerts(all, q);
  const { page, limit } = demoPage(q);
  return pagedEnvelope(filtered, page, limit);
}

function buildResponse(pathname, q) {
  const { startMs, endMs } = demoRange(q);
  const { page, limit } = demoPage(q);

  // — Bot Detection —
  if (pathname.endsWith("/api/bot-detection/summary")) {
    return ok({ data: demoBotSummary(buildBotAlerts(startMs, endMs), endMs) });
  }
  if (pathname.endsWith("/api/bot-detection/trend")) {
    return ok({ data: demoBotTrend(buildBotAlerts(startMs, endMs), startMs, endMs) });
  }
  if (pathname.endsWith("/api/bot-detection/distribution")) {
    const s = demoBotSummary(buildBotAlerts(startMs, endMs), endMs);
    return ok({
      data: [
        { type: "ML Botnet", count: s.mlBotnetAlerts },
        { type: "HTTP Brute Force", count: s.byType.HTTP_BRUTE_FORCE },
        { type: "SSH Brute Force", count: s.byType.SSH_BRUTE_FORCE },
        { type: "Port Scan", count: s.byType.PORT_SCAN },
        { type: "Host Scan", count: s.byType.HOST_SCAN },
        { type: "Connection Flood", count: s.byType.CONNECTION_FLOOD },
        { type: "Beaconing", count: s.byType.BEACONING },
      ],
    });
  }
  if (pathname.endsWith("/api/bot-detection/top-sources")) {
    const ranked = countBy(buildBotAlerts(startMs, endMs), (a) => a.sourceIp).slice(0, 5);
    return ok({ data: ranked.map((r) => ({ ip: r.key, count: r.count })) });
  }
  if (pathname.endsWith("/api/bot-detection/top-destinations")) {
    const ranked = countBy(buildBotAlerts(startMs, endMs), (a) => a.destinationIp).slice(0, 5);
    return ok({
      data: {
        destinations: ranked.map((r) => ({ ip: r.key, count: r.count })),
        topPorts: [80, 443, 22, 8080, 53].map((port, i) => ({ port, count: 60 - i * 9 })),
      },
    });
  }
  if (pathname.endsWith("/api/bot-detection/top-agents")) {
    const ranked = countBy(buildBotAlerts(startMs, endMs), (a) => a.agent).slice(0, 5);
    return ok({
      data: { agents: ranked.map((r) => ({ name: r.key, count: r.count })), uniqueAgents: ranked.length },
    });
  }
  if (pathname.endsWith("/api/bot-detection/probability")) {
    const ml = buildBotAlerts(startMs, endMs).filter((a) => a.detectorType === "ml");
    const probs = ml.map((a) => a.probability);
    const ranges = [
      ["0.50–0.59", 0.5, 0.6],
      ["0.60–0.69", 0.6, 0.7],
      ["0.70–0.79", 0.7, 0.8],
      ["0.80–0.89", 0.8, 0.9],
      ["0.90–1.00", 0.9, 1.01],
    ];
    return ok({
      data: {
        available: true,
        total: ml.length,
        average: probs.length ? probs.reduce((s, v) => s + v, 0) / probs.length : null,
        maximum: probs.length ? Math.max(...probs) : null,
        minimum: probs.length ? Math.min(...probs) : null,
        threshold: 0.5,
        buckets: ranges.map(([range, from, to]) => ({
          range,
          count: probs.filter((p) => p >= from && p < to).length,
        })),
      },
    });
  }
  if (pathname.endsWith("/api/bot-detection/behavior-summary")) {
    const behavior = buildBotAlerts(startMs, endMs).filter((a) => a.detectorType === "behavior");
    const types = {};
    for (const t of BOT_BEHAVIOR_TYPES) {
      const rows = behavior.filter((a) => a.detectionType === t);
      const vals = rows.map((a) => a.primaryValue).filter((v) => Number.isFinite(v));
      types[t] = {
        total: rows.length,
        averagePrimary: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null,
        maximumPrimary: vals.length ? Math.max(...vals) : null,
        topSourceIp: rows[0]?.sourceIp || null,
        topDestinationIp: rows[0]?.destinationIp || null,
      };
    }
    return ok({ data: { available: true, types } });
  }
  if (pathname.endsWith("/api/bot-detection/traffic")) {
    const ml = buildBotAlerts(startMs, endMs).filter((a) => a.detectorType === "ml");
    const totalBytes = ml.reduce((s, a) => s + (a.totalBytes || 0), 0);
    const totalPackets = ml.reduce((s, a) => s + (a.totalPackets || 0), 0);
    const byIp = (key) => {
      const map = new Map();
      for (const a of ml) {
        const ip = a[key];
        if (!ip) continue;
        const e = map.get(ip) || { ip, bytes: 0, packets: 0, connections: 0 };
        e.bytes += a.totalBytes || 0;
        e.packets += a.totalPackets || 0;
        e.connections += 1;
        map.set(ip, e);
      }
      return Array.from(map.values()).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    };
    const byAgent = () => {
      const map = new Map();
      for (const a of ml) {
        const name = a.agent;
        if (!name) continue;
        const e = map.get(name) || { agent: name, bytes: 0, packets: 0, connections: 0 };
        e.bytes += a.totalBytes || 0;
        e.packets += a.totalPackets || 0;
        e.connections += 1;
        map.set(name, e);
      }
      return Array.from(map.values()).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    };
    return ok({
      data: {
        available: true,
        totalBytes,
        averageBytes: ml.length ? totalBytes / ml.length : 0,
        totalPackets,
        totalConnections: ml.length,
        topTalkers: byIp("sourceIp"),
        topDestinations: byIp("destinationIp"),
        topVMs: byAgent(),
      },
    });
  }
  if (pathname.endsWith("/api/bot-detection/traffic-timeline")) {
    const ml = buildBotAlerts(startMs, endMs).filter((a) => a.detectorType === "ml");
    const agents = [...new Set(ml.map((a) => a.agent))].slice(0, 5);
    const { buckets } = bucketize(startMs, endMs, 24);
    const points = buckets.map((t) => {
      const next = t + (buckets[1] - buckets[0] || 3600000);
      const point = { timestamp: new Date(t).toISOString() };
      for (const name of agents) point[name] = 0;
      for (const a of ml) {
        const ms = new Date(a.timestamp).getTime();
        if (ms >= t && ms < next && point[a.agent] !== undefined) point[a.agent] += a.totalBytes || 0;
      }
      return point;
    });
    return ok({ data: { agents, points } });
  }
  if (pathname.endsWith("/api/bot-detection/alerts")) {
    return demoBotAlerts(q, startMs, endMs);
  }
  if (pathname.endsWith("/api/bot-detection/detail")) {
    const all = buildBotAlerts(startMs, endMs);
    const found = all.find((a) => a.id === q.get("id")) || all[0];
    return ok({ data: found });
  }

  // — ML —
  if (pathname.endsWith("/api/ml/predictions/timeline")) {
    const preds = buildMlPredictions(startMs, endMs);
    const { buckets } = bucketize(startMs, endMs, 24);
    const data = buckets.map((t) => {
      const next = t + (buckets[1] - buckets[0] || 3600000);
      const rows = preds.filter((p) => {
        const ms = new Date(p.timestamp).getTime();
        return ms >= t && ms < next;
      });
      const byLabel = new Map();
      for (const p of rows) byLabel.set(p.predictedLabel, (byLabel.get(p.predictedLabel) || 0) + 1);
      return {
        timestamp: new Date(t).toISOString(),
        total: rows.length,
        labels: Array.from(byLabel.entries()).map(([label, count]) => ({ label, count })),
      };
    });
    return ok({ data });
  }
  if (pathname.endsWith("/api/ml/predictions/stats")) {
    const preds = buildMlPredictions(startMs, endMs);
    const byLabel = new Map();
    let confSum = 0;
    for (const p of preds) {
      const e = byLabel.get(p.predictedLabel) || { label: p.predictedLabel, count: 0, confSum: 0 };
      e.count += 1;
      e.confSum += p.confidence;
      byLabel.set(p.predictedLabel, e);
      confSum += p.confidence;
    }
    return ok({
      data: {
        totalPredictions: preds.length,
        overallAvgConfidence: preds.length ? confSum / preds.length : null,
        labels: Array.from(byLabel.values()).map((e) => ({
          label: e.label,
          count: e.count,
          avgConfidence: e.count ? e.confSum / e.count : null,
        })),
      },
    });
  }
  if (pathname.endsWith("/api/ml/predictions/latest")) {
    const preds = buildMlPredictions(startMs, endMs);
    return ok({ data: preds[0] || null });
  }
  if (pathname.endsWith("/api/ml/predictions")) {
    let preds = buildMlPredictions(startMs, endMs);
    const label = q.get("label");
    const sourceIp = q.get("sourceIp");
    const destinationIp = q.get("destinationIp");
    const service = q.get("service");
    if (label) preds = preds.filter((p) => p.predictedLabel === label);
    if (sourceIp) preds = preds.filter((p) => p.sourceIp === sourceIp);
    if (destinationIp) preds = preds.filter((p) => p.destinationIp === destinationIp);
    if (service) preds = preds.filter((p) => p.service === service);
    return pagedEnvelope(preds, page, limit);
  }

  // — Linux commands —
  if (pathname.endsWith("/api/linux-commands/stats")) {
    const cmds = buildLinuxCommands(startMs, endMs);
    const users = countBy(cmds, (c) => c.user).map((r) => ({ user: r.key, count: r.count }));
    const agents = countBy(cmds, (c) => c.agentName).map((r) => ({ agent: r.key, count: r.count }));
    const sessions = countBy(cmds, (c) => c.session).map((r) => ({ session: r.key, count: r.count })).slice(0, 5);
    const commandNames = countBy(cmds, (c) => c.commandName).map((r) => ({ commandName: r.key, count: r.count }));
    const topCommands = countBy(cmds, (c) => c.command).slice(0, 5).map((r) => ({ command: r.key, count: r.count }));
    return ok({
      data: {
        totalCommands: cmds.length,
        totalSessions: new Set(cmds.map((c) => c.session)).size,
        totalUsers: new Set(cmds.map((c) => c.user)).size,
        suspiciousCommands: cmds.filter((c) => c.suspicious).length,
        users,
        agents,
        sessions,
        commandNames,
        topCommands,
      },
    });
  }
  if (pathname.endsWith("/api/linux-commands/timeline")) {
    const cmds = buildLinuxCommands(startMs, endMs);
    const { buckets } = bucketize(startMs, endMs, 24);
    const data = buckets.map((t) => {
      const next = t + (buckets[1] - buckets[0] || 3600000);
      const rows = cmds.filter((c) => {
        const ms = new Date(c.timestamp).getTime();
        return ms >= t && ms < next;
      });
      const byName = new Map();
      for (const c of rows) byName.set(c.commandName, (byName.get(c.commandName) || 0) + 1);
      return {
        timestamp: new Date(t).toISOString(),
        total: rows.length,
        suspicious: rows.filter((c) => c.suspicious).length,
        commandNames: Array.from(byName.entries()).map(([commandName, count]) => ({ commandName, count })),
      };
    });
    return ok({ data });
  }
  if (pathname.includes("/api/linux-commands")) {
    let cmds = buildLinuxCommands(startMs, endMs);
    if (String(q.get("suspicious")).toLowerCase() === "true") cmds = cmds.filter((c) => c.suspicious);
    if (String(q.get("suspicious")).toLowerCase() === "false") cmds = cmds.filter((c) => !c.suspicious);
    for (const [param, field] of [["user", "user"], ["agentName", "agentName"], ["session", "session"], ["commandName", "commandName"]]) {
      const v = q.get(param);
      if (v) cmds = cmds.filter((c) => String(c[field]) === String(v));
    }
    return pagedEnvelope(cmds, page, limit);
  }

  // — File scans —
  if (pathname.endsWith("/api/file-scans/stats")) {
    const scans = buildFileScans(startMs, endMs);
    const agentMap = new Map();
    for (const s of scans) {
      const e = agentMap.get(s.agentName) || { label: s.agentName, name: s.agentName, agent: s.agentName, value: 0, count: 0 };
      e.value += 1;
      e.count += 1;
      agentMap.set(s.agentName, e);
    }
    const typeMap = new Map();
    for (const s of scans) typeMap.set(s.fileType, (typeMap.get(s.fileType) || 0) + 1);
    const suspicious = scans.filter((s) => s.findingsCount > 0);
    return ok({
      data: {
        totalEvents: scans.length,
        totalSuccessScans: scans.length,
        totalErrorScans: 0,
        suspiciousScans: suspicious.length,
        cleanScans: scans.length - suspicious.length,
        averageFindings: scans.length ? scans.reduce((x, s) => x + s.findingsCount, 0) / scans.length : 0,
        maxFindings: scans.length ? Math.max(...scans.map((s) => s.findingsCount)) : 0,
        uniqueAgents: agentMap.size,
        topAgents: Array.from(agentMap.values()),
        fileTypes: Array.from(typeMap.entries()).map(([fileType, count]) => ({ fileType, count })),
      },
    });
  }
  if (pathname.endsWith("/api/file-scans/timeline")) {
    const scans = buildFileScans(startMs, endMs);
    const { buckets } = bucketize(startMs, endMs, 24);
    const data = buckets.map((t) => {
      const next = t + (buckets[1] - buckets[0] || 3600000);
      const rows = scans.filter((s) => {
        const ms = new Date(s.timestamp).getTime();
        return ms >= t && ms < next;
      });
      return {
        timestamp: new Date(t).toISOString(),
        total: rows.length,
        success: rows.length,
        suspicious: rows.filter((s) => s.findingsCount > 0).length,
        errors: 0,
      };
    });
    return ok({ data });
  }
  if (pathname.includes("/api/file-scans")) {
    let scans = buildFileScans(startMs, endMs);
    if (pathname.endsWith("/api/file-scans/suspicious")) scans = scans.filter((s) => s.findingsCount > 0);
    const agent = q.get("agent") || q.get("agentName");
    if (agent) scans = scans.filter((s) => s.agentName === agent);
    return pagedEnvelope(scans, page, limit);
  }

  // — FIM events —
  if (pathname.includes("/api/events")) {
    const fim = buildFimEvents(startMs, endMs);
    if (pathname.endsWith("/events/users/stats")) {
      return ok({ data: countBy(fim, (e) => e.username).slice(0, 100).map((r) => ({ user: r.key, count: r.count })) });
    }
    if (pathname.endsWith("/events/agents/stats")) {
      return ok({ data: countBy(fim, (e) => e.agentName).slice(0, 20).map((r) => ({ agent: r.key, count: r.count })) });
    }
    if (pathname.endsWith("/events/distribution/stats")) {
      const sevMap = { Critical: 0, High: 0, Medium: 0, Low: 0 };
      const sevOf = (lvl) => (lvl >= 12 ? "Critical" : lvl >= 8 ? "High" : lvl >= 5 ? "Medium" : "Low");
      for (const e of fim) sevMap[sevOf(Number(e.ruleLevel) || 0)] += 1;
      const evMap = new Map();
      for (const e of fim) evMap.set(e.syscheckEvent, (evMap.get(e.syscheckEvent) || 0) + 1);
      return ok({
        total: fim.length,
        severity: Object.entries(sevMap).map(([label, value]) => ({ label, value })),
        eventTypes: Array.from(evMap.entries()).map(([label, value]) => ({ label, value })),
      });
    }
    if (pathname.endsWith("/events/timeline")) {
      const { buckets } = bucketize(startMs, endMs, 24);
      const data = buckets.map((t) => {
        const next = t + (buckets[1] - buckets[0] || 3600000);
        return {
          timestamp: new Date(t).toISOString(),
          total: fim.filter((e) => {
            const ms = new Date(e.timestamp).getTime();
            return ms >= t && ms < next;
          }).length,
        };
      });
      return ok({ data });
    }
    // list (termasuk /events/:agentId)
    let rows = fim;
    const sev = String(q.get("severity") || "all").toLowerCase();
    if (sev === "critical") rows = rows.filter((e) => Number(e.ruleLevel) >= 12);
    else if (sev === "high") rows = rows.filter((e) => Number(e.ruleLevel) >= 8 && Number(e.ruleLevel) < 12);
    else if (sev === "medium") rows = rows.filter((e) => Number(e.ruleLevel) >= 5 && Number(e.ruleLevel) < 8);
    else if (sev === "low") rows = rows.filter((e) => Number(e.ruleLevel) < 5);
    const size = Math.min(Math.max(parseInt(q.get("size") || "100", 10) || 100, 1), 5000);
    const limited = rows.slice(0, size);
    return {
      success: true,
      data: limited,
      total_hits: rows.length,
      current_page: 1,
      total_pages: 1,
      page_size: size,
      next_search_after: null,
    };
  }

  // — Host monitoring —
  if (pathname.includes("/api/host-monitoring")) {
    const rnd = seededRng(6006);
    const hosts = buildHosts(endMs);
    if (pathname.endsWith("/api/host-monitoring/stats")) {
      return ok({
        data: {
          totalHosts: hosts.length,
          onlineHosts: hosts.filter((h) => h.status === "online").length,
          warningHosts: hosts.filter((h) => h.status === "warning").length,
          offlineHosts: hosts.filter((h) => h.status === "offline").length,
          avgCpu: 42,
          avgMemory: 58,
          avgDisk: 47,
          totalAlerts: 6,
        },
      });
    }
    if (pathname.endsWith("/api/host-monitoring/timeline")) {
      const metric = q.get("metric") || "cpu";
      const base = metric === "cpu" ? 45 : metric === "memory" ? 60 : metric === "disk" ? 48 : 30;
      const { buckets } = bucketize(startMs, endMs, 24);
      return ok({
        data: buckets.map((t) => ({ t, v: Math.max(1, Math.round(base + (rnd() - 0.45) * 30)) })),
      });
    }
    if (pathname.endsWith("/api/host-monitoring/top-processes")) {
      const procs = ["suricata", "zeek", "filebeat", "wazuh-agent", "python3", "nginx", "postgres", "node"];
      return ok({
        data: procs.slice(0, 5).map((label) => ({ label, value: 200 + Math.floor(rnd() * 900), unit: " MB" })),
      });
    }
    if (pathname.endsWith("/api/host-monitoring/top-agents")) {
      return ok({
        data: hosts.slice(0, 5).map((h) => ({
          label: h.name,
          name: h.name,
          value: 100 + Math.floor(rnd() * 400),
          count: 100 + Math.floor(rnd() * 400),
          sub: `${h.os} · ${h.ip}`,
        })),
      });
    }
    if (pathname.endsWith("/api/host-monitoring/top-sessions")) {
      const colors = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6"];
      return ok({
        data: [0, 1, 2, 3, 4].map((i) => {
          const sid = String(20000 + Math.floor(rnd() * 30000));
          return {
            label: sid.length > 14 ? `${sid.slice(0, 12)}.` : sid,
            fullLabel: sid,
            value: 120 - i * 18 + Math.floor(rnd() * 10),
            color: colors[i % colors.length],
            sub: `${pick(rnd, DEMO_USERS)} · ${pick(rnd, DEMO_AGENTS).name}`,
          };
        }),
      });
    }
    if (pathname.endsWith("/api/host-monitoring/alerts")) {
      const msgs = [
        ["agent-prod-01", "CPU usage at 91%", "high"],
        ["agent-dev-01", "Memory usage at 88%", "high"],
        ["agent-web-02", "Disk usage at 82%", "warning"],
        ["agent-db-01", "CPU usage at 86%", "high"],
      ];
      return ok({
        data: msgs.map(([host, message, severity], i) => ({
          host,
          message,
          time: new Date(endMs - i * 3600000).toISOString(),
          severity,
        })),
      });
    }
    return ok({ hosts, total: hosts.length });
  }

  return null;
}

export function installDemoInterceptor() {
  if (typeof window === "undefined" || window.__socDemoInstalled) return;
  window.__socDemoInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    let url = "";
    try {
      url = typeof input === "string" ? input : String(input?.url || "");
    } catch {
      return originalFetch(input, init);
    }
    if (!shouldMock(url)) return originalFetch(input, init);
    try {
      const parsed = new URL(url, window.location.origin);
      const body = buildResponse(parsed.pathname, parsed.searchParams);
      if (!body) return originalFetch(input, init);
      return Promise.resolve(json(body));
    } catch {
      return originalFetch(input, init);
    }
  };
}
