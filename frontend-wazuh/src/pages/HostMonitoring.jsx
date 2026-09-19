import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Server,
  Wifi,
  WifiOff,
  ArrowRight,
  Clock,
  TrendingUp,
  TrendingDown,
  MonitorPlay,
  Thermometer,
  Zap,
  Eye,
  Users,
} from "lucide-react";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import TopSessionsChart from "../components/TopSessionsChart";
import {
  createDefaultDateRange,
  normalizeDateRange,
  toDateTimeLocalValue,
} from "../utils/dateRange";
import { API_BASE_URL } from "../config/Api";

// ══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const RANGE_LABELS = { "1h": "1 Hour", "24h": "24 Hours", "7d": "7 Days", "30d": "30 Days" };

function rangeKeyToDateRange(rangeKey) {
  const end = new Date();
  const backMs =
    rangeKey === "1h" ? HOUR_MS : rangeKey === "7d" ? 7 * DAY_MS : rangeKey === "30d" ? 30 * DAY_MS : DAY_MS;
  const start = new Date(end.getTime() - backMs);
  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end),
  };
}

const formatBucketLabel = (ms, rangeKey) => {
  const d = new Date(ms);
  if (rangeKey === "1h") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (rangeKey === "24h") return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit" });
  if (rangeKey === "7d") return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

const formatTimestamp = (ts) =>
  new Date(ts).toLocaleString("en-US", {
    month: "short", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

// ══════════════════════════════════════════════════════════════════════════════
// SVG WAVE CHART
// ══════════════════════════════════════════════════════════════════════════════
const WaveChart = ({ data, color = "#3B82F6", height: _height = 140, rangeKey = "24h" }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 1000, height: _height });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const width = size.width;
  const height = size.height;
  const padding = width < 420 ? { l: 28, r: 8, t: 6, b: 20 } : { l: 40, r: 8, t: 6, b: 20 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  if (!data || data.length === 0) {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="10" fill="#64748b">No data</text>
      </svg>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => d.v));
  const pointSpacing = data.length ? innerW / (data.length - 1) : innerW;
  const gridSteps = 5;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i++) {
    const ratio = i / (gridSteps - 1);
    gridLines.push({ value: Math.round(ratio * maxV), y: padding.t + innerH - ratio * innerH, ratio });
  }

  let pathD = "";
  for (let i = 0; i < data.length; i++) {
    const x = padding.l + i * pointSpacing;
    const y = padding.t + innerH - (data[i].v / maxV) * innerH;
    if (i === 0) { pathD += `M ${x} ${y}`; }
    else {
      const prevX = padding.l + (i - 1) * pointSpacing;
      const prevY = padding.t + innerH - (data[i - 1].v / maxV) * innerH;
      const controlX = (prevX + x) / 2;
      pathD += ` C ${controlX} ${prevY}, ${controlX} ${y}, ${x} ${y}`;
    }
  }

  const narrowTicks = innerW < 260;
  const tickCount = narrowTicks ? 2 : clamp(Math.floor(innerW / 150), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div ref={rootRef} className="relative h-full w-full" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        {gridLines.map((grid, idx) => (
          <g key={`grid-${idx}`}>
            <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1" opacity={grid.ratio === 0 || grid.ratio === 1 ? "1" : "0.3"} />
            <text x={padding.l - 5} y={grid.y + 3} textAnchor="end" fontSize="8" fill="var(--soc-text-muted)" fontWeight="500">{grid.value}</text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1" opacity="0.5" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1" opacity="0.5" />
        <defs>
          <linearGradient id={`hm-gradient-${color.replace("#", "")}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill={`url(#hm-gradient-${color.replace("#", "")})`} />
        <path d={pathD} stroke={color} strokeWidth="2" fill="none" opacity="0.9" />
        {data.map((d, i) => {
          const x = padding.l + i * pointSpacing;
          const y = padding.t + innerH - (d.v / maxV) * innerH;
          const isSelected = selectedPoint?.index === i;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={isSelected ? "5" : "8"} fill="transparent" className="cursor-pointer"
                onMouseEnter={() => setSelectedPoint({ index: i, x, y, value: d.v, time: d.t })}
                onMouseLeave={() => setSelectedPoint(null)}
              />
              <circle cx={x} cy={y} r={isSelected ? "3" : "2"} fill={color} stroke={isSelected ? "var(--soc-bg)" : "none"} strokeWidth="1.5" opacity="0.95" className="pointer-events-none" />
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % tickEvery !== 0) return null;
          const x = padding.l + i * pointSpacing;
          const tickDate = new Date(d.t);
          const tickLabel = narrowTicks
            ? (rangeKey === "1h" ? tickDate.toLocaleTimeString("en-US", { hour: "2-digit" }) : tickDate.toLocaleDateString("en-US", { month: "short", day: "2-digit" }))
            : formatBucketLabel(d.t, rangeKey);
          return (
            <g key={`tick-${d.t}`}>
              <text x={x} y={padding.t + innerH + 12} textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"} fontSize="7" fill="var(--soc-text-muted)">{tickLabel}</text>
            </g>
          );
        })}
      </svg>
      {selectedPoint && (
        <div className="pointer-events-none absolute z-10 min-w-[100px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-elevated)] px-2 py-1.5 text-[10px] shadow-xl"
          style={{ left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`, top: `${Math.max(((selectedPoint.y - 36) / height) * 100, 4)}%`, transform: "translate(-50%, -100%)" }}>
          <div className="font-semibold text-[var(--soc-text-primary)]">{selectedPoint.value}%</div>
          <div className="mt-0.5 text-[var(--soc-text-muted)]">{formatTimestamp(selectedPoint.time)}</div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// DONUT CHART
// ══════════════════════════════════════════════════════════════════════════════
const DonutChart = ({ items, size = 120, stroke = 14, centerTop, centerBottom }) => {
  const positive = items.filter((it) => (it.value || 0) > 0);
  if (positive.length === 0) return <div className="flex items-center justify-center text-xs text-slate-600" style={{ width: size, height: size }}>No data</div>;
  const total = positive.reduce((a, b) => a + b.value, 0) || 1;
  const R = size / 2;
  const ro = R;
  const ri = Math.max(0, R - stroke);
  const polar = (radius, angle) => [radius * Math.cos(angle - Math.PI / 2), radius * Math.sin(angle - Math.PI / 2)];
  const annularPiece = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x1o, y1o] = polar(ro, a0); const [x2o, y2o] = polar(ro, a1);
    const [x2i, y2i] = polar(ri, a1); const [x1i, y1i] = polar(ri, a0);
    return [`M ${x1o} ${y1o}`, `A ${ro} ${ro} 0 ${large} 1 ${x2o} ${y2o}`, `L ${x2i} ${y2i}`, `A ${ri} ${ri} 0 ${large} 0 ${x1i} ${y1i}`, "Z"].join(" ");
  };
  let acc = 0;
  const sectors = positive.map((it) => {
    const sweep = (it.value / total) * Math.PI * 2;
    const s = { it, start: acc, end: acc + sweep }; acc += sweep; return s;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`translate(${size / 2} ${size / 2})`}>
        {sectors.map(({ it, start, end }) => {
          const d = annularPiece(start, end);
          if (!d) return null;
          return <path key={it.label} d={d} fill={it.color} opacity="0.9" />;
        })}
        <text y="-4" textAnchor="middle" fontSize="16" fill="var(--soc-text-primary)" fontWeight="700">{centerTop}</text>
        <text y="14" textAnchor="middle" fontSize="10" fill="#64748b">{centerBottom}</text>
      </g>
    </svg>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// HORIZONTAL BAR LIST
// ══════════════════════════════════════════════════════════════════════════════
const HorizontalBarList = ({ items, emptyLabel = "No data" }) => {
  if (!items || items.length === 0) {
    return <div className="flex h-full min-h-16 flex-col items-center justify-center text-center"><p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">{emptyLabel}</p></div>;
  }
  const maxCount = Math.max(...items.map((d) => d.value), 1);
  const COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const color = COLORS[i % COLORS.length];
        const label = item.label || item.name;
        const value = item.value ?? item.count;
        return (
          <div key={label} className="list-item-interactive px-2 py-1 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color }}>{i + 1}</span>
                <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)]" title={label}>{label}</span>
              </div>
              <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(value)}{item.unit || ""}</span>
            </div>
            <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(value / maxCount) * 100}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TOP AGENT CHART (like Most Changed Files on dashboard)
// ══════════════════════════════════════════════════════════════════════════════
const TopAgentChart = ({ items, emptyLabel = "No agent data" }) => {
  if (!items || items.length === 0) {
    return (
      <div className="flex h-full min-h-16 flex-col items-center justify-center text-center">
        <p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">{emptyLabel}</p>
        <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">No agent activity available for the selected time range.</p>
      </div>
    );
  }

  const maxValue = Math.max(...items.map((d) => d.value), 1);
  const COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const color = COLORS[i % COLORS.length];
        const label = item.label || item.name;
        const value = item.value ?? item.count;
        return (
          <div key={label} className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 text-[13px] font-bold text-slate-500 shrink-0">
                {i + 1}.
              </span>
              <span className="flex-1 min-w-0 text-[13px] font-mono text-slate-300 truncate" title={label}>
                {label}
              </span>
              <span className="text-[13px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
                {new Intl.NumberFormat("en-US").format(value)}
              </span>
            </div>
            {item.sub && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-5 shrink-0" />
                <span className="text-[9px] text-[var(--soc-text-muted)] truncate" title={item.sub}>{item.sub}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 shrink-0" />
              <div
                className="flex-1 bg-[var(--soc-bg)] rounded h-4 overflow-hidden"
                title={`${label}: ${value} events`}
              >
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(value / maxValue) * 100}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// KPI CARD — disamakan dengan MainDashboard (gambar 1) agar visual identik
// ══════════════════════════════════════════════════════════════════════════════
const KPICard = ({ label, value, icon: Icon, color, desc, loading, index = 0 }) => (
  <div className={`kpi-modern animate-fadeInUp stagger-${index + 1}`} style={{ opacity: 0 }}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">{label}</span>
      <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
    </div>
    <div className={`text-xl font-bold ${color} mb-1`}>
      {loading ? <div className="skeleton h-6 w-16"></div> : value}
    </div>
    {desc && <div className="text-[9px] text-[var(--soc-text-muted)]">{desc}</div>}
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// API FETCHING
// ══════════════════════════════════════════════════════════════════════════════
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function rangeKeyToParams(rangeKey) {
  const end = new Date();
  const backMs =
    rangeKey === "1h" ? HOUR_MS
      : rangeKey === "7d" ? 7 * DAY_MS
        : rangeKey === "30d" ? 30 * DAY_MS
          : DAY_MS;
  const start = new Date(end.getTime() - backMs);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function customRangeToParams(customDateRange) {
  const nr = normalizeDateRange(customDateRange);
  return { start: nr.start, end: nr.end };
}

function buildParams(rangeKey, filterMode, customDateRange, extra = {}) {
  const dateParams = filterMode === "custom"
    ? customRangeToParams(customDateRange)
    : rangeKeyToParams(rangeKey);
  const p = new URLSearchParams({ ...dateParams, ...extra });
  return p.toString();
}

const EMPTY_DATA = {
  hosts: [],
  kpi: { totalHosts: 0, onlineHosts: 0, warningHosts: 0, offlineHosts: 0, totalAlerts: 0, avgCpu: 0, avgMemory: 0 },
  cpuTimeline: [],
  memoryTimeline: [],
  diskTimeline: [],
  networkTimeline: [],
  statusDistribution: [],
  topProcesses: [],
  topAgents: [],
  topSessions: [],
  recentAlerts: [],
};

const safeMax = (arr) => arr.length ? Math.max(...arr.map((d) => d.v)) : 0;
const safeMin = (arr) => arr.length ? Math.min(...arr.map((d) => d.v)) : 0;
const safeAvg = (arr) => arr.length ? Math.round(arr.reduce((s, d) => s + d.v, 0) / arr.length) : 0;

// ══════════════════════════════════════════════════════════════════════════════
// TIMELINE SECTION
// ══════════════════════════════════════════════════════════════════════════════
const TimelineSection = ({ title, subtitle, icon: Icon, iconColor, iconBg, chartColor, data, stats, rangeKey, selectedRangeLabel, index = 0 }) => (
  <div className={`chart-card animate-fadeInUp stagger-${Math.min(index + 1, 5)} flex-1`} style={{ opacity: 0 }}>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${iconBg}`}><Icon className={`h-3.5 w-3.5 ${iconColor}`} /></div>
        <div>
          <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">{title}</h3>
          <p className="text-[9px] text-[var(--soc-text-muted)]">{subtitle}</p>
        </div>
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
      <div className="lg:col-span-2 rounded-lg p-3 flex flex-col" style={{ background: "transparent" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] text-[var(--soc-text-muted)]">{title} Timeline ({selectedRangeLabel})</span>
        </div>
        <div className="w-full h-[160px] rounded-lg overflow-hidden" style={{ background: "transparent" }}>
          <WaveChart data={data} color={chartColor} height={160} rangeKey={rangeKey} />
        </div>
      </div>
      <div className="rounded-lg p-3">
        <div className="text-[8px] text-[var(--soc-text-muted)] uppercase font-semibold mb-2">Quick Stats</div>
        <div className="space-y-0">
          {stats.map((s, i) => (
            <div key={s.label}>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-[10px] text-[var(--soc-text-muted)]">{s.label}</span>
                <span className={`text-[11px] font-bold ${s.color}`}>{s.value}</span>
              </div>
              {i < stats.length - 1 && <div className="border-b border-[var(--soc-border)]" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function HostMonitoring() {
  const [rangeKey, setRangeKey] = useState("24h");
  const [filterMode, setFilterMode] = useState("range");
  const [customDateRange, setCustomDateRange] = useState(() => createDefaultDateRange(1));
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleRangeChange = (key) => { setRangeKey(key); setFilterMode("range"); };
  const handleCustomRangeChange = (range) => { setCustomDateRange(range); setFilterMode("custom"); };

  // Fetch data from API
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const p = buildParams(rangeKey, filterMode, customDateRange);
        const [hostsRes, statsRes, cpuRes, memRes, diskRes, netRes, procRes, agentsRes, sessionsRes, alertsRes] = await Promise.all([
          fetchJson(`${API_BASE_URL}/host-monitoring?${p}`),
          fetchJson(`${API_BASE_URL}/host-monitoring/stats?${p}`),
          fetchJson(`${API_BASE_URL}/host-monitoring/timeline?${p}&metric=cpu`),
          fetchJson(`${API_BASE_URL}/host-monitoring/timeline?${p}&metric=memory`),
          fetchJson(`${API_BASE_URL}/host-monitoring/timeline?${p}&metric=disk`),
          fetchJson(`${API_BASE_URL}/host-monitoring/timeline?${p}&metric=network_in`),
          fetchJson(`${API_BASE_URL}/host-monitoring/top-processes?${p}`),
          fetchJson(`${API_BASE_URL}/host-monitoring/top-agents?${p}`),
          fetchJson(`${API_BASE_URL}/host-monitoring/top-sessions?${p}`),
          fetchJson(`${API_BASE_URL}/host-monitoring/alerts?${p}`),
        ]);

        if (cancelled) return;

        const kpi = statsRes?.data || EMPTY_DATA.kpi;
        const hosts = hostsRes?.hosts || [];
        setData({
          hosts,
          kpi,
          cpuTimeline: cpuRes?.data || [],
          memoryTimeline: memRes?.data || [],
          diskTimeline: diskRes?.data || [],
          networkTimeline: netRes?.data || [],
          statusDistribution: [
            { label: "Online", value: kpi.onlineHosts || 0, color: "#10B981" },
            { label: "Warning", value: kpi.warningHosts || 0, color: "#F59E0B" },
            { label: "Offline", value: kpi.offlineHosts || 0, color: "#EF4444" },
          ],
          topProcesses: procRes?.data || [],
          topAgents: agentsRes?.data || [],
          topSessions: sessionsRes?.data || [],
          recentAlerts: alertsRes?.data || [],
        });
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to fetch data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [rangeKey, filterMode, customDateRange]);

  const effectiveRangeKey = rangeKey;
  const selectedRangeLabel = filterMode === "custom"
    ? `${new Date(normalizeDateRange(customDateRange).start).toLocaleDateString()} - ${new Date(normalizeDateRange(customDateRange).end).toLocaleDateString()}`
    : RANGE_LABELS[rangeKey] || rangeKey;

  const formatInteger = (v) => new Intl.NumberFormat("en-US").format(Number(v || 0));

  return (
    <div className="flex flex-col w-full min-w-0 gap-4">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          <span className="ml-3 text-[var(--soc-text-muted)]">Loading host data...</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Error: {error}</span>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)] flex items-center gap-2">
            <MonitorPlay className="h-5 w-5 text-blue-400" />
            Host Monitoring
          </h1>
          <p className="text-[11px] text-[var(--soc-text-muted)] mt-0.5">Real-time infrastructure health and resource monitoring</p>
        </div>
        <div className="flex items-center gap-2 relative z-50">
          <RangeFilter rangeKey={rangeKey} onRangeChange={handleRangeChange} />
          <DateRangeFilter value={customDateRange} onChange={handleCustomRangeChange} />
        </div>
      </div>

      {/* KPI Cards — layout & style disamakan persis dengan Dashboard (gambar 1) */}
      <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-3">
        <KPICard
          label="Total Hosts"
          value={formatInteger(data.kpi.totalHosts)}
          icon={Server}
          color="text-purple-400"
          desc="Monitored servers"
          loading={loading}
          index={0}
        />
        <KPICard
          label="Online"
          value={formatInteger(data.kpi.onlineHosts)}
          icon={Wifi}
          color="text-pink-400"
          desc={`${data.kpi.offlineHosts} offline`}
          loading={loading}
          index={1}
        />
        <KPICard
          label="Avg CPU"
          value={`${data.kpi.avgCpu}%`}
          icon={Cpu}
          color="text-cyan-400"
          desc="Across all hosts"
          loading={loading}
          index={2}
        />
        <KPICard
          label="Alerts"
          value={formatInteger(data.kpi.totalAlerts)}
          icon={AlertTriangle}
          color="text-emerald-400"
          desc="Active warnings"
          loading={loading}
          index={3}
        />
      </div>

      {/* Main Content Grid — same pattern as MainDashboard */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-w-0 max-w-full">
        {/* Left Column (2 cols): Host Table + Status Donut + Top Sessions */}
        <div className="xl:col-span-2 flex flex-col gap-4 min-w-0 max-w-full">
          {/* Host Status Table */}
          <div className="chart-card animate-fadeInUp stagger-1 flex-1 min-w-0 max-w-full overflow-hidden" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10"><Server className="h-3.5 w-3.5 text-blue-400" /></div>
                <div>
                  <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Host Overview</h3>
                  <p className="text-[9px] text-[var(--soc-text-muted)]">All monitored hosts and their status</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[9px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> <span className="text-[var(--soc-text-muted)]">{data.kpi.onlineHosts} online</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px]">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" /> <span className="text-[var(--soc-text-muted)]">{data.kpi.warningHosts} warning</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px]">
                  <span className="w-2 h-2 rounded-full bg-red-400" /> <span className="text-[var(--soc-text-muted)]">{data.kpi.offlineHosts} offline</span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-[var(--soc-border)]">
                    <th className="text-left px-3 py-2 text-[var(--soc-text-muted)] font-semibold uppercase">Host</th>
                    <th className="text-left px-3 py-2 text-[var(--soc-text-muted)] font-semibold uppercase">IP Address</th>
                    <th className="text-left px-3 py-2 text-[var(--soc-text-muted)] font-semibold uppercase">OS</th>
                    <th className="text-center px-3 py-2 text-[var(--soc-text-muted)] font-semibold uppercase">Status</th>
                    <th className="text-center px-3 py-2 text-[var(--soc-text-muted)] font-semibold uppercase">CPU</th>
                    <th className="text-center px-3 py-2 text-[var(--soc-text-muted)] font-semibold uppercase">Memory</th>
                    <th className="text-center px-3 py-2 text-[var(--soc-text-muted)] font-semibold uppercase">Disk</th>
                    <th className="text-right px-3 py-2 text-[var(--soc-text-muted)] font-semibold uppercase">Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hosts.map((host, idx) => (
                    <tr key={host.id} className={`border-b border-[var(--soc-border)] hover:bg-[var(--soc-elevated)] transition-colors ${idx % 2 !== 0 ? "bg-[var(--soc-elevated)]/30" : ""}`}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <MonitorPlay className="h-3 w-3 text-blue-400 shrink-0" />
                          <span className="font-medium text-[var(--soc-text-primary)]">{host.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--soc-text-secondary)] font-mono text-[9px]">{host.ip}</td>
                      <td className="px-3 py-2.5 text-[var(--soc-text-muted)]">{host.os}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                          host.status === "online" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : host.status === "warning" ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                          : "bg-red-500/15 text-red-400 border border-red-500/30"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${host.status === "online" ? "bg-emerald-400" : host.status === "warning" ? "bg-yellow-400" : "bg-red-400"}`} />
                          {host.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`font-bold ${host.cpu > 80 ? "text-red-400" : host.cpu > 60 ? "text-yellow-400" : "text-emerald-400"}`}>{host.cpu}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`font-bold ${host.memory > 80 ? "text-red-400" : host.memory > 60 ? "text-yellow-400" : "text-emerald-400"}`}>{host.memory}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`font-bold ${host.disk > 80 ? "text-red-400" : host.disk > 60 ? "text-yellow-400" : "text-emerald-400"}`}>{host.disk}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`font-bold ${host.alerts > 5 ? "text-red-400" : host.alerts > 2 ? "text-yellow-400" : "text-emerald-400"}`}>{host.alerts}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Status Distribution Donut — moved from right sidebar to left column */}
          <div className="chart-card animate-fadeInUp stagger-2 flex-1 min-w-0 max-w-full overflow-hidden" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10"><Activity className="h-3.5 w-3.5 text-emerald-400" /></div>
                <div>
                  <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Host Status</h3>
                  <p className="text-[9px] text-[var(--soc-text-muted)]">Distribution by health</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 min-[500px]:grid-cols-2 gap-4 items-center">
              <div className="flex items-center justify-center">
                <DonutChart items={data.statusDistribution} size={130} stroke={16} centerTop={data.kpi.totalHosts} centerBottom="hosts" />
              </div>
              <div className="space-y-2">
                {data.statusDistribution.map((item) => (
                  <div key={item.label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--soc-elevated)]">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="flex-1 text-[11px] text-[var(--soc-text-secondary)]">{item.label}</span>
                    <span className="text-[13px] font-bold text-[var(--soc-text-primary)]">{item.value}</span>
                    <span className="text-[9px] text-[var(--soc-text-muted)]">
                      {data.kpi.totalHosts > 0 ? Math.round((item.value / data.kpi.totalHosts) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Sessions — layout disamakan dengan Command Timeline (AttackDashboard) */}
          {(() => {
            const topSessionsTotal = (data.topSessions || []).reduce((s, it) => s + (it.value ?? 0), 0);
            return (
            <div className="chart-card animate-fadeInUp stagger-2 w-full flex flex-col min-w-0 overflow-hidden box-border" style={{ opacity: 0, maxWidth: "100%" }}>
              <div className="flex items-center justify-between mb-3 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-orange-500/10 shrink-0"><MonitorPlay className="h-3.5 w-3.5 text-orange-400" /></div>
                  <div className="min-w-0">
                    <h3 className="truncate text-[11px] font-semibold text-[var(--soc-text-primary)]">Top Sessions</h3>
                    <p className="truncate text-[9px] text-[var(--soc-text-muted)]">Most active sessions by event activity</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9px] text-[var(--soc-text-muted)]">Total</div>
                  <div className="text-[11px] font-bold text-orange-400">{new Intl.NumberFormat("en-US").format(topSessionsTotal)} <span className="text-[9px] font-normal text-[var(--soc-text-muted)]">sessions</span></div>
                </div>
              </div>
              <div className="h-[220px] w-full min-w-0 overflow-hidden box-border" style={{ maxWidth: "100%" }}>
                <TopSessionsChart items={data.topSessions} color="#F97316" totalLabel="sessions" showTotal={false} showLegend={false} />
              </div>
            </div>
            );
          })()}
        </div>

        {/* Right Column (1 col): Top Agents + Processes + Alerts */}
        <div className="flex flex-col gap-4 min-w-0 max-w-full">
          {/* Top 5 Agents */}
          <div className="chart-card animate-fadeInUp stagger-3 flex-1 min-w-0 max-w-full overflow-hidden" style={{ opacity: 0 }}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-[var(--soc-text-primary)] flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  Top 5 Agents
                </div>
                <div className="mt-1 text-[10px] text-[var(--soc-text-muted)]">Most active agents from host monitoring events</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[var(--soc-text-muted)]">Unique agents</div>
                <div className="text-sm font-bold text-cyan-400">{data.topAgents.length}</div>
              </div>
            </div>
            <TopAgentChart
              items={data.topAgents}
              emptyLabel="No agent data available"
            />
          </div>

          {/* Top Processes */}
          <div className="chart-card animate-fadeInUp stagger-4 flex-1 min-w-0 max-w-full overflow-hidden" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10"><Zap className="h-3.5 w-3.5 text-purple-400" /></div>
                <div>
                  <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top Processes</h3>
                  <p className="text-[9px] text-[var(--soc-text-muted)]">By memory consumption</p>
                </div>
              </div>
            </div>
            <HorizontalBarList items={data.topProcesses} emptyLabel="No process data" />
          </div>

          {/* Recent Alerts */}
          <div className="chart-card animate-fadeInUp stagger-5 flex-1 min-w-0 max-w-full overflow-hidden" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-red-500/10"><AlertTriangle className="h-3.5 w-3.5 text-red-400" /></div>
                <div>
                  <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Recent Alerts</h3>
                  <p className="text-[9px] text-[var(--soc-text-muted)]">Latest host warnings</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {data.recentAlerts.length === 0 ? (
                <div className="flex h-full min-h-16 flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">No alerts</p>
                  <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">All hosts are within normal thresholds.</p>
                </div>
              ) : (
                data.recentAlerts.map((alert, i) => (
                  <div key={i} className="list-item-interactive px-2 py-1.5 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${alert.severity === "critical" ? "bg-red-400" : alert.severity === "high" ? "bg-orange-400" : "bg-yellow-400"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-medium text-[var(--soc-text-primary)]">{alert.host}</div>
                        <div className="text-[9px] text-[var(--soc-text-muted)] mt-0.5 truncate">{alert.message}</div>
                        <div className="text-[8px] text-[var(--soc-text-muted)] mt-0.5 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTimestamp(alert.time)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resource Timeline Sections */}
      {[
        {
          title: "CPU Usage",
          subtitle: "Average CPU utilization across all hosts",
          icon: Cpu,
          iconColor: "text-purple-400",
          iconBg: "bg-purple-500/10",
          chartColor: "#A855F7",
          data: data.cpuTimeline,
          stats: [
            { label: "Current Avg", value: `${data.kpi.avgCpu}%`, color: "text-purple-400" },
            { label: "Peak", value: `${safeMax(data.cpuTimeline)}%`, color: "text-red-400" },
            { label: "Min", value: `${safeMin(data.cpuTimeline)}%`, color: "text-emerald-400" },
            { label: "Threshold", value: "85%", color: "text-yellow-400" },
          ],
        },
        {
          title: "Memory Usage",
          subtitle: "RAM utilization across all hosts",
          icon: MemoryStick,
          iconColor: "text-blue-400",
          iconBg: "bg-blue-500/10",
          chartColor: "#3B82F6",
          data: data.memoryTimeline,
          stats: [
            { label: "Current Avg", value: `${data.kpi.avgMemory}%`, color: "text-blue-400" },
            { label: "Peak", value: `${safeMax(data.memoryTimeline)}%`, color: "text-red-400" },
            { label: "Min", value: `${safeMin(data.memoryTimeline)}%`, color: "text-emerald-400" },
            { label: "Threshold", value: "80%", color: "text-yellow-400" },
          ],
        },
        {
          title: "Disk Usage",
          subtitle: "Storage utilization across all hosts",
          icon: HardDrive,
          iconColor: "text-cyan-400",
          iconBg: "bg-cyan-500/10",
          chartColor: "#06B6D4",
          data: data.diskTimeline,
          stats: [
            { label: "Avg Usage", value: `${safeAvg(data.diskTimeline)}%`, color: "text-cyan-400" },
            { label: "Peak", value: `${safeMax(data.diskTimeline)}%`, color: "text-red-400" },
            { label: "Min", value: `${safeMin(data.diskTimeline)}%`, color: "text-emerald-400" },
            { label: "Threshold", value: "85%", color: "text-yellow-400" },
          ],
        },
        {
          title: "Network Activity",
          subtitle: "Bandwidth utilization across all hosts",
          icon: Network,
          iconColor: "text-emerald-400",
          iconBg: "bg-emerald-500/10",
          chartColor: "#10B981",
          data: data.networkTimeline,
          stats: [
            { label: "Avg", value: `${safeAvg(data.networkTimeline)}%`, color: "text-emerald-400" },
            { label: "Peak", value: `${safeMax(data.networkTimeline)}%`, color: "text-red-400" },
            { label: "Min", value: `${safeMin(data.networkTimeline)}%`, color: "text-emerald-400" },
            { label: "Threshold", value: "90%", color: "text-yellow-400" },
          ],
        },
      ].map((section, idx) => (
        <TimelineSection key={section.title} {...section} rangeKey={effectiveRangeKey} selectedRangeLabel={selectedRangeLabel} index={idx} />
      ))}
    </div>
  );
}
