export const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

export const formatBucketLabel = (ms, rangeKey) => {
  const d = new Date(ms);
  if (rangeKey === "1h") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (rangeKey === "24h") return d.toLocaleTimeString("en-US", { hour: "2-digit" });
  if (rangeKey === "7d") return d.toLocaleString("en-US", { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

export const formatDetailedTimestamp = (timestamp) =>
  new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export const formatTime = (isoString) => {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date
    .toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    })
    .replace(/,/g, "")
    .replace(/AM|PM/g, "");
};

export const formatRate = (eps) => {
  if (!eps || Number.isNaN(eps) || eps <= 0) return "0.00 / sec";
  if (eps >= 0.01) return `${eps.toFixed(2)} / sec`;
  const perMin = eps * 60;
  if (perMin >= 0.01) return `${perMin.toFixed(2)} / min`;
  const perHour = eps * 3600;
  if (perHour >= 0.01) return `${perHour.toFixed(2)} / hour`;
  return `${eps.toExponential(2)} / sec`;
};

export const formatLiveTimestamp = (isoString) => {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export const renderSeverityBadge = (level) => {
  if (level >= 12) return <span className="bg-red-900/50 text-red-300 border border-red-700/50 px-2 py-0.5 rounded text-xs font-bold">Critical Lvl {level}</span>;
  if (level >= 8) return <span className="bg-orange-900/50 text-orange-300 border border-orange-700/50 px-2 py-0.5 rounded text-xs font-bold">High Lvl {level}</span>;
  if (level >= 5) return <span className="bg-yellow-900/50 text-yellow-300 border border-yellow-700/50 px-2 py-0.5 rounded text-xs font-bold">Medium Lvl {level}</span>;
  return <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-xs font-bold">Low Lvl {level}</span>;
};

export const getRangeWindow = (rangeKey) => {
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
};

export const buildFimDerivedData = (events, aggregatedEvents, rangeKey, totalHits) => {
  const sourceEvents = Array.isArray(aggregatedEvents) && aggregatedEvents.length ? aggregatedEvents : Array.isArray(events) ? events : [];
  const now = Date.now();
  const rangeMs = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 }[rangeKey] || 86400000;
  const startMs = now - rangeMs;
  const stepMs = rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000;

  const bucketStart = (ms) => Math.floor(ms / stepMs) * stepMs;
  const filtered = sourceEvents
    .map((e) => ({ ...e, _ms: e.timestamp ? new Date(e.timestamp).getTime() : NaN }))
    .filter((e) => Number.isFinite(e._ms) && e._ms >= startMs && e._ms <= now)
    .sort((a, b) => b._ms - a._ms);

  const buckets = new Map();
  for (const e of filtered) {
    buckets.set(bucketStart(e._ms), (buckets.get(bucketStart(e._ms)) || 0) + 1);
  }

  const series = [];
  for (let t = bucketStart(startMs); t <= bucketStart(now); t += stepMs) {
    series.push({ t, v: buckets.get(t) || 0, bucketMs: stepMs });
  }

  const byEvent = new Map();
  for (const e of filtered) {
    const key = e.syscheckEvent || "unknown";
    byEvent.set(key, (byEvent.get(key) || 0) + 1);
  }
  const eventItems = Array.from(byEvent.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((it, idx) => ({
      ...it,
      color: ["#38bdf8", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6", "#9CA3AF"][idx % 7],
    }));

  const byAgent = new Map();
  for (const e of filtered) {
    const agentLabel = String(e.agentName || e.agent_name || "Unknown agent").trim() || "Unknown agent";
    const existing = byAgent.get(agentLabel) || { name: agentLabel, count: 0, lastSeen: 0 };
    existing.count += 1;
    existing.lastSeen = Math.max(existing.lastSeen, e._ms || 0);
    byAgent.set(agentLabel, existing);
  }

  const topAgents = Array.from(byAgent.values())
    .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen || a.name.localeCompare(b.name))
    .slice(0, 5);

  const byPayload = new Map();
  const STOP = new Set(["", "---", "@@", "+", "-", "//", "#", "the", "is", "to", "and"]);
  for (const e of filtered) {
    if (!e.fileDiff) continue;
    for (const line of e.fileDiff.split("\n")) {
      if (!line.startsWith(">") && !line.startsWith("<")) continue;
      const tokens = line
        .substring(1)
        .trim()
        .split(/[\s/=:;,'"(){}[\]<>|&!?@#%^*`~]+/)
        .map((t) => t.toLowerCase())
        .filter((t) => t.length >= 2 && !STOP.has(t));
      for (const token of tokens) {
        byPayload.set(token, (byPayload.get(token) || 0) + 1);
      }
    }
  }

  const payloadWords = Array.from(byPayload.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  const bySeverity = new Map();
  for (const e of filtered) {
    const level = e.ruleLevel || 0;
    let severityLabel = "Low";
    if (level >= 12) severityLabel = "Critical";
    else if (level >= 8) severityLabel = "High";
    else if (level >= 5) severityLabel = "Medium";
    bySeverity.set(severityLabel, (bySeverity.get(severityLabel) || 0) + 1);
  }

  const severityItems = Array.from(bySeverity.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .map((it) => ({
      ...it,
      color: { Critical: "#ef4444", High: "#f97316", Medium: "#eab308", Low: "#3b82f6" }[it.label] || "#64748b",
    }));

  const total = Number(totalHits) || filtered.length;
  const eps = total ? total / (rangeMs / 1000) : 0;

  return {
    filtered,
    series,
    eventItems,
    topAgents,
    severityItems,
    payloadWords,
    total,
    eps,
    startMs,
    now,
    uniqueAgents: byAgent.size,
  };
};
