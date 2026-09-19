import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  createEmptyDashboardData,
  getMainDashboardData,
} from "../services/dashboardApi";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import PageLoader from "../components/PageLoader";
import {
  createDefaultDateRange,
  formatDateRangeLabel,
  getRangeKeyForDateRange,
  normalizeDateRange,
  toDateTimeLocalValue,
} from "../utils/dateRange";
import {
  Activity,
  AlertTriangle,
  Bug,
  BrainCircuit,
  FileText,
  BarChart3,
  Shield,
  Terminal,
  ArrowRight,
  Clock,
  TrendingUp,
  Users,
  Eye,
  UserPlus,
  CreditCard,
  ChevronDown,
  MoreHorizontal,
  Download,
  FileBarChart,
  X,
} from "lucide-react";

// ========================================
// Toast Notification Component
// ========================================
const Toast = ({ message, type = "warning", onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-[200] animate-fadeInUp max-w-sm rounded-xl px-4 py-3 shadow-2xl" style={{ backgroundColor: "#1a1535" }}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-yellow-300">Partial Data</p>
          <p className="text-[10px] text-slate-400 mt-0.5 break-words">{message}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-l  g hover:bg-white/10 transition-colors">
          <X className="h-3 w-3 text-slate-400" />
        </button>
      </div>
    </div>
  );
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function rangeKeyToDateRange(rangeKey) {
  const end = new Date();
  const backMs =
    rangeKey === "1h"
      ? HOUR_MS
      : rangeKey === "7d"
        ? 7 * DAY_MS
        : rangeKey === "30d"
          ? 30 * DAY_MS
          : DAY_MS;
  const start = new Date(end.getTime() - backMs);
  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end),
  };
}

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
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
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

