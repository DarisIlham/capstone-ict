import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import {
  createEmptyDashboardData,
  getMainDashboardData,
} from "../services/dashboardApi";
import {
  Activity,
  AlertTriangle,
  Bug,
  BrainCircuit,
  FileText,
  Eye,
  BarChart3,
  RefreshCw,
  TrendingUp,
  Shield,
  Terminal,
  ArrowRight,
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
// SVG Chart Components (Shared)
// ========================================

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const formatBucketLabel = (ms, rangeKey) => {
  const d = new Date(ms);
  if (rangeKey === "1h") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  if (rangeKey === "24h") {
    return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit" });
  }
  if (rangeKey === "7d") {
    return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "2-digit", hour: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

const formatPointTimestamp = (timestamp, rangeKey) => {
  const date = new Date(timestamp);

  if (rangeKey === "1h") {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  if (rangeKey === "24h" || rangeKey === "7d") {
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const WaveChart = ({ data, color = "#38bdf8", height = 180, rangeKey = "24h" }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const width = 1000;
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

  const gridSteps = 5;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i++) {
    const ratio = i / (gridSteps - 1);
    const value = Math.round(ratio * maxV);
    const y = padding.t + innerH - ratio * innerH;
    gridLines.push({ value, y, ratio });
  }

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

  const tickCount = clamp(Math.floor(innerW / 150), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div className="relative" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
        {gridLines.map((grid, idx) => (
          <g key={`grid-${idx}`}>
            <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="#1e293b" strokeWidth="1" opacity={grid.ratio === 0 || grid.ratio === 1 ? "1" : "0.5"} />
            <text x={padding.l - 5} y={grid.y + 4} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="600">
              {grid.value}
            </text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" strokeWidth="1.5" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="#334155" strokeWidth="1.5" />
        <path d={pathD} stroke={color} strokeWidth="2.5" fill="none" opacity="0.8" />
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill={`url(#gradient-${color})`} />
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
                onClick={() => setSelectedPoint(isSelected ? null : pointData)}
              />
              <circle
                cx={x}
                cy={y}
                r={isSelected ? "5" : "3.5"}
                fill={color}
                stroke="#0f172a"
                strokeWidth="1.5"
                opacity="0.95"
                className="pointer-events-none"
              />
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % tickEvery !== 0) return null;
          const x = padding.l + i * pointSpacing;

          return (
            <g key={`tick-${d.t}`}>
              <line
                x1={x}
                y1={padding.t + innerH}
                x2={x}
                y2={padding.t + innerH + 4}
                stroke="#334155"
              />
              <text
                x={x}
                y={padding.t + innerH + 16}
                textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"}
                fontSize="9"
                fill="#64748b"
              >
                {formatBucketLabel(d.t, rangeKey)}
              </text>
            </g>
          );
        })}
      </svg>

      {selectedPoint && (
        <div
          className="pointer-events-none absolute z-10 min-w-[120px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`,
            top: `${Math.max(((selectedPoint.y - 48) / height) * 100, 4)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-white">{selectedPoint.value} events</div>
          <div className="mt-1 text-slate-400">{formatPointTimestamp(selectedPoint.time, rangeKey)}</div>
        </div>
      )}
    </div>
  );
};

const Donut = ({ items, size = 100, stroke = 12, centerLabelTop, centerLabelBottom, centerFontTop = 16, centerFontBottom = 12 }) => {
  const [hoveredItem, setHoveredItem] = useState(null);
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative inline-block" onMouseLeave={() => setHoveredItem(null)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2} ${size / 2})`}>
          <circle r={r} fill="transparent" stroke="#1e293b" strokeWidth={stroke} />
          {items.map((it, idx) => {
            const currentOffset = items.slice(0, idx).reduce((acc, prev) => acc + (prev.value / total) * c, 0);
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
                className="cursor-pointer"
                onMouseEnter={() => setHoveredItem(it)}
                onFocus={() => setHoveredItem(it)}
                onBlur={() => setHoveredItem(null)}
              />
            );
          })}
          <text y={-(centerFontTop / 4)} textAnchor="middle" fontSize={centerFontTop} fill="#f1f5f9" fontWeight="800">
            {centerLabelTop}
          </text>
          <text y={centerFontBottom + 2} textAnchor="middle" fontSize={centerFontBottom} fill="#cbd5e1" fontWeight="600">
            {centerLabelBottom}
          </text>
        </g>
      </svg>

      {hoveredItem && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 min-w-[120px] -translate-x-1/2 -translate-y-full rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg">
          <div className="font-semibold text-white">{hoveredItem.label}</div>
          <div className="mt-1 text-slate-400">{hoveredItem.value} items</div>
        </div>
      )}
    </div>
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
  if (!items || items.length === 0) {
    return (
      <div className="flex min-h-32 items-center justify-center text-sm text-slate-500">
        No active user data
      </div>
    );
  }

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
            <div
              className="flex-1 bg-slate-800/50 rounded-full h-4 overflow-hidden border border-slate-700/30"
              title={`${item.label}: ${item.value} events`}
            >
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
// Horizontal Domain Bar Chart
// ========================================
const DomainBarChart = ({ domains }) => {
  if (!domains || domains.length === 0)
    return <div className="flex items-center justify-center h-full text-slate-600 text-sm">No domain data</div>;

  const maxCount = Math.max(...domains.map((d) => d.count), 1);
  const barGap = 15; // vertical gap below each bar
  const barHeight = 36;
  const rowHeight = barHeight + barGap;
  const chartHeight = domains.length * rowHeight;
  const CHART_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6"];

  return (
    <svg width="100%" viewBox={`0 0 1000 ${chartHeight}`} className="block" style={{ minHeight: chartHeight }}>
      {domains.map((domain, i) => {
        const maxBarArea = 560; // available width for bars
        const barWidth = (domain.count / maxCount) * maxBarArea;
        const y = i * rowHeight;
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const truncatedName = domain.name.length > 28 ? domain.name.substring(0, 28) + "..." : domain.name;

        return (
          <g key={domain.name}>
            <title>{`${domain.name}: ${domain.count} events`}</title>
            <rect x="320" y={y + Math.floor(barGap / 2)} width={barWidth} height={barHeight} fill={color} opacity="0.92" rx="4" className="cursor-pointer" />
            <text x="12" y={y + Math.floor(barGap / 2) + barHeight / 2 + 6} fontSize="12" fill="#e2e8f0" textAnchor="start" fontWeight="700" fontFamily="monospace">
              {truncatedName}
            </text>
            <text x={326 + barWidth + 8} y={y + Math.floor(barGap / 2) + barHeight / 2 + 6} fontSize="12" fill="#94a3b8" fontWeight="700">
              {domain.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const RANGE_LABELS = {
  "1h": "1 Hour",
  "24h": "24 Hours",
  "7d": "7 Days",
  "30d": "30 Days",
};

// ========================================
// Main Dashboard Component
// ========================================
export default function MainDashboard() {
  const navigate = useNavigate();
  const [rangeKey, setRangeKey] = useState("30d");
  const [dashboardData, setDashboardData] = useState(() => createEmptyDashboardData("30d"));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadDashboardData = useCallback(async (asRefresh = false) => {
    if (asRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setLoadError("");

    try {
      const nextData = await getMainDashboardData(rangeKey);
      setDashboardData(nextData);
    } catch (error) {
      console.error(error);
      setLoadError(error.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeKey]);

  useEffect(() => {
    loadDashboardData(false);

    const interval = setInterval(() => {
      loadDashboardData(true);
    }, 60_000);

    return () => clearInterval(interval);
  }, [loadDashboardData]);

  const handleRefresh = async () => {
    await loadDashboardData(true);
  };

  const formatInteger = (value) =>
    new Intl.NumberFormat("en-US").format(Number(value || 0));
  const formatDecimal = (value, digits = 1) =>
    Number(value || 0).toFixed(digits);
  const selectedRangeLabel = RANGE_LABELS[rangeKey] || rangeKey;

  if (loading && !dashboardData.lastUpdated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-sky-400 gap-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400"></div>
        <div className="text-sm font-medium">Loading main dashboard...</div>
      </div>
    );
  }

  if (loadError && !dashboardData.lastUpdated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-lg rounded-xl border border-red-500/40 bg-red-500/10 px-6 py-4 text-sm text-red-200">
          Failed to load dashboard data: {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-4 md:p-6 flex flex-col gap-4">
        {/* Header Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-400" />
                Security Operations Dashboard
              </h1>
              <p className="text-xs text-slate-400 mt-1">Real-time monitoring & threat detection across all systems</p>
              {dashboardData.lastUpdated && (
                <p className="text-[11px] text-slate-500 mt-2">
                  Last sync:{" "}
                  {new Date(dashboardData.lastUpdated).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <RangeFilter rangeKey={rangeKey} onRangeChange={setRangeKey} />
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="disabled:opacity-50 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-400 transition-colors border border-slate-700 flex items-center gap-2 w-fit"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing || loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {loadError}
          </div>
        )}

        {dashboardData.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Partial data loaded. {dashboardData.warnings.join(" | ")}
          </div>
        )}

        {/* KPI Cards Row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Total Commands</div>
                <div className="text-2xl md:text-3xl font-black text-red-400 mt-2">
                  {loading ? "..." : formatInteger(dashboardData.stats.totalAttacks)}
                </div>
              </div>
              <Terminal className="h-8 w-8 text-red-500/30" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Threats Detected</div>
                <div className="text-2xl md:text-3xl font-black text-orange-400 mt-2">
                  {loading ? "..." : formatInteger(dashboardData.stats.totalThreats)}
                </div>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500/30" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Files Scanned</div>
                <div className="text-2xl md:text-3xl font-black text-sky-400 mt-2">
                  {loading ? "..." : formatInteger(dashboardData.stats.fileScanned)}
                </div>
              </div>
              <Bug className="h-8 w-8 text-sky-500/30" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">FIM Events</div>
                <div className="text-2xl md:text-3xl font-black text-emerald-400 mt-2">
                  {loading ? "..." : formatInteger(dashboardData.stats.fimEvents)}
                </div>
              </div>
              <FileText className="h-8 w-8 text-emerald-500/30" />
            </div>
          </div>
        </div>

        {/* KPI Cards Row 2 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Suspicious Activities</div>
                <div className="text-2xl md:text-3xl font-black text-yellow-400 mt-2">
                  {loading ? "..." : formatInteger(dashboardData.stats.suspiciousActivities)}
                </div>
              </div>
              <Eye className="h-8 w-8 text-yellow-500/30" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Avg Risk Score</div>
                <div className="text-2xl md:text-3xl font-black text-red-400 mt-2">
                  {loading ? "..." : `${formatDecimal(dashboardData.stats.avgRiskScore)}/10`}
                </div>
              </div>
              <TrendingUp className="h-8 w-8 text-red-500/30" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">System Health</div>
                <div className="text-2xl md:text-3xl font-black text-emerald-400 mt-2">
                  {loading ? "..." : `${formatDecimal(dashboardData.stats.systemHealth)}%`}
                </div>
              </div>
              <Shield className="h-8 w-8 text-emerald-500/30" />
            </div>
          </div>
        </div>

        {/* Analytics Grid with View Full Buttons (moved directly under KPI Row 2) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Users with View Full */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                Top Active Users
              </div>
              <button
                onClick={() => navigate("/attack-dashboard")}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium text-white transition-colors flex items-center gap-1"
              >
                <Eye className="h-3 w-3" />
                View Full
              </button>
            </div>
            <CompactBarChart items={dashboardData.userRanking} />
          </div>

          {/* Risk Distribution with View Full (centered, larger donut, horizontal legend below) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-300">Risk Level Distribution</div>
              <button
                onClick={() => navigate("/attack-dashboard")}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium text-white transition-colors flex items-center gap-1"
              >
                <Eye className="h-3 w-3" />
                View Full
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 min-h-72">
              <div className="mb-4 flex w-full justify-center">
                <Donut
                  items={dashboardData.riskDistribution}
                  size={230}
                  stroke={16}
                  centerFontTop={14}
                  centerFontBottom={10}
                  centerLabelTop={dashboardData.riskDistribution.reduce((s, it) => s + it.value, 0)}
                  centerLabelBottom="incidents"
                />
              </div>

              <div className="w-full flex justify-center">
                <div className="flex flex-wrap items-center gap-4 max-w-full justify-center">
                  {dashboardData.riskDistribution.map((it) => (
                    <div key={it.label} className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
                      <span className="whitespace-nowrap text-xs">{it.label}</span>
                      <span className="text-slate-400 ml-1 font-mono text-xs">{it.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Affected Hosts with View Full */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-sky-400" />
                Most Affected Hosts
              </div>
              <button
                onClick={() => navigate("/fim-events")}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium text-white transition-colors flex items-center gap-1"
              >
                <Eye className="h-3 w-3" />
                View Full
              </button>
            </div>
            <div className="overflow-x-auto flex items-center justify-center min-h-40">
              <div className="w-full">
                <DomainBarChart domains={dashboardData.hostData} />
              </div>
            </div>
          </div>

          {/* Threat Classification with centered larger donut and horizontal legend below */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-300">Threat Classification</div>
              <button
                onClick={() => navigate("/file-security")}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium text-white transition-colors flex items-center gap-1"
              >
                <Eye className="h-3 w-3" />
                View Full
              </button>
            </div>
            <div className="flex flex-col items-center justify-center gap-4 min-h-64">
              <div className="mb-4">
                <Donut
                  items={dashboardData.threatTypes}
                  size={190}
                  stroke={15}
                  centerFontTop={14}
                  centerFontBottom={10}
                  centerLabelTop={dashboardData.threatTypes.reduce((s, it) => s + it.value, 0)}
                  centerLabelBottom="threats"
                />
              </div>

              <div className="w-full flex justify-center">
                <div className="flex flex-wrap items-center gap-4 max-w-full justify-center">
                  {dashboardData.threatTypes.map((it) => (
                    <div key={it.label} className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: it.color }} />
                      <span className="whitespace-nowrap">{it.label}</span>
                      <span className="text-slate-400 ml-1 font-mono text-xs">{it.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Section - Attack Dashboard Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Terminal className="h-5 w-5 text-orange-400" />
                Host Command Monitoring & Attack Detection
              </h2>
              <p className="text-xs text-slate-400 mt-1">Real-time command execution audit logs</p>
            </div>
            <button
              onClick={() => navigate("/attack-dashboard")}
              className="mt-3 md:mt-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2 w-fit"
            >
              <Eye className="h-4 w-4" />
              View Full
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-slate-400">Command Timeline ({selectedRangeLabel})</div>
                <RangeFilter rangeKey={rangeKey} onRangeChange={setRangeKey} />
              </div>
              <WaveChart data={dashboardData.commandEvents} color="#f97316" height={160} rangeKey={rangeKey} />
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Quick Stats</div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Total Commands</span>
                    <span className="text-lg font-bold text-orange-400">
                      {formatInteger(dashboardData.quickStats.attack.totalCommands)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Peak Bucket</span>
                    <span className="text-lg font-bold text-orange-300">
                      {formatInteger(dashboardData.quickStats.attack.peak)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Avg/Bucket</span>
                    <span className="text-lg font-bold text-yellow-400">
                      {formatDecimal(dashboardData.quickStats.attack.avg)}
                    </span>
                  </div>
                  <div className="h-px bg-slate-700 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Suspicious</span>
                    <span className="text-lg font-bold text-orange-500">
                      {formatInteger(dashboardData.quickStats.attack.suspicious)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* File Security Scanner Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Bug className="h-5 w-5 text-red-400" />
                File Content Security Scanner
              </h2>
              <p className="text-xs text-slate-400 mt-1">Malware detection & IOC analysis</p>
            </div>
            <button
              onClick={() => navigate("/file-security")}
              className="mt-3 md:mt-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2 w-fit"
            >
              <Eye className="h-4 w-4" />
              View Full
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-slate-400">Detection Timeline ({selectedRangeLabel})</div>
                <RangeFilter rangeKey={rangeKey} onRangeChange={setRangeKey} />
              </div>
              <WaveChart data={dashboardData.fileEvents} color="#ef4444" height={160} rangeKey={rangeKey} />
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Quick Stats</div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Scanned</span>
                    <span className="text-lg font-bold text-sky-400">
                      {formatInteger(dashboardData.quickStats.file.scanned)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Threats</span>
                    <span className="text-lg font-bold text-red-400">
                      {formatInteger(dashboardData.quickStats.file.threats)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Detection Rate</span>
                    <span className="text-lg font-bold text-yellow-400">
                      {formatDecimal(dashboardData.quickStats.file.detectionRate)}%
                    </span>
                  </div>
                  <div className="h-px bg-slate-700 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Health</span>
                    <span className="text-lg font-bold text-emerald-400">
                      {formatDecimal(dashboardData.quickStats.file.health)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FIM Events Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-400" />
                File Integrity Monitoring (FIM)
              </h2>
              <p className="text-xs text-slate-400 mt-1">File modifications & access events</p>
            </div>
            <button
              onClick={() => navigate("/fim-events")}
              className="mt-3 md:mt-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2 w-fit"
            >
              <Eye className="h-4 w-4" />
              View Full
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-slate-400">FIM Events Timeline ({selectedRangeLabel})</div>
                <RangeFilter rangeKey={rangeKey} onRangeChange={setRangeKey} />
              </div>
              <WaveChart data={dashboardData.fimEvents} color="#10b981" height={160} rangeKey={rangeKey} />
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Quick Stats</div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Total Events</span>
                    <span className="text-lg font-bold text-emerald-400">
                      {formatInteger(dashboardData.quickStats.fim.totalEvents)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Peak Bucket</span>
                    <span className="text-lg font-bold text-emerald-400">
                      {formatInteger(dashboardData.quickStats.fim.peak)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Avg/Bucket</span>
                    <span className="text-lg font-bold text-emerald-400">
                      {formatDecimal(dashboardData.quickStats.fim.avg)}
                    </span>
                  </div>
                  <div className="h-px bg-slate-700 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Suspicious</span>
                    <span className="text-lg font-bold text-yellow-500">
                      {formatInteger(dashboardData.quickStats.fim.suspicious)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ML Preview */}
        <div className="mb-12 bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <BrainCircuit className="h-5 w-5" style={{ color: "#a78bfa" }} />
                Machine Learning Analytics
              </h2>
              <p className="text-xs text-slate-400 mt-1">Prediction confidence, anomaly trends, and model-based threat signals</p>
            </div>
            <button
              onClick={() => navigate("/ml-dashboard")}
              className="mt-3 md:mt-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2 w-fit"
            >
              <Eye className="h-4 w-4" />
              View Full
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-slate-400">ML Detection Timeline ({selectedRangeLabel})</div>
                <RangeFilter rangeKey={rangeKey} onRangeChange={setRangeKey} />
              </div>
              <WaveChart data={dashboardData.mlEvents} color="#a78bfa" height={160} rangeKey={rangeKey} />
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Model Snapshot</div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Predictions</span>
                    <span className="text-lg font-bold text-sky-400">
                      {formatInteger(dashboardData.quickStats.ml.predictions)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Anomalies</span>
                    <span className="text-lg font-bold text-orange-400">
                      {formatInteger(dashboardData.quickStats.ml.anomalies)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Confidence</span>
                    <span className="text-lg font-bold text-yellow-400">
                      {formatDecimal(dashboardData.quickStats.ml.confidence)}%
                    </span>
                  </div>
                  <div className="h-px bg-slate-700 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Top Risk</span>
                    <span className="text-lg font-bold text-red-400">
                      {dashboardData.quickStats.ml.topRisk}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
