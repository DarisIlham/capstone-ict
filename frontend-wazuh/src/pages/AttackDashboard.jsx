import React, { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import {
  Search,
  AlertTriangle,
  Clock,
  Terminal,
  Activity,
  Eye,
  RefreshCw,
} from "lucide-react";

// ========================================
// Range Filter Component
// ========================================
const RangeFilter = ({ rangeKey, onRangeChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-slate-500">Range</span>
    <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
      {["1h", "24h", "7d", "30d"].map((k) => (
        <button
          key={k}
          onClick={() => onRangeChange(k)}
          className={`px-2.5 py-1 text-xs rounded-md ${rangeKey === k ? "bg-sky-600 text-white" : "text-slate-400"}`}
        >
          Last {k}
        </button>
      ))}
    </div>
  </div>
);

// ========================================
// SVG Chart Components
// ========================================

const WaveChart = ({ data }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const width = 1000;
  const height = 180;
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-48 flex items-center justify-center text-slate-500 text-sm">
        No data available
      </div>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => d.v));
  const pointSpacing = data.length ? innerW / (data.length - 1) : innerW;

  // Grid lines
  const gridSteps = 5;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i++) {
    const ratio = i / (gridSteps - 1);
    const value = Math.round(ratio * maxV);
    const y = padding.t + innerH - ratio * innerH;
    gridLines.push({ value, y, ratio });
  }

  // Generate smooth curve
  let pathD = "";
  for (let i = 0; i < data.length; i++) {
    const x = padding.l + i * pointSpacing;
    const y = padding.t + innerH - (data[i].v / maxV) * innerH;

    if (i === 0) {
      pathD += `M ${x} ${y}`;
    } else {
      const prevX = padding.l + (i - 1) * pointSpacing;
      const prevY = padding.t + innerH - (data[i - 1].v / maxV) * innerH;
      const controlX = (prevX + x) / 2;
      pathD += ` C ${controlX} ${prevY}, ${controlX} ${y}, ${x} ${y}`;
    }
  }

  const formatPointTime = (timestamp) =>
    new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="relative" onMouseLeave={() => setSelectedPoint(null)}>
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
      {/* Grid lines */}
      {gridLines.map((grid, idx) => (
        <g key={`grid-${idx}`}>
          <line
            x1={padding.l}
            y1={grid.y}
            x2={padding.l + innerW}
            y2={grid.y}
            stroke="#1e293b"
            strokeWidth="1"
            opacity={grid.ratio === 0 || grid.ratio === 1 ? "1" : "0.5"}
          />
          <text
            x={padding.l - 5}
            y={grid.y + 4}
            textAnchor="end"
            fontSize="10"
            fill="#64748b"
            fontWeight="600"
          >
            {grid.value}
          </text>
        </g>
      ))}

      {/* Axes */}
      <line
        x1={padding.l}
        y1={padding.t}
        x2={padding.l}
        y2={padding.t + innerH}
        stroke="#334155"
        strokeWidth="1.5"
      />
      <line
        x1={padding.l}
        y1={padding.t + innerH}
        x2={padding.l + innerW}
        y2={padding.t + innerH}
        stroke="#334155"
        strokeWidth="1.5"
      />

      {/* Wave line */}
      <path d={pathD} stroke="#f97316" strokeWidth="2.5" fill="none" opacity="0.8" />

      {/* Gradient fill */}
      <defs>
        <linearGradient id="cmdWaveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={
          pathD +
          ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`
        }
        fill="url(#cmdWaveGradient)"
      />

      {/* Data points */}
      {data.map((d, i) => {
        const x = padding.l + i * pointSpacing;
        const y = padding.t + innerH - (d.v / maxV) * innerH;
        const isSelected = selectedPoint?.index === i;
        const pointData = { index: i, x, y, value: d.v, time: d.t };
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={isSelected ? "7" : "10"}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setSelectedPoint(pointData)}
              onMouseLeave={() => setSelectedPoint(null)}
              onFocus={() => setSelectedPoint(pointData)}
              onBlur={() => setSelectedPoint(null)}
            />
            <circle
              cx={x}
              cy={y}
              r={isSelected ? "5" : "3.5"}
              fill="#f97316"
              stroke="#0f172a"
              strokeWidth="1.5"
              opacity="0.95"
              className="pointer-events-none"
            />
          </g>
        );
      })}
    </svg>
    {selectedPoint && (
      <div
        className="pointer-events-none absolute z-10 min-w-[130px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg"
        style={{
          left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`,
          top: `${Math.max(((selectedPoint.y - 48) / height) * 100, 4)}%`,
          transform: "translate(-50%, -100%)",
        }}
      >
        <div className="font-semibold text-white">{selectedPoint.value} commands</div>
        <div className="mt-1 text-slate-400">{formatPointTime(selectedPoint.time)}</div>
      </div>
    )}
    </div>
  );
};