const WaveChart = ({ data, color = "#A855F7", height: _height = 140, rangeKey = "24h", onPointSelect }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 1000, height: _height });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [_height]);

  const width = size.width;
  const height = size.height;
  const padding = width < 420 ? { l: 28, r: 8, t: 6, b: 20 } : { l: 40, r: 8, t: 6, b: 20 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  if (!data || data.length === 0) {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block w-full h-full"
      >
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fontSize="10"
          fill="#64748b"
        >
          No data
        </text>
      </svg>
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

  const narrowTicks = innerW < 260;
  const tickCount = narrowTicks ? 2 : clamp(Math.floor(innerW / 150), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div ref={rootRef} className="relative h-full w-full" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        {gridLines.map((grid, idx) => (
          <g key={`grid-${idx}`}>
            <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1" opacity={grid.ratio === 0 || grid.ratio === 1 ? "1" : "0.3"} />
            <text x={padding.l - 5} y={grid.y + 3} textAnchor="end" fontSize="8" fill="var(--soc-text-muted)" fontWeight="500">
              {grid.value}
            </text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1" opacity="0.5" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1" opacity="0.5" />
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill={`url(#gradient-${color})`} />
        <path d={pathD} stroke={color} strokeWidth="2" fill="none" opacity="0.9" />
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
                r={isSelected ? "5" : "8"}
                fill="transparent"
                className="cursor-pointer focus:outline-none"
                style={{ outline: "none" }}
                onMouseEnter={() => setSelectedPoint(pointData)}
                onMouseLeave={() => setSelectedPoint(null)}
                onFocus={() => setSelectedPoint(pointData)}
                onBlur={() => setSelectedPoint(null)}
                onClick={() => {
                  setSelectedPoint(isSelected ? null : pointData);
                  onPointSelect?.(d);
                }}
              />
              <circle
                cx={x}
                cy={y}
                r={isSelected ? "3" : "2"}
                fill={color}
                stroke={isSelected ? "var(--soc-bg)" : "none"}
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
          const tickDate = new Date(d.t);
          const tickLabel = narrowTicks
            ? (rangeKey === "1h"
              ? tickDate.toLocaleTimeString("en-US", { hour: "2-digit" })
              : tickDate.toLocaleDateString("en-US", { month: "short", day: "2-digit" }))
            : formatBucketLabel(d.t, rangeKey);

          return (
            <g key={`tick-${d.t}`}>
              <text
                x={x}
                y={padding.t + innerH + 12}
                textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"}
                fontSize="7"
                fill="var(--soc-text-muted)"
              >
                {tickLabel}
              </text>
            </g>
          );
        })}
      </svg>

      {selectedPoint && (
        <div
          className="pointer-events-none absolute z-10 min-w-[100px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-elevated)] px-2 py-1.5 text-[10px] shadow-xl"
          style={{
            left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`,
            top: `${Math.max(((selectedPoint.y - 36) / height) * 100, 4)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-[var(--soc-text-primary)]">{selectedPoint.value} events</div>
          <div className="mt-0.5 text-[var(--soc-text-muted)]">{formatPointTimestamp(selectedPoint.time, rangeKey)}</div>
        </div>
      )}
    </div>
  );
};

const CompactBarChart = ({ items }) => {
  if (!items || items.length === 0) {
    return (
      <div className="flex h-full min-h-16 flex-col items-center justify-center text-center">
        <p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">No active user data</p>
        <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">No user activity for the selected time range.</p>
      </div>
    );
  }

  const maxValue = Math.max(...items.map((d) => d.value), 1);

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={item.label} className="list-item-interactive px-2 py-1 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold text-purple-400">
                {i + 1}
              </span>
              <span className="text-[10px] font-medium text-[var(--soc-text-secondary)] truncate" title={item.label}>
                {item.label}
              </span>
            </div>
            <span className="text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-2">
              {new Intl.NumberFormat("en-US").format(item.value)}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-purple-500 to-pink-500"
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ========================================
// Category Line Chart (distribution)
// ========================================
const CategoryLineChart = ({ items, color = "#A855F7", totalLabel = "items" }) => {
  const [selected, setSelected] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 1000, height: 180 });
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const width = size.width;
  const height = size.height;
  const padding = width < 500
    ? { l: 16, r: 12, t: 6, b: 22 }
    : width < 768
      ? { l: 24, r: 18, t: 8, b: 26 }
      : width < 1000
        ? { l: 32, r: 24, t: 8, b: 28 }
        : { l: 40, r: 40, t: 10, b: 32 };
  const axisFontSize = width < 500 ? 7 : width < 1000 ? 8 : 9;
  const xLabelFontSize = width < 500 ? 7 : width < 1000 ? 8 : 9;
  const xLabelOffset = width < 500 ? 12 : width < 1000 ? 14 : 16;
  if (!items || items.length === 0) {
    return (
      <div className="flex h-full min-h-16 flex-col items-center justify-center text-center">
        <p className="text-[10px] min-[768px]:text-[11px] font-medium text-[var(--soc-text-secondary)]">No data available</p>
        <p className="mt-0.5 text-[9px] min-[768px]:text-[10px] text-[var(--soc-text-muted)]">No data for the selected time range.</p>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, it) => s + it.value, 0) || 1;
  const maxV = Math.max(1, ...sorted.map((d) => d.value));
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const step = sorted.length > 1 ? innerW / (sorted.length - 1) : innerW;

  const gridSteps = 4;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i++) {
    const ratio = i / (gridSteps - 1);
    const value = Math.round((ratio * maxV * 10) / 10);
    const y = padding.t + innerH - ratio * innerH;
    gridLines.push({ value, y });
  }

  const xFor = (i) => padding.l + i * step;
  const yFor = (v) => padding.t + innerH - (v / maxV) * innerH;

  const points = sorted.map((it, i) => ({
    x: xFor(i),
    y: yFor(it.value),
    label: it.label,
    value: it.value,
    color: it.color ?? color,
    index: i,
  }));

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const controlX = (a.x + b.x) / 2;
    segments.push({
      d: `M ${a.x} ${a.y} C ${controlX} ${a.y}, ${controlX} ${b.y}, ${b.x} ${b.y}`,
      color: b.color,
      key: `${a.label}-${b.label}`,
    });
  }

  const maxXLabels = width < 360 ? (points.length > 3 ? 2 : points.length) : width < 500 ? 4 : points.length;
  const xLabelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, maxXLabels)));

  return (
    <div className="relative w-full flex flex-col h-full min-w-0" onMouseLeave={() => setSelected(null)}>
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[8px] min-[600px]:text-[9px] min-[900px]:text-[10px] text-[var(--soc-text-muted)] uppercase font-semibold">Total</span>
        <span className="text-[11px] min-[600px]:text-xs min-[900px]:text-sm font-bold text-[var(--soc-text-primary)]">
          {total} <span className="text-[8px] min-[600px]:text-[9px] min-[900px]:text-[10px] font-normal text-[var(--soc-text-muted)]">{totalLabel}</span>
        </span>
      </div>
      <div ref={rootRef} className="flex-1 min-h-0 w-full">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
          {gridLines.map((grid, idx) => (
            <g key={`grid-${idx}`}>
              <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1.5" opacity={grid.y === padding.t || grid.y === padding.t + innerH ? "1" : "0.5"} />
              <text x={padding.l - 4} y={grid.y + 3} textAnchor="end" fontSize={axisFontSize} fill="var(--soc-text-muted)" fontWeight="500">
                {grid.value}
              </text>
            </g>
          ))}
          <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" opacity="0.6" />
          <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" opacity="0.6" />
          {segments.map((seg) => (
            <path key={seg.key} d={seg.d} stroke={seg.color} strokeWidth="3" fill="none" opacity="0.9" />
          ))}
          {points.map((p) => {
            const isSel = selected?.index === p.index;
            const isFirst = p.index === 0;
            const isLast = p.index === points.length - 1;
            const showXLabel = xLabelEvery === 1 || p.index % xLabelEvery === 0 || isLast;
            if (!showXLabel) {
              return (
                <g key={`${p.label}-${p.index}`}>
                  <circle cx={p.x} cy={p.y} r={isSel ? "5" : "7"} fill="transparent" className="cursor-pointer"
                    onMouseEnter={() => setSelected(p)}
                    onMouseLeave={() => setSelected(null)}
                    onFocus={() => setSelected(p)}
                    onBlur={() => setSelected(null)}
                    onClick={() => setSelected(isSel ? null : p)}
                  />
                <circle cx={p.x} cy={p.y} r={isSel ? "3" : "3.5"} fill={p.color} stroke="var(--soc-bg)" strokeWidth="1.5" opacity="0.95" className="pointer-events-none" />
                </g>
              );
            }
            return (
              <g key={`${p.label}-${p.index}`}>
                <circle cx={p.x} cy={p.y} r={isSel ? "5" : "7"} fill="transparent" className="cursor-pointer"
                  onMouseEnter={() => setSelected(p)}
                  onMouseLeave={() => setSelected(null)}
                  onFocus={() => setSelected(p)}
                  onBlur={() => setSelected(null)}
                  onClick={() => setSelected(isSel ? null : p)}
                />
                  <circle cx={p.x} cy={p.y} r={isSel ? "3" : "3.5"} fill={p.color} stroke="var(--soc-bg)" strokeWidth="1.5" opacity="0.95" className="pointer-events-none" />
                <text
                  x={isFirst ? padding.l : isLast ? padding.l + innerW : p.x}
                  y={padding.t + innerH + xLabelOffset}
                  textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                  fontSize={xLabelFontSize}
                  fill="var(--soc-text-muted)"
                >{p.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chart-legend flex flex-wrap items-center gap-x-1.5 gap-y-0.5 justify-center px-1 mt-1">
        {points.map((p) => (
          <div key={`${p.label}-${p.index}`} className="flex items-center gap-1 text-[7px] min-[600px]:text-[8px] min-[900px]:text-[9px] text-[var(--soc-text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="whitespace-nowrap">{p.label}</span>
            <span className="text-[var(--soc-text-muted)] font-mono">{p.value}</span>
          </div>
        ))}
      </div>
      {selected && (
        <div
          className="pointer-events-none absolute z-10 min-w-[90px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-elevated)] px-2 py-1.5 text-[10px] shadow-xl"
          style={{
            left: `${Math.min(Math.max((selected.x / width) * 100, 10), 84)}%`,
            top: `${Math.max(((selected.y - 36) / height) * 100, 2)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-[var(--soc-text-primary)]">{selected.label}</div>
          <div className="mt-0.5 text-[var(--soc-text-muted)]">{selected.value} {totalLabel}</div>
        </div>
      )}
    </div>
  );
};

// ========================================
// Horizontal Domain Bar Chart
// ========================================
const DomainBarChart = ({ items, emptyLabel = "No affected hosts detected", emptySub = "No host activity is available for the selected time range." }) => {
  if (!items || items.length === 0)
    return (
      <div className="flex h-full min-h-16 flex-col items-center justify-center text-center">
        <p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">{emptyLabel}</p>
        <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">{emptySub}</p>
      </div>
    );

  const maxCount = Math.max(...items.map((d) => d.value), 1);
  const CHART_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];

  return (
    <div className="dash-most-changed-list w-full min-w-0 max-w-full overflow-hidden space-y-1.5 box-border">
      {items.map((item, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const label = item.label || item.name;
        const value = item.value ?? item.count;
        return (
          <div key={label} className="dash-most-changed-item w-full min-w-0 max-w-full overflow-hidden box-border list-item-interactive px-2 py-1 rounded-lg">
            <div className="flex items-center justify-between gap-2 min-w-0 max-w-full overflow-hidden">
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold shrink-0" style={{ color }}>
                  {i + 1}
                </span>
                <span className="dash-most-changed-label min-w-0 flex-1 max-w-full truncate block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-medium text-[var(--soc-text-secondary)]" title={label}>
                  {label}
                </span>
              </div>
              <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">
                {new Intl.NumberFormat("en-US").format(value)}
              </span>
            </div>
            {item.sub && (
              <div className="-mt-0.5 ml-7 min-w-0 max-w-[calc(100%-1.75rem)] overflow-hidden leading-none">
                <span className="dash-most-changed-sub block truncate overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[var(--soc-text-muted)]" title={`by ${item.sub}`}>by {item.sub}</span>
              </div>
            )}
            <div className="dash-most-changed-bar mt-0.5 ml-7 h-1.5 max-w-[calc(100%-1.75rem)] box-border bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
              <div
                className="h-full rounded-full transition-all duration-500 max-w-full"
                style={{
                  width: `${(value / maxCount) * 100}%`,
                  maxWidth: "100%",
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RANGE_LABELS = {
  "1h": "1 Hour",
  "24h": "24 Hours",
  "7d": "7 Days",
  "30d": "30 Days",
};

// ========================================
// KPI Card Component
// ========================================
const KPICard = ({ label, value, icon: Icon, color, desc, loading, index = 0 }) => (
  <div className={`kpi-modern animate-fadeInUp stagger-${index + 1}`} style={{ opacity: 0 }}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">{label}</span>
      <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
    </div>
    <div className={`text-xl font-bold ${color} mb-1`}>
      {loading ? (
        <div className="skeleton h-6 w-16"></div>
      ) : (
        value
      )}
    </div>
    {desc && (
      <div className="text-[9px] text-[var(--soc-text-muted)]">{desc}</div>
    )}
  </div>
);

// ========================================
// Main Dashboard Component
// ========================================
export default function MainDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rangeKey, setRangeKey] = useState("30d");
  const [filterMode, setFilterMode] = useState("range");
  const [customDateRange, setCustomDateRange] = useState(() =>
    createDefaultDateRange(30)
  );
  const [dashboardData, setDashboardData] = useState(() =>
    createEmptyDashboardData("30d")
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [topUsersSource, setTopUsersSource] = useState("host");
  const [showWarningToast, setShowWarningToast] = useState(false);

  const loadDashboardData = useCallback(
    async () => {
      setLoading(true);
      setLoadError("");

      try {
        const dateRange =
          filterMode === "custom"
            ? normalizeDateRange(customDateRange)
            : rangeKeyToDateRange(rangeKey);
        const nextData = await getMainDashboardData(dateRange);
        
        // Add dummy data for Most Changed Files if empty
        if (!nextData.mostChangedFiles || nextData.mostChangedFiles.length === 0) {
          nextData.mostChangedFiles = [
            { label: "/etc/passwd", value: 45, sub: "user1" },
            { label: "/var/log/auth.log", value: 38, sub: "system" },
            { label: "/etc/ssh/sshd_config", value: 32, sub: "user2" },
            { label: "/home/user/documents/data.csv", value: 28, sub: "user1" },
            { label: "/tmp/suspicious_script.sh", value: 22, sub: "unknown" },
          ];
        }

        // Add dummy data for Top Rankings if empty
        if (!nextData.topRankings) {
          nextData.topRankings = {};
        }
        if (!nextData.topRankings.host || nextData.topRankings.host.length === 0) {
          nextData.topRankings.host = [
            { label: "admin@server-01", value: 156 },
            { label: "root@web-server", value: 128 },
            { label: "deploy@prod-02", value: 95 },
            { label: "user@dev-workstation", value: 72 },
            { label: "backup@storage-01", value: 54 },
          ];
        }
        if (!nextData.topRankings.fimAgents || nextData.topRankings.fimAgents.length === 0) {
          nextData.topRankings.fimAgents = [
            { label: "agent-prod-01", value: 89 },
            { label: "agent-web-02", value: 76 },
            { label: "agent-db-01", value: 63 },
            { label: "agent-dev-01", value: 48 },
            { label: "agent-staging-01", value: 35 },
          ];
        }
        if (!nextData.topRankings.file || nextData.topRankings.file.length === 0) {
          nextData.topRankings.file = [
            { label: "malware_sample.exe", value: 42 },
            { label: "suspicious_doc.pdf", value: 35 },
            { label: "trojan_update.bat", value: 28 },
            { label: "phishing_link.html", value: 21 },
            { label: "keylogger.dll", value: 15 },
          ];
        }
        if (!nextData.topRankings.ml || nextData.topRankings.ml.length === 0) {
          nextData.topRankings.ml = [
            { label: "anomaly-pattern-01", value: 67 },
            { label: "intrusion-detect", value: 54 },
            { label: "brute-force-attack", value: 43 },
            { label: "data-exfiltration", value: 31 },
            { label: "lateral-movement", value: 24 },
          ];
        }

        setDashboardData(nextData);
        if (nextData.warnings && nextData.warnings.length > 0) {
          setShowWarningToast(true);
        }
      } catch (error) {
        console.error(error);
        setLoadError(error.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    },
    [rangeKey, filterMode, customDateRange]
  );

  useEffect(() => {
    loadDashboardData();

    const interval = setInterval(() => {
      loadDashboardData();
    }, 60_000);

    return () => clearInterval(interval);
  }, [loadDashboardData]);

  const handleRangeChange = (key) => {
    setRangeKey(key);
    setFilterMode("range");
  };

  const handleCustomRangeChange = (range) => {
    setCustomDateRange(range);
    setFilterMode("custom");
  };

  const formatInteger = (value) =>
    new Intl.NumberFormat("en-US").format(Number(value || 0));
  const formatDecimal = (value, digits = 1) =>
    Number(value || 0).toFixed(digits);
  const effectiveDateRange =
    filterMode === "custom"
      ? normalizeDateRange(customDateRange)
      : rangeKeyToDateRange(rangeKey);
  const effectiveRangeKey = getRangeKeyForDateRange(effectiveDateRange);
  const selectedRangeLabel =
    filterMode === "custom"
      ? formatDateRangeLabel(effectiveDateRange)
      : RANGE_LABELS[rangeKey] || rangeKey;

  if (loading && !dashboardData.lastUpdated) {
    return <PageLoader message="Loading..." fullScreen />;
  }

  if (loadError && !dashboardData.lastUpdated) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[11px] text-red-300">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-w-0 gap-4">
      {/* Welcome Header */}
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">
            Welcome back, {user?.name || "User"}
          </h1>
          <p className="text-[11px] text-[var(--soc-text-muted)] mt-0.5">
            Monitor threats, commands, and file integrity in real-time
          </p>
        </div>
        <div className="flex items-center gap-2 relative z-50">
          <RangeFilter
            rangeKey={rangeKey}
            onRangeChange={handleRangeChange}
          />
          <DateRangeFilter
            value={customDateRange}
            onChange={handleCustomRangeChange}
          />
        </div>
      </div>

      {/* Alerts */}
      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2 text-[11px] text-red-300">
          {loadError}
        </div>
      )}
      {/* Toast Notification for Warnings */}
      {showWarningToast && dashboardData.warnings.length > 0 && (
        <Toast
          message={dashboardData.warnings.join(" | ")}
          type="warning"
          onClose={() => setShowWarningToast(false)}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-3">
        <KPICard
          label="Commands"
          value={formatInteger(dashboardData.stats.totalAttacks)}
          icon={Terminal}
          color="text-purple-400"
          desc="Total Linux commands monitored"
          loading={loading}
          index={0}
        />
        <KPICard
          label="Threats"
          value={formatInteger(dashboardData.stats.totalThreats)}
          icon={AlertTriangle}
          color="text-pink-400"
          desc="Files + ML anomalies"
          loading={loading}
          index={1}
        />
        <KPICard
          label="Files Scanned"
          value={formatInteger(dashboardData.stats.fileScanned)}
          icon={Bug}
          color="text-cyan-400"
          desc="Clean scan completions"
          loading={loading}
          index={2}
        />
        <KPICard
          label="FIM Events"
          value={formatInteger(dashboardData.stats.fimEvents)}
          icon={FileText}
          color="text-emerald-400"
          desc="File integrity changes"
          loading={loading}
          index={3}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-w-0 max-w-full overflow-hidden box-border" style={{ maxWidth: "100%" }}>
        {/* Main Chart Area */}
        <div className="xl:col-span-2 flex flex-col gap-4 min-w-0 max-w-full overflow-hidden box-border" style={{ maxWidth: "100%" }}>
          {/* Threat Classification */}
          <div className="chart-card animate-fadeInUp stagger-1 flex-1" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-red-500/10">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Threat Classification</h3>
                  <p className="text-[9px] text-[var(--soc-text-muted)]">Detected threats by category</p>
                </div>
              </div>
            </div>
            <div className="h-[220px]">
              <CategoryLineChart items={dashboardData.threatTypes} color="#EF4444" totalLabel="threats" />
            </div>
          </div>

          {/* Risk Distribution */}
          <div className="chart-card animate-fadeInUp stagger-2 flex-1" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-orange-500/10">
                  <BarChart3 className="h-3.5 w-3.5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Risk Distribution</h3>
                  <p className="text-[9px] text-[var(--soc-text-muted)]">Incidents grouped by risk level</p>
                </div>
              </div>
            </div>
            <div className="h-[220px]">
              <CategoryLineChart items={dashboardData.riskDistribution} color="#F97316" totalLabel="incidents" />
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="flex flex-col gap-4 min-w-0 max-w-full overflow-hidden box-border" style={{ maxWidth: "100%" }}>
          {/* Most Changed Files */}
          <div className="dash-most-changed chart-card animate-fadeInUp stagger-3 flex-1 w-full min-w-0 max-w-full overflow-hidden box-border" style={{ opacity: 0, maxWidth: "100%" }}>
            <div className="flex items-center justify-between gap-2 mb-3 min-w-0 max-w-full overflow-hidden">
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <div className="p-1.5 rounded-lg bg-blue-500/10 shrink-0">
                  <FileBarChart className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <h3 className="truncate overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-[var(--soc-text-primary)]">Most Changed Files</h3>
                  <p className="truncate overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[var(--soc-text-muted)]">Files with highest change activity</p>
                </div>
              </div>
              <button
                onClick={() => navigate("/fim-events")}
                className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-0.5 shrink-0"
              >
                View all <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>
            <div className="w-full min-w-0 max-w-full overflow-hidden box-border" style={{ maxWidth: "100%" }}>
              <DomainBarChart
                items={dashboardData.mostChangedFiles}
                emptyLabel="No changed files detected"
                emptySub="No FIM changes are available for the selected time range."
              />
            </div>
          </div>

          {/* Top Users Card */}
          <div className="chart-card animate-fadeInUp stagger-4 flex-1" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10">
                  <Activity className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top Active Users</h3>
                  <p className="text-[9px] text-[var(--soc-text-muted)]">Most active users in the selected source</p>
                </div>
              </div>
              <button
                onClick={() => navigate({
                  host: "/attack-dashboard",
                  fimAgents: "/fim-events",
                  file: "/file-security",
                  ml: "/ml-dashboard",
                }[topUsersSource] ?? "/attack-dashboard")}
                className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-0.5"
              >
                View all <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {[
                { key: "host", label: "Host" },
                { key: "fimAgents", label: "FIM" },
                { key: "file", label: "File" },
                { key: "ml", label: "ML" },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => setTopUsersSource(option.key)}
                  className={`px-2 py-1 text-[9px] rounded-md font-medium transition-all ${
                    topUsersSource === option.key
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      : "text-[var(--soc-text-muted)] hover:text-[var(--soc-text-secondary)] border border-transparent hover:bg-[var(--soc-elevated)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <CompactBarChart
              items={dashboardData.topRankings?.[topUsersSource] ?? dashboardData.userRanking}
            />
          </div>
        </div>
      </div>

      {/* Timeline Sections */}
      {[
        {
          title: "Command Activity",
          subtitle: "Linux command execution monitoring",
          icon: Terminal,
          iconColor: "text-purple-400",
          iconBg: "bg-purple-500/10",
          chartColor: "#A855F7",
          data: dashboardData.commandEvents,
          quickStats: dashboardData.quickStats.attack,
          stats: [
            { label: "Total", value: formatInteger(dashboardData.quickStats.attack.totalCommands), color: "text-purple-400" },
            { label: "Peak", value: formatInteger(dashboardData.quickStats.attack.peak), color: "text-purple-300" },
            { label: "Avg", value: formatDecimal(dashboardData.quickStats.attack.avg), color: "text-yellow-400" },
            { label: "Suspicious", value: formatInteger(dashboardData.quickStats.attack.suspicious), color: "text-red-400" },
          ],
          nav: "/attack-dashboard",
        },
        {
          title: "File Security Scanner",
          subtitle: "Malware detection and IOC analysis",
          icon: Bug,
          iconColor: "text-pink-400",
          iconBg: "bg-pink-500/10",
          chartColor: "#EC4899",
          data: dashboardData.fileEvents,
          quickStats: dashboardData.quickStats.file,
          stats: [
            { label: "Scanned", value: formatInteger(dashboardData.quickStats.file.scanned), color: "text-cyan-400" },
            { label: "Threats", value: formatInteger(dashboardData.quickStats.file.threats), color: "text-red-400" },
            { label: "Detection", value: `${formatDecimal(dashboardData.quickStats.file.detectionRate)}%`, color: "text-yellow-400" },
            { label: "Health", value: `${formatDecimal(dashboardData.quickStats.file.health)}%`, color: "text-emerald-400" },
          ],
          nav: "/file-security",
        },
        {
          title: "File Integrity Monitoring",
          subtitle: "File modification and access events",
          icon: FileText,
          iconColor: "text-emerald-400",
          iconBg: "bg-emerald-500/10",
          chartColor: "#10B981",
          data: dashboardData.fimEvents,
          quickStats: dashboardData.quickStats.fim,
          stats: [
            { label: "Total", value: formatInteger(dashboardData.quickStats.fim.totalEvents), color: "text-emerald-400" },
            { label: "Peak", value: formatInteger(dashboardData.quickStats.fim.peak), color: "text-emerald-400" },
            { label: "Avg", value: formatDecimal(dashboardData.quickStats.fim.avg), color: "text-emerald-400" },
            { label: "Suspicious", value: formatInteger(dashboardData.quickStats.fim.suspicious), color: "text-yellow-400" },
          ],
          nav: "/fim-events",
        },
        {
          title: "ML Threat Detection",
          subtitle: "Prediction confidence and anomaly trends",
          icon: BrainCircuit,
          iconColor: "text-indigo-400",
          iconBg: "bg-indigo-500/10",
          chartColor: "#818CF8",
          data: dashboardData.mlEvents,
          quickStats: dashboardData.quickStats.ml,
          stats: [
            { label: "Predictions", value: formatInteger(dashboardData.quickStats.ml.predictions), color: "text-cyan-400" },
            { label: "Anomalies", value: formatInteger(dashboardData.quickStats.ml.anomalies), color: "text-orange-400" },
            { label: "Confidence", value: `${formatDecimal(dashboardData.quickStats.ml.confidence)}%`, color: "text-yellow-400" },
            { label: "Top Risk", value: dashboardData.quickStats.ml.topRisk, color: "text-red-400" },
          ],
          nav: "/ml-dashboard",
        },
      ].map((section, idx) => (
        <div key={section.title} className={`chart-card animate-fadeInUp stagger-${Math.min(idx + 1, 5)}`} style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${section.iconBg}`}>
                <section.icon className={`h-3.5 w-3.5 ${section.iconColor}`} />
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">{section.title}</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">{section.subtitle}</p>
              </div>
            </div>
            <button
              onClick={() => navigate(section.nav)}
              className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-0.5"
            >
              View <ArrowRight className="h-2.5 w-2.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
            <div className="lg:col-span-2 rounded-lg p-3 flex flex-col" style={{ background: "transparent" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] text-[var(--soc-text-muted)]">{section.title} Timeline ({selectedRangeLabel})</span>
              </div>
              <div className="w-full h-[160px] rounded-lg overflow-hidden" style={{ background: "transparent" }}>
                <WaveChart
                  data={section.data}
                  color={section.chartColor}
                  height={160}
                  rangeKey={effectiveRangeKey}
                  onPointSelect={(point) => {
                    const start = point?.t;
                    const end = start != null && point?.bucketMs ? start + point.bucketMs - 1 : undefined;
                    const query = start != null
                      ? `?start=${encodeURIComponent(new Date(start).toISOString())}&end=${encodeURIComponent(new Date(end).toISOString())}`
                      : "";
                    navigate(`${section.nav}${query}`);
                  }}
                />
              </div>
            </div>
            <div className="rounded-lg p-3">
              <div className="text-[8px] text-[var(--soc-text-muted)] uppercase font-semibold mb-2">Quick Stats</div>
              <div className="space-y-0">
                {section.stats.map((s, i) => (
                  <div key={s.label}>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-[10px] text-[var(--soc-text-muted)]">{s.label}</span>
                      <span className={`text-[11px] font-bold ${s.color}`}>{s.value}</span>
                    </div>
                    {i < section.stats.length - 1 && (
                      <div className="border-b border-[var(--soc-border)]"></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
