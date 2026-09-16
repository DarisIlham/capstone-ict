import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";

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

const WaveChart = ({ data, color = "#38bdf8", height: _height = 180, rangeKey = "24h", onPointSelect }) => {
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
  // Narrow plots: shrink the y-axis gutter (labels are only 1–3 digits).
  const padding = width < 420 ? { l: 30, r: 10, t: 8, b: 24 } : { l: 56, r: 10, t: 8, b: 24 };
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
          fontSize="12"
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

  // Narrow plots: fewer ticks + short labels so nothing collides.
  // Full timestamps stay available in the hover tooltip.
  const narrowTicks = innerW < 260;
  const tickCount = narrowTicks ? 2 : clamp(Math.floor(innerW / 150), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div ref={rootRef} className="relative h-full w-full" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        {gridLines.map((grid, idx) => (
          <g key={`grid-${idx}`}>
            <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1" opacity={grid.ratio === 0 || grid.ratio === 1 ? "1" : "0.5"} />
            <text x={padding.l - 5} y={grid.y + 4} textAnchor="end" fontSize="10" fill="var(--soc-text-muted)" fontWeight="600">
              {grid.value}
            </text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />
        <path d={pathD} stroke={color} strokeWidth="2.5" fill="none" opacity="0.8" />
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
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
                r="3.5"
                fill={color}
                stroke={isSelected ? "#0f172a" : "none"}
                strokeWidth="2.5"
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
              <line
                x1={x}
                y1={padding.t + innerH}
                x2={x}
                y2={padding.t + innerH + 4}
                stroke="var(--soc-border)"
              />
              <text
                x={x}
                y={padding.t + innerH + 16}
                textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"}
                fontSize="9"
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
          className="pointer-events-none absolute z-10 min-w-[120px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-xl"
          style={{
            left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`,
            top: `${Math.max(((selectedPoint.y - 48) / height) * 100, 4)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-[var(--soc-text-primary)]">{selectedPoint.value} events</div>
          <div className="mt-1 text-[var(--soc-text-muted)]">{formatPointTimestamp(selectedPoint.time, rangeKey)}</div>
        </div>
      )}
    </div>
  );
};

const CompactBarChart = ({ items }) => {
  if (!items || items.length === 0) {
    return (
      <div className="flex h-full min-h-24 flex-col items-center justify-center text-center">
        <p className="text-[11px] font-medium text-[var(--soc-text-secondary)]">No active user data</p>
        <p className="mt-0.5 text-[10px] text-[var(--soc-text-muted)]">No user activity for the selected time range.</p>
      </div>
    );
  }

  const maxValue = Math.max(...items.map((d) => d.value), 1);

  return (
    <div className="space-y-1.5 min-[500px]:space-y-2">
      {items.map((item, i) => (
        <div key={item.label} className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 min-[900px]:w-4 text-[9px] min-[600px]:text-[10px] min-[1000px]:text-[11px] font-bold text-slate-500 shrink-0">
              {i + 1}.
            </span>
            <span className="flex-1 min-w-0 text-[9px] min-[600px]:text-[10px] min-[1000px]:text-[11px] min-[1200px]:text-[12px] font-mono text-slate-400 truncate" title={item.label}>
              {item.label}
            </span>
            <span className="text-[9px] min-[600px]:text-[10px] min-[1000px]:text-[11px] min-[1200px]:text-[12px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
              {new Intl.NumberFormat("en-US").format(item.value)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-3.5 min-[900px]:w-4 shrink-0" />
            <div
              className="flex-1 bg-[var(--soc-bg)] rounded h-2 min-[1200px]:h-2.5 min-[1440px]:h-3 overflow-hidden"
              title={`${item.label}: ${item.value} events`}
            >
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: item.color,
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
// Category Line Chart (distribution)
// ========================================
const CategoryLineChart = ({ items, color = "#38bdf8", totalLabel = "items" }) => {
  const [selected, setSelected] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 1000, height: 210 });
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
    ? { l: 20, r: 16, t: 8, b: 28 }
    : width < 768
      ? { l: 32, r: 24, t: 10, b: 32 }
      : width < 1000
        ? { l: 44, r: 36, t: 10, b: 36 }
        : { l: 56, r: 56, t: 12, b: 42 };
  const axisFontSize = width < 500 ? 8 : width < 1000 ? 9 : 10;
  const xLabelFontSize = width < 500 ? 8 : width < 1000 ? 9 : 10;
  const xLabelOffset = width < 500 ? 14 : width < 1000 ? 16 : 18;
  if (!items || items.length === 0) {
    return (
      <div className="flex h-full min-h-24 flex-col items-center justify-center text-center">
        <p className="text-xs min-[768px]:text-sm font-medium text-[var(--soc-text-secondary)]">No data available</p>
        <p className="mt-0.5 text-[10px] min-[768px]:text-xs text-[var(--soc-text-muted)]">No data for the selected time range.</p>
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

  // Label density follows plot width: many categories keep every label on
  // wide plots, but stride (always keeping first + last) when narrow.
  const maxXLabels = width < 360 ? (points.length > 3 ? 2 : points.length) : width < 500 ? 4 : points.length;
  const xLabelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, maxXLabels)));

  return (
    <div className="relative w-full flex flex-col h-full min-w-0" onMouseLeave={() => setSelected(null)}>
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[9px] min-[600px]:text-[10px] min-[900px]:text-[11px] text-slate-600 uppercase font-semibold">Total</span>
        <span className="text-xs min-[600px]:text-[13px] min-[900px]:text-sm font-bold text-slate-300">
          {total} <span className="text-[9px] min-[600px]:text-[10px] min-[900px]:text-xs font-normal text-slate-500">{totalLabel}</span>
        </span>
      </div>
      <div ref={rootRef} className="flex-1 min-h-0 w-full">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
          {gridLines.map((grid, idx) => (
            <g key={`grid-${idx}`}>
              <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1" opacity={grid.y === padding.t || grid.y === padding.t + innerH ? "1" : "0.5"} />
              <text x={padding.l - 5} y={grid.y + 3} textAnchor="end" fontSize={axisFontSize} fill="var(--soc-text-muted)" fontWeight="600">
                {grid.value}
              </text>
            </g>
          ))}
          <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />
          <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />
          {segments.map((seg) => (
            <path key={seg.key} d={seg.d} stroke={seg.color} strokeWidth="2.5" fill="none" opacity="0.85" />
          ))}
          {points.map((p) => {
            const isSel = selected?.index === p.index;
            const isFirst = p.index === 0;
            const isLast = p.index === points.length - 1;
            // Narrow plots: stride labels (first + last always kept) and pin
            // edge labels inside the plot so long names never clip/collide.
            // Hidden values stay visible in the legend and tooltip.
            const showXLabel = xLabelEvery === 1 || p.index % xLabelEvery === 0 || isLast;
            if (!showXLabel) {
              return (
                <g key={`${p.label}-${p.index}`}>
                  <circle cx={p.x} cy={p.y} r={isSel ? "6" : "9"} fill="transparent" className="cursor-pointer"
                    onMouseEnter={() => setSelected(p)}
                    onMouseLeave={() => setSelected(null)}
                    onFocus={() => setSelected(p)}
                    onBlur={() => setSelected(null)}
                    onClick={() => setSelected(isSel ? null : p)}
                  />
                  <circle cx={p.x} cy={p.y} r={isSel ? "5" : "3.5"} fill={p.color} stroke="var(--soc-bg)" strokeWidth="1.5" opacity="0.95" className="pointer-events-none" />
                </g>
              );
            }
            return (
              <g key={`${p.label}-${p.index}`}>
                <circle cx={p.x} cy={p.y} r={isSel ? "6" : "9"} fill="transparent" className="cursor-pointer"
                  onMouseEnter={() => setSelected(p)}
                  onMouseLeave={() => setSelected(null)}
                  onFocus={() => setSelected(p)}
                  onBlur={() => setSelected(null)}
                  onClick={() => setSelected(isSel ? null : p)}
                />
                <circle cx={p.x} cy={p.y} r={isSel ? "5" : "3.5"} fill={p.color} stroke="var(--soc-bg)" strokeWidth="1.5" opacity="0.95" className="pointer-events-none" />
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
      <div className="chart-legend flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-[600px]:gap-x-2 min-[900px]:gap-y-1 min-[1200px]:gap-x-2.5 justify-center px-1 mt-1.5 min-[900px]:mt-2">
        {points.map((p) => (
          <div key={`${p.label}-${p.index}`} className="flex items-center gap-1 text-[8px] min-[600px]:text-[9px] min-[900px]:text-[10px] min-[1200px]:gap-1.5 min-[1200px]:text-[11px] text-slate-400">
            <span className="w-1.5 h-1.5 min-[1200px]:w-2 min-[1200px]:h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="whitespace-nowrap">{p.label}</span>
            <span className="text-slate-500 font-mono">{p.value}</span>
          </div>
        ))}
      </div>
      {selected && (
        <div
          className="pointer-events-none absolute z-10 min-w-[110px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-xl"
          style={{
            left: `${Math.min(Math.max((selected.x / width) * 100, 10), 84)}%`,
            top: `${Math.max(((selected.y - 46) / height) * 100, 2)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-[var(--soc-text-primary)]">{selected.label}</div>
          <div className="mt-1 text-[var(--soc-text-muted)]">{selected.value} {totalLabel}</div>
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
      <div className="flex h-full min-h-24 flex-col items-center justify-center text-center">
        <p className="text-[11px] font-medium text-[var(--soc-text-secondary)]">{emptyLabel}</p>
        <p className="mt-0.5 text-[10px] text-[var(--soc-text-muted)]">{emptySub}</p>
      </div>
    );

  const maxCount = Math.max(...items.map((d) => d.value), 1);
  const CHART_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6"];

  return (
    <div className="w-full min-w-0 max-w-full space-y-1.5 min-[600px]:space-y-2">
      {items.map((item, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const label = item.label || item.name;
        const value = item.value ?? item.count;
        return (
          <div key={label} className="w-full min-w-0 max-w-full">
            <div className="grid w-full min-w-0 max-w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-1">
              <span className="w-3.5 min-[900px]:w-4 text-[9px] min-[600px]:text-[10px] min-[1000px]:text-[11px] font-bold text-slate-500 shrink-0">
                {i + 1}.
              </span>
              <span className="min-w-0 max-w-full truncate text-[9px] min-[600px]:text-[10px] min-[1000px]:text-[11px] min-[1200px]:text-[12px] font-mono font-medium text-slate-400" title={label}>
                {label}
              </span>
              <span className="min-w-[1.75rem] min-[900px]:min-w-[2rem] shrink-0 text-right text-[9px] min-[600px]:text-[10px] min-[1000px]:text-[11px] min-[1200px]:text-[12px] font-semibold text-slate-400 tabular-nums">
                {new Intl.NumberFormat("en-US").format(value)}
              </span>
            </div>
            {item.sub && (
              <div className="mt-0.5 grid w-full min-w-0 max-w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-1">
                <span className="w-3.5 min-[900px]:w-4 shrink-0" />
                <span className="min-w-0 max-w-full truncate text-[8px] min-[600px]:text-[9px] min-[1000px]:text-[10px] text-slate-500" title={`by ${item.sub}`}>by {item.sub}</span>
              </div>
            )}
            <div className="mt-1 grid w-full min-w-0 max-w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-1">
              <span className="w-3.5 min-[900px]:w-4 shrink-0" />
              <div
                className="w-full min-w-0 max-w-full overflow-hidden rounded bg-[var(--soc-bg)] h-1.5 min-[600px]:h-2 min-[1200px]:h-2.5"
                title={`${label}: ${value} events`}
              >
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(value / maxCount) * 100}%`,
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
        setDashboardData(nextData);
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
    return <PageLoader message="Loading dashboard..." />;
  }

  if (loadError && !dashboardData.lastUpdated) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="max-w-md rounded-lg border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-300">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page soc-page-shell flex flex-col w-full min-w-0">
      {/* Page Header */}
      <div className="soc-dashboard-header">
        <div className="soc-page-title-group">
          <h1 className="dashboard-page-title text-[16px] min-[600px]:text-[17px] min-[1000px]:text-[18px] min-[1440px]:text-[20px] font-bold text-[var(--soc-text-primary)] flex items-center gap-1 min-[600px]:gap-1.5 min-[1000px]:gap-2">
            <Shield className="h-3.5 w-3.5 min-[600px]:h-4 min-[600px]:w-4 min-[1200px]:h-4.5 min-[1200px]:w-4.5 text-sky-400" />
            Security Operations Dashboard
          </h1>
          <p className="dashboard-page-subtitle text-[8px] min-[600px]:text-[9px] min-[1000px]:text-[10px] text-slate-500 mt-0.5">
            Real-time monitoring &amp; threat detection
          </p>
        </div>
        <div className="soc-filter-toolbar dashboard-filter-toolbar flex flex-row items-center flex-nowrap gap-2 min-[700px]:gap-2.5 min-[900px]:gap-3 min-[1200px]:gap-3.5">
          <RangeFilter
            rangeKey={rangeKey}
            onRangeChange={handleRangeChange}
            dimmed={filterMode === "custom"}
            className="dashboard-range-filter"
          />
          <DateRangeFilter
            value={customDateRange}
            onChange={handleCustomRangeChange}
            className={`dashboard-date-filter ${filterMode === "range" ? "opacity-50" : ""}`}
          />
          {dashboardData.lastUpdated && (
            <span
              title={`Updated ${new Date(dashboardData.lastUpdated).toLocaleString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}`}
              className="dashboard-current-time shrink-0 text-[8px] min-[500px]:text-[8.5px] min-[700px]:text-[9px] min-[900px]:text-[9.5px] min-[1200px]:text-[11px] text-slate-600 flex items-center gap-1"
            >
              <Clock className="h-2.5 w-2.5 min-[900px]:h-3 min-[900px]:w-3" />
              <span className="hidden min-[770px]:inline">
                {`${new Date(dashboardData.lastUpdated).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}, ${new Date(dashboardData.lastUpdated).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`}
              </span>
              <span className="hidden min-[700px]:inline min-[770px]:hidden">
                {`${new Date(dashboardData.lastUpdated).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}, ${new Date(dashboardData.lastUpdated).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}`}
              </span>
              <span className="hidden min-[500px]:inline min-[700px]:hidden">
                {`${new Date(dashboardData.lastUpdated).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}, ${new Date(dashboardData.lastUpdated).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}`}
              </span>
              <span className="inline min-[500px]:hidden">
                {`${new Date(dashboardData.lastUpdated).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}, ${new Date(dashboardData.lastUpdated).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}`}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Alerts */}
      {loadError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-xs text-red-300">
          {loadError}
        </div>
      )}
      {dashboardData.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-2.5 text-xs text-yellow-300">
          Partial data: {dashboardData.warnings.join(" | ")}
        </div>
      )}

      {/* Security Posture Summary - Compact Metric Row */}
      <div className="dashboard-kpi-grid soc-kpi-grid">
        {[
          { label: "Commands", value: formatInteger(dashboardData.stats.totalAttacks), icon: Terminal, color: "text-sky-400", desc: "Total Linux commands monitored" },
          { label: "Threats", value: formatInteger(dashboardData.stats.totalThreats), icon: AlertTriangle, color: "text-red-400", desc: "Files + ML anomalies" },
          { label: "Files Scanned", value: formatInteger(dashboardData.stats.fileScanned), icon: Bug, color: "text-sky-400", desc: "Clean scan completions" },
          { label: "FIM Events", value: formatInteger(dashboardData.stats.fimEvents), icon: FileText, color: "text-emerald-400", desc: "File integrity changes" },
        ].map((m) => (
          <div key={m.label} className="min-w-0 bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-2.5 sm:p-3 lg:p-4 group hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{m.label}</span>
              <m.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${m.color} opacity-50`} />
            </div>
            <div className={`text-base sm:text-lg font-black ${m.color}`}>
              {loading ? "..." : m.value}
            </div>
            <div className="hidden sm:block text-[9px] sm:text-[10px] text-slate-600 mt-0.5">{m.desc}</div>
          </div>
        ))}
      </div>

      {/* Analytics Grid */}
      <div className="dashboard-analytics-grid grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 sm:gap-4 items-stretch">
        {/* Top Users */}
        <div className="min-w-0 bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-2.5 sm:p-3 lg:p-4 flex flex-col h-full">
          <div className="mb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-[600px]:gap-1.5 min-[1200px]:gap-2">
                <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-400" />
                <span className="text-[11px] sm:text-xs font-semibold text-slate-300">Top Active Users</span>
              </div>
              <button
                onClick={() => navigate({
                  host: "/attack-dashboard",
                  fimAgents: "/fim-events",
                  file: "/file-security",
                  ml: "/ml-dashboard",
                }[topUsersSource] ?? "/attack-dashboard")}
                className="text-[10px] sm:text-[11px] text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] text-slate-500">Most active users in the selected source</div>
          </div>
          <div className="flex flex-wrap items-center gap-1 mb-2 sm:mb-3">
            {[
              { key: "host", label: "Host" },
              { key: "fimAgents", label: "FIM" },
              { key: "file", label: "File" },
              { key: "ml", label: "ML" },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => setTopUsersSource(option.key)}
                className={`px-1.5 py-1 text-[9px] sm:text-[10px] sm:px-2 sm:py-1.5 sm:text-[11px] rounded-md font-medium transition-colors ${topUsersSource === option.key
                  ? "bg-sky-600/20 text-sky-400 border border-sky-600/30"
                  : "text-slate-500 hover:text-slate-300 border border-transparent"
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 min-h-24 flex-col">
            <CompactBarChart
              items={dashboardData.topRankings?.[topUsersSource] ?? dashboardData.userRanking}
            />
          </div>
        </div>

        {/* Risk Distribution */}
        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-2.5 sm:p-3 lg:p-4 flex flex-col h-full min-w-0">
          <div className="mb-2">
            <div className="flex items-center gap-1 min-[600px]:gap-1.5 min-[1200px]:gap-2">
              <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-400" />
              <span className="text-[11px] sm:text-xs font-semibold text-slate-300">Risk Distribution</span>
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] text-slate-500">Incidents grouped by risk level</div>
          </div>
          <div className="flex flex-1 flex-col items-stretch gap-2 sm:gap-3 w-full min-h-0 soc-dashboard-category-chart">
            <CategoryLineChart items={dashboardData.riskDistribution} color="#f97316" totalLabel="incidents" />
          </div>
        </div>

        {/* Most Changed Files */}
        <div className="min-w-0 bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-2.5 sm:p-3 lg:p-4 flex flex-col h-full">
          <div className="mb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-[600px]:gap-1.5 min-[1200px]:gap-2">
                <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-400" />
                <span className="min-w-0 text-[11px] sm:text-xs font-semibold text-slate-300">Most Changed Files</span>
              </div>
              <button
                onClick={() => navigate("/fim-events")}
                className="shrink-0 text-[9px] min-[600px]:text-[10px] min-[1200px]:text-[11px] text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-0.5 min-[1200px]:gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] text-slate-500">Files with the highest change activity</div>
          </div>
          <div className="flex flex-1 min-h-24 min-w-0 flex-col">
            <DomainBarChart
              items={dashboardData.mostChangedFiles}
              emptyLabel="No changed files detected"
              emptySub="No FIM changes are available for the selected time range."
            />
          </div>
        </div>

        {/* Threat Classification */}
        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-2.5 sm:p-3 lg:p-4 flex flex-col h-full min-w-0">
          <div className="mb-2">
            <div className="flex items-center gap-1 min-[600px]:gap-1.5 min-[1200px]:gap-2">
              <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-400" />
              <span className="text-[11px] sm:text-xs font-semibold text-slate-300">Threat Classification</span>
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] text-slate-500">Detected threats grouped by category</div>
          </div>
          <div className="flex flex-1 flex-col items-stretch gap-2 sm:gap-3 w-full min-h-0 soc-dashboard-category-chart">
            <CategoryLineChart items={dashboardData.threatTypes} color="#ef4444" totalLabel="threats" />
          </div>
        </div>
      </div>

      {/* Timeline Preview Sections */}
      {[
        {
          title: "Command Activity",
          subtitle: "Linux command execution monitoring",
          icon: Terminal,
          iconColor: "text-orange-400",
          chartColor: "#f97316",
          data: dashboardData.commandEvents,
          quickStats: dashboardData.quickStats.attack,
          stats: [
            { label: "Total", value: formatInteger(dashboardData.quickStats.attack.totalCommands), color: "text-orange-400" },
            { label: "Peak", value: formatInteger(dashboardData.quickStats.attack.peak), color: "text-orange-300" },
            { label: "Avg", value: formatDecimal(dashboardData.quickStats.attack.avg), color: "text-yellow-400" },
            { label: "Suspicious", value: formatInteger(dashboardData.quickStats.attack.suspicious), color: "text-red-400" },
          ],
          nav: "/attack-dashboard",
        },
        {
          title: "File Security Scanner",
          subtitle: "Malware detection and IOC analysis",
          icon: Bug,
          iconColor: "text-red-400",
          chartColor: "#ef4444",
          data: dashboardData.fileEvents,
          quickStats: dashboardData.quickStats.file,
          stats: [
            { label: "Scanned", value: formatInteger(dashboardData.quickStats.file.scanned), color: "text-sky-400" },
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
          chartColor: "#10b981",
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
          iconColor: "text-violet-400",
          chartColor: "#a78bfa",
          data: dashboardData.mlEvents,
          quickStats: dashboardData.quickStats.ml,
          stats: [
            { label: "Predictions", value: formatInteger(dashboardData.quickStats.ml.predictions), color: "text-sky-400" },
            { label: "Anomalies", value: formatInteger(dashboardData.quickStats.ml.anomalies), color: "text-orange-400" },
            { label: "Confidence", value: `${formatDecimal(dashboardData.quickStats.ml.confidence)}%`, color: "text-yellow-400" },
            { label: "Top Risk", value: dashboardData.quickStats.ml.topRisk, color: "text-red-400" },
          ],
          nav: "/ml-dashboard",
        },
      ].map((section) => (
        <div key={section.title} className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <section.icon className={`h-4 w-4 ${section.iconColor}`} />
              <span className="text-xs font-semibold text-slate-300">{section.title}</span>
              <span className="text-[10px] text-slate-600 hidden sm:inline">{section.subtitle}</span>
            </div>
            <button
              onClick={() => navigate(section.nav)}
              className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1"
            >
              View <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
            <div className="md:col-span-2 bg-[var(--soc-card)] rounded-lg p-2.5 sm:p-3 border border-[var(--soc-border)]/50 flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-600">{section.title} Timeline ({selectedRangeLabel})</span>
              </div>
              <div className="w-full soc-chart--dash">
                <WaveChart
                  data={section.data}
                  color={section.chartColor}
                  height={220}
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
            <div className="bg-[var(--soc-card)] rounded-lg p-3 border border-[var(--soc-border)]/50">
              <div className="text-[9px] text-slate-600 uppercase font-semibold mb-1.5">Quick Stats</div>
              <div className="divide-y divide-[var(--soc-border)]/40">
                {section.stats.map((s) => (
                  <div key={s.label} className="flex justify-between items-center py-1 first:pt-0 last:pb-0">
                    <span className="text-[10px] text-slate-500">{s.label}</span>
                    <span className={`text-xs font-bold ${s.color}`}>{s.value}</span>
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