const Donut = ({ items, size = 120, stroke = 12, centerLabelTop, centerLabelBottom }) => {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size / 2} ${size / 2})`}>
        <circle r={r} fill="transparent" stroke="#1e293b" strokeWidth={stroke} />
        {items.map((it, idx) => {
          const currentOffset = items
            .slice(0, idx)
            .reduce((acc, prev) => acc + (prev.value / total) * c, 0);
          const dash = (it.value / total) * c;

          return (
            <circle
              key={it.label}
              r={r}
              fill="transparent"
              stroke={it.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-currentOffset}
              transform="rotate(-90)"
              strokeLinecap="butt"
            >
              <title>{`${it.label}: ${it.value}`}</title>
            </circle>
          );
        })}
        <text y={-3} textAnchor="middle" fontSize="11" fill="#f1f5f9" fontWeight="700">
          {centerLabelTop}
        </text>
        <text y={10} textAnchor="middle" fontSize="8" fill="#64748b">
          {centerLabelBottom}
        </text>
      </g>
    </svg>
  );
};

const Legend = ({ items }) => (
  <div className="flex flex-col gap-1.5">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
        <span className="truncate max-w-[100px]">{it.label}</span>
        <span className="text-slate-500 ml-auto font-mono">{it.value}</span>
      </div>
    ))}
  </div>
);

const CompactBarChart = ({ items }) => {
  const maxValue = Math.max(...items.map((d) => d.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={item.label} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-6">
              <span className="text-xs font-bold text-slate-400">#{i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-slate-300 truncate" title={item.label}>
                {item.label}
              </p>
            </div>
            <span className="text-xs font-bold text-slate-300">{item.value}x</span>
          </div>
          <div className="flex items-center gap-2 ml-6">
            <div className="flex-1 bg-slate-800/50 rounded-full h-4 overflow-hidden border border-slate-700/30">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: item.color,
                  opacity: 0.85,
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ========================================
// Command Highlighter
// ========================================
const CommandHighlighter = ({ command }) => {
  const suspiciousKeywords = [
    "rm",
    "curl",
    "wget",
    "nc",
    "chmod",
    "bash",
    "sh",
    "sudo",
    "dd",
    "cat",
    "/etc/shadow",
    "/etc/passwd",
    "base64",
    "eval",
    "|",
    "&",
    ";",
  ];

  const parts = String(command || "").split(/(\s+)/);

  return (
    <code className="text-xs font-mono">
      {parts.map((part, idx) => {
        const isSuspicious = suspiciousKeywords.some((kw) =>
          part.toLowerCase().includes(kw.toLowerCase())
        );
        return (
          <span
            key={idx}
            className={isSuspicious ? "bg-red-500/30 text-red-300 px-1 rounded" : "text-slate-300"}
          >
            {part}
          </span>
        );
      })}
    </code>
  );
};

// ========================================
// Command Payload Word Cloud
// ========================================
const WORD_COLORS = ["#f472b6", "#38bdf8", "#4ade80", "#a78bfa", "#fb923c", "#34d399", "#f87171", "#facc15", "#60a5fa", "#e879f9"];

const PayloadWordCloud = ({ words }) => {
  if (!words || words.length === 0) return <div className="flex items-center justify-center h-full text-slate-600 text-xs">No command data</div>;
  const W = 620, H = 240;
  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const range = Math.max(1, maxCount - minCount);
  const fontSize = (count) => Math.round(11 + ((count - minCount) / range) * 31);
  const estWidth = (text, fs) => text.length * fs * 0.6;
  const placed = [];
  const rects = [];
  const overlaps = (nx, ny, nw, nh) => {
    const pad = 4;
    return rects.some(r => nx - nw / 2 - pad < r.x + r.w / 2 && nx + nw / 2 + pad > r.x - r.w / 2 && ny - nh / 2 - pad < r.y + r.h / 2 && ny + nh / 2 + pad > r.y - r.h / 2);
  };
  for (let i = 0; i < words.length; i++) {
    const { text, count } = words[i];
    const fs = fontSize(count);
    const tw = estWidth(text, fs);
    const th = fs * 1.2;
    let placed_x = W / 2, placed_y = H / 2, found = false;
    for (let step = 0; step < 800; step++) {
      const angle = step * 0.35, radius = step * 0.8;
      const cx = W / 2 + radius * Math.cos(angle), cy = H / 2 + radius * Math.sin(angle) * 0.6;
      if (cx - tw / 2 > 2 && cx + tw / 2 < W - 2 && cy - th / 2 > 2 && cy + th / 2 < H - 2 && !overlaps(cx, cy, tw, th)) {
        placed_x = cx; placed_y = cy; found = true; break;
      }
    }
    if (found || i === 0) {
      rects.push({ x: placed_x, y: placed_y, w: tw, h: th });
      placed.push({ text, fs, color: WORD_COLORS[i % WORD_COLORS.length], opacity: 0.65 + ((count - minCount) / range) * 0.35, x: placed_x, y: placed_y, count });
    }
  }
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ minHeight: 140 }}>
      <defs><radialGradient id="wcGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0f172a" stopOpacity="0" /><stop offset="100%" stopColor="#020617" stopOpacity="0.6" /></radialGradient></defs>
      <rect width={W} height={H} fill="url(#wcGlow)" rx={8} />
      {placed.map((w) => (
        <text key={w.text} x={w.x} y={w.y} textAnchor="middle" dominantBaseline="middle" fontSize={w.fs} fontWeight={w.fs > 26 ? "800" : w.fs > 18 ? "700" : "500"} fill={w.color} opacity={w.opacity} style={{ cursor: "default", fontFamily: "monospace" }}>
          <title>{`${w.text}: ${w.count} occurrences`}</title>{w.text}
        </text>
      ))}
    </svg>
  );
};


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const RANGE_TO_MINUTES = {
  "1h": 60,
  "24h": 24 * 60,
  "7d": 7 * 24 * 60,
  "30d": 30 * 24 * 60,
};

const CHART_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];

async function fetchJson(url) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    const message = contentType.includes("application/json")
      ? (await response.json()).message
      : await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

function normalizeLinuxCommand(item) {
  return {
    id: item.id,
    timestamp: item.timestamp,
    user: item.user || "-",
    hostname: item.hostName || "-",
    hostIp: Array.isArray(item.hostIp) ? item.hostIp.join(", ") : item.hostIp || "-",
    sessionId: item.session || "-",
    commandName: item.commandName || "-",
    command: {
      cmd: item.command || "",
      risk: item.suspicious ? "suspicious" : "normal",
      indicator: Array.isArray(item.riskIndicators) ? item.riskIndicators : [],
    },
    message: item.message || "-",
    logFilePath: item.logFilePath || "-",
    pid: "-",
    exitCode: "-",
  };
}

function countBy(items, getKey) {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);
    if (!key || key === "-") continue;
    map.set(key, (map.get(key) || 0) + 1);
  }

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function buildTimelineFromLogs(logs) {
  if (!logs.length) return [];

  const buckets = new Map();

  for (const log of logs) {
    const date = new Date(log.timestamp);
    if (Number.isNaN(date.getTime())) continue;

    date.setMinutes(0, 0, 0);
    const key = date.toISOString();
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .map(([t, v]) => ({ t, v }));
}

function extractCommandKeywords(logs) {
  const keywordCounts = new Map();
  const keywords = [
    "curl",
    "bash",
    "cat",
    "chmod",
    "sudo",
    "rm",
    "wget",
    "nc",
    "base64",
    "grep",
    "sed",
    "awk",
    "eval",
    "exec",
    "systemctl",
    "cd",
    "nano",
    "vim",
  ];

  for (const log of logs) {
    const command = log.command.cmd.toLowerCase();

    for (const keyword of keywords) {
      if (command.includes(keyword)) {
        keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
      }
    }
  }

  return Array.from(keywordCounts.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

// ========================================
// Main Component
// ========================================
const HostMonitoring = () => {
  const [searchUser, setSearchUser] = useState("");
  const [searchCommand, setSearchCommand] = useState("");
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [rangeKey, setRangeKey] = useState("24h");

  const [logs, setLogs] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [backendStats, setBackendStats] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboardData = useCallback(async () => {
    const params = new URLSearchParams({
      page: "1",
      limit: "100",
    });

    if (searchUser.trim()) params.set("user", searchUser.trim());
    if (searchCommand.trim()) params.set("contains", searchCommand.trim());
    if (suspiciousOnly) params.set("suspicious", "true");

    const minutes = RANGE_TO_MINUTES[rangeKey] || RANGE_TO_MINUTES["24h"];

    try {
      setError("");
      setRefreshing(true);

      const [listResponse, statsResponse, timelineResponse] = await Promise.all([
        fetchJson(`${API_BASE_URL}/linux-commands?${params.toString()}`),
        fetchJson(`${API_BASE_URL}/linux-commands/stats`),
        fetchJson(`${API_BASE_URL}/linux-commands/timeline?minutes=${minutes}`),
      ]);

      const normalizedLogs = (listResponse.data || []).map(normalizeLinuxCommand);
      const apiTimeline = (timelineResponse.data || [])
        .map((item) => ({
          t: item.timestamp,
          v: item.total || 0,
          suspicious: item.suspicious || 0,
        }))
        .filter((item) => item.v > 0 || item.suspicious > 0);

      setLogs(normalizedLogs);
      setPagination(listResponse.pagination || null);
      setBackendStats(statsResponse.data || null);
      setTimelineData(apiTimeline.length ? apiTimeline : buildTimelineFromLogs(normalizedLogs));
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load linux command data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeKey, searchCommand, searchUser, suspiciousOnly]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const stats = useMemo(() => {
    const loadedTotalCommands = logs.length;
    const loadedSuspiciousCount = logs.filter((l) => l.command.risk === "suspicious").length;
    const loadedUniqueSessions = new Set(logs.map((l) => l.sessionId)).size;
    const loadedUniqueUsers = new Set(logs.map((l) => l.user)).size;

    return {
      totalCommands: backendStats?.totalCommands ?? pagination?.total ?? loadedTotalCommands,
      suspiciousCount: backendStats?.suspiciousCommands ?? loadedSuspiciousCount,
      uniqueSessions: backendStats?.totalSessions ?? loadedUniqueSessions,
      uniqueUsers: backendStats?.users?.length ?? loadedUniqueUsers,
      loadedTotalCommands,
      loadedSuspiciousCount,
      loadedUniqueSessions,
    };
  }, [backendStats, logs, pagination]);

  const analytics = useMemo(() => {
    const topUsers = (backendStats?.users?.length ? backendStats.users : countBy(logs, (log) => log.user))
      .slice(0, 5)
      .map((it, i) => ({
        label: it.user || it.label,
        value: it.count || it.value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

    const suspiciousCommands = logs
      .filter((l) => l.command.risk === "suspicious")
      .map((l) => l.command.cmd);

    const topSuspicious = countBy(suspiciousCommands, (cmd) => cmd)
      .slice(0, 5)
      .map((it, i) => ({
        ...it,
        color: ["#ef4444", "#f97316", "#eab308", "#a78bfa", "#f87171"][i % 5],
      }));

    const riskIndicators = countBy(
      logs.flatMap((log) => log.command.indicator),
      (indicator) => indicator
    ).map((it, i) => ({
      ...it,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

    return { topUsers, topSuspicious, riskIndicators };
  }, [backendStats, logs]);

  const commandPayloadWords = useMemo(() => extractCommandKeywords(logs), [logs]);

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (searchUser) {
      result = result.filter((l) => l.user.toLowerCase().includes(searchUser.toLowerCase()));
    }

    if (searchCommand) {
      result = result.filter((l) => l.command.cmd.toLowerCase().includes(searchCommand.toLowerCase()));
    }

    if (suspiciousOnly) {
      result = result.filter((l) => l.command.risk === "suspicious");
    }

    return [...result].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [logs, searchUser, searchCommand, suspiciousOnly]);

  const sessionCommands = useMemo(() => {
    if (!selectedSession) return [];

    return logs
      .filter((l) => l.sessionId === selectedSession)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [selectedSession, logs]);

  const suspiciousRate = stats.totalCommands
    ? ((stats.suspiciousCount / stats.totalCommands) * 100).toFixed(1)
    : "0.0";

  const avgPerSession = stats.uniqueSessions
    ? (stats.totalCommands / stats.uniqueSessions).toFixed(1)
    : "0.0";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-4 md:p-6 flex flex-col gap-4">
        {/* Header & Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Terminal className="h-6 w-6 text-orange-400" />
                Host Monitoring - Linux Command Audit
              </h1>
              <p className="text-sm text-slate-400">
                Real-time user activity and command execution tracking from Elasticsearch
              </p>
            </div>
            <button
              onClick={loadDashboardData}
              disabled={refreshing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 rounded-lg text-sm text-slate-400 transition-colors border border-slate-700"
              title="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Gagal mengambil data backend: {error}
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Commands</div>
              <div className="text-2xl font-black text-orange-400 mt-1">
                {loading ? "..." : stats.totalCommands}
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="text-[10px] text-red-400 uppercase font-semibold">Suspicious</div>
              <div className="text-2xl font-black text-red-300 mt-1">
                {loading ? "..." : stats.suspiciousCount}
              </div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <div className="text-[10px] text-orange-400 uppercase font-semibold">Sessions</div>
              <div className="text-2xl font-black text-orange-300 mt-1">
                {loading ? "..." : stats.uniqueSessions}
              </div>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
              <div className="text-[10px] text-purple-400 uppercase font-semibold">Unique Users</div>
              <div className="text-2xl font-black text-purple-300 mt-1">
                {loading ? "..." : stats.uniqueUsers}
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: Command Timeline + Risk Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Command Timeline */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Command Timeline
              </div>
              <RangeFilter rangeKey={rangeKey} onRangeChange={setRangeKey} />
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              <WaveChart data={timelineData} />
            </div>
          </div>

          {/* Risk Severity Stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-center">
            <div className="text-center w-full">
              <div className="text-4xl font-black text-red-400">{loading ? "..." : stats.suspiciousCount}</div>
              <div className="text-xs text-slate-400 uppercase font-semibold mt-1">Threats Found</div>
              <div className="text-lg font-bold text-slate-300 mt-4">{suspiciousRate}%</div>
              <div className="text-xs text-slate-500">Suspicious Rate</div>
            </div>
          </div>
        </div>

        {/* Row 2: Distribution Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Top 5 Users */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
            <div className="text-sm font-semibold text-slate-300 mb-4 w-full">Top 5 Active Users</div>
            <div className="flex items-center gap-4 justify-center w-full">
              <Donut
                items={analytics.topUsers}
                size={120}
                centerLabelTop={stats.uniqueUsers}
                centerLabelBottom="users"
              />
              <div className="flex-1 min-w-0">
                <Legend items={analytics.topUsers} />
              </div>
            </div>
          </div>

          {/* Risk Indicators */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
            <div className="text-sm font-semibold text-slate-300 mb-4 w-full">Risk Indicators</div>
            <div className="flex items-center gap-4 justify-center w-full">
              <Donut
                items={analytics.riskIndicators.slice(0, 5)}
                size={120}
                centerLabelTop={analytics.riskIndicators.reduce((sum, r) => sum + r.value, 0)}
                centerLabelBottom="risks"
              />
              <div className="flex-1 min-w-0">
                <Legend items={analytics.riskIndicators.slice(0, 5)} />
              </div>
            </div>
          </div>

          {/* Commands Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3">Commands Summary</div>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Safe Commands</span>
                <span className="font-bold text-emerald-400">
                  {Math.max(stats.totalCommands - stats.suspiciousCount, 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Suspicious Commands</span>
                <span className="font-bold text-red-400">{stats.suspiciousCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Avg per Session</span>
                <span className="font-bold text-blue-400">{avgPerSession}</span>
              </div>
              <div className="flex justify-between">
                <span>Loaded Rows</span>
                <span className="font-bold text-orange-400">{logs.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Top Suspicious Commands + Command Payload Word Cloud */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Suspicious Commands */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Top 5 Dangerous Commands Executed
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              <CompactBarChart items={analytics.topSuspicious} />
            </div>
          </div>

          {/* Command Payload Word Cloud */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Command Keywords Distribution
            </div>
            <div className="bg-slate-950 border border-slate-700/60 rounded-lg p-3 flex flex-col gap-2 items-center justify-center">
              <PayloadWordCloud words={commandPayloadWords} />
            </div>
          </div>
        </div>

        {/* Row 4: Audit Log Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-800/50">
            <div className="text-sm font-semibold text-slate-300 mb-4">
              Audit Log Entries ({filteredLogs.length})
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-64 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by user..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <div className="flex-1 min-w-64 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search command..."
                  value={searchCommand}
                  onChange={(e) => setSearchCommand(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <button
                onClick={() => setSuspiciousOnly(!suspiciousOnly)}
                className={`px-4 py-2 text-xs rounded-lg font-medium transition-colors ${
                  suspiciousOnly
                    ? "bg-red-600 text-white"
                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                }`}
              >
                Suspicious Only
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Waktu</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Hostname</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Session ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Command</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.slice(0, 20).map((log, idx) => (
                  <tr
                    key={log.id}
                    className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${
                      idx % 2 !== 0 ? "bg-slate-900/30" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(log.timestamp).toLocaleString("en-US", {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-sky-300">{log.user}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{log.hostname}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setSelectedSession(selectedSession === log.sessionId ? null : log.sessionId)
                        }
                        className="text-xs font-mono text-purple-300 hover:text-purple-200 transition-colors"
                      >
                        {log.sessionId}
                      </button>
                    </td>
                    <td className="px-4 py-3 min-w-96">
                      <CommandHighlighter command={log.command.cmd} />
                    </td>
                    <td className="px-4 py-3">
                      {log.command.risk === "suspicious" ? (
                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300">
                          Suspicious
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300">
                          Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-slate-500 bg-slate-800/50">
            Showing {Math.min(20, filteredLogs.length)} of {filteredLogs.length} loaded entries
            {pagination?.total ? ` | Total in backend: ${pagination.total}` : ""}
          </div>
        </div>
      </div>

      {/* ========== SESSION DETAIL MODAL ========== */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Session Playback</h2>
                <p className="text-xs text-slate-500 mt-0.5">{selectedSession}</p>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="text-slate-400 hover:text-slate-200 text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Session Commands */}
            <div className="p-6 space-y-4">
              <div className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Chronological Commands in This Session ({sessionCommands.length})
              </div>

              {sessionCommands.map((log, idx) => (
                <div key={log.id} className="bg-slate-700/30 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded">
                          #{idx + 1}
                        </span>
                        <span className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                        {log.command.risk === "suspicious" && (
                          <span className="text-xs font-bold text-red-400">⚠ SUSPICIOUS</span>
                        )}
                      </div>
                      <div className="bg-slate-900 rounded p-3 mt-2">
                        <CommandHighlighter command={log.command.cmd} />
                      </div>

                      {log.command.indicator.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-slate-400 font-semibold mb-2">Risk Indicators:</p>
                          <div className="flex flex-wrap gap-2">
                            {log.command.indicator.map((ind, i) => (
                              <span
                                key={i}
                                className="text-xs font-bold px-2 py-1 rounded bg-red-500/20 text-red-300"
                              >
                                {ind}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                        <span>Host: {log.hostname}</span>
                        <span>•</span>
                        <span>Command Name: {log.commandName}</span>
                        <span>•</span>
                        <span>Path: {log.logFilePath}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {sessionCommands.length === 0 && (
                <div className="text-center py-8 text-slate-500">No commands found in this session</div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-6 py-4 flex justify-end">
              <button
                onClick={() => setSelectedSession(null)}
                className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostMonitoring;
