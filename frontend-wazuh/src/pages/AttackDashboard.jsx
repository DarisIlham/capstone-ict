import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  AlertTriangle,
  Clock,
  Terminal,
  Activity,
  CalendarRange,
  ChevronDown,
} from "lucide-react";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import {
  createDefaultDateRange,
  normalizeDateRange,
  getIsoDateRange,
  getDateRangeMinutes,
  toDateTimeLocalValue,
} from "../utils/dateRange";

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
  return { start: start.toISOString(), end: end.toISOString() };
}

const SUSPICIOUS_HIGHLIGHT_KEYWORDS = [
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

// ========================================
// SVG Chart Components
// ========================================

const formatDetailedTimestamp = (timestamp) =>
  new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatLiveTimestamp = (isoString) => {
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

const formatBucketLabel = (timestamp, rangeKey) => {
  const d = new Date(timestamp);
  if (rangeKey === "1h") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (rangeKey === "24h") return d.toLocaleTimeString("en-US", { hour: "2-digit" });
  if (rangeKey === "7d") return d.toLocaleString("en-US", { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const WaveChart = ({ data, rangeKey = "24h", height = 80, compact = false, activePointKey = null, onPointSelect }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const width = 800;
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  if (!data || data.length === 0) {
    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="12" fill="#64748b">No data</text>
      </svg>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => d.v));
  const pointSpacing = data.length ? innerW / (data.length - 1) : innerW;
  const defaultBucketMs = rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000;

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

  const tickCount = clamp(Math.floor(innerW / (compact ? 260 : 160)), compact ? 2 : 3, compact ? 4 : 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div className="relative h-full w-full" onMouseLeave={() => setHoveredPoint(null)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        {gridLines.map((gl) => (
          <g key={`grid-${gl.ratio}`}>
            <line x1={padding.l} y1={gl.y} x2={padding.l + innerW} y2={gl.y} stroke="var(--soc-border)" strokeDasharray="2,2" opacity="0.5" />
            <text x={padding.l - 5} y={gl.y + 3} textAnchor="end" fontSize="8" fill="#64748b">{gl.value}</text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" />
        <path d={pathD} stroke="#f97316" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <defs>
          <linearGradient id="cmdWaveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill="url(#cmdWaveGradient)" />

        {data.map((d, i) => {
          const x = padding.l + i * pointSpacing;
          const y = padding.t + innerH - (d.v / maxV) * innerH;
          const pointKey = String(d.t);
          const bucketMsForPoint = d.bucketMs || defaultBucketMs;
          const pointData = {
            index: i,
            x,
            y,
            key: pointKey,
            value: d.v,
            time: d.t,
            start: d.start || d.t,
            end: d.end || d.t,
            bucketMs: d.bucketMs,
          };
          const isHovered = hoveredPoint?.key === pointKey;
          const isActive = activePointKey === pointKey;
          const isHighlighted = isHovered || isActive;
          return (
            <g key={pointKey}>
              {isActive && (
                <circle cx={x} cy={y} r="7.5" fill="transparent" stroke="#fdba74" strokeWidth="1.5" opacity="0.85" className="pointer-events-none" />
              )}
              <circle cx={x} cy={y} r={isHighlighted ? "7" : "10"} fill="transparent" className="cursor-pointer" role="button" tabIndex={0} aria-label={`Show audit log entries for ${formatDetailedTimestamp(pointData.start)}`} onClick={() => onPointSelect?.(pointData)} onMouseEnter={() => setHoveredPoint(pointData)} onMouseLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint(pointData)} onBlur={() => setHoveredPoint(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPointSelect?.(pointData); } }} />
              <circle cx={x} cy={y} r={isHighlighted ? "5" : "3.5"} fill={isActive ? "#fb923c" : "#f97316"} stroke="#0f172a" strokeWidth="1.5" opacity="0.95" className="pointer-events-none" />
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % tickEvery !== 0) return null;
          const x = padding.l + i * pointSpacing;
          const label = formatBucketLabel(d.t, rangeKey);
          return (
            <g key={`label-${i}`}>
              <text x={x} y={padding.t + innerH + 14} textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"} fontSize="8" fill="#64748b">{label}</text>
            </g>
          );
        })}
      </svg>
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-elevated)] px-3 py-2 text-[11px] shadow-xl"
          style={{
            left: `${Math.min(Math.max((hoveredPoint.x / width) * 100, 14), 86)}%`,
            top: `${Math.max(((hoveredPoint.y - 58) / height) * 100, -10)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-bold text-orange-300">{hoveredPoint.value} <span className="font-normal text-slate-400">commands</span></div>
          <div className="mt-0.5 text-slate-500 leading-snug">{formatDetailedTimestamp(hoveredPoint.start || hoveredPoint.time)}</div>
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
        <circle r={r} fill="transparent" stroke="var(--soc-border)" strokeWidth={stroke} />
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
  <div className="flex flex-wrap gap-3 w-full justify-center">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
        <span>{it.label}</span>
        <span className="text-slate-500 font-mono">{it.value}</span>
      </div>
    ))}
  </div>
);

const CategoryLineChart = ({ items, color = "#38bdf8", totalLabel = "items" }) => {
  const [selected, setSelected] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 1000, height: 210 });
  const padding = { l: 56, r: 56, t: 12, b: 42 };

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
  if (!items || items.length === 0) {
    return (
      <div className="flex min-h-24 items-center justify-center text-[11px] text-slate-500">
        No data available
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
    color: it.color,
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

  return (
    <div className="relative w-full flex flex-col h-full min-h-0" onMouseLeave={() => setSelected(null)}>
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[11px] text-slate-600 uppercase font-semibold">Total</span>
        <span className="text-sm font-bold text-slate-300">
          {total} <span className="text-xs font-normal text-slate-500">{totalLabel}</span>
        </span>
      </div>
      <div ref={rootRef} className="flex-1 min-h-0 w-full">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
          {gridLines.map((grid, idx) => (
            <g key={`grid-${idx}`}>
              <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1" opacity={grid.y === padding.t || grid.y === padding.t + innerH ? "1" : "0.5"} />
              <text x={padding.l - 6} y={grid.y + 3} textAnchor="end" fontSize="10" fill="var(--soc-text-muted)" fontWeight="600">
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
                <text x={p.x} y={padding.t + innerH + 18} textAnchor="middle" fontSize="9" fill="var(--soc-text-muted)">{p.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-center px-1 mt-1">
        {points.map((p) => (
          <div key={`${p.label}-${p.index}`} className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
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
          <div className="font-semibold text-slate-300">{selected.label}</div>
          <div className="mt-1 text-slate-500">{selected.value} {totalLabel}</div>
        </div>
      )}
    </div>
  );
};

const CompactBarChart = ({ items, emptyLabel = "No data available" }) => {
  if (!items || items.length === 0) {
    return (
      <div className="flex min-h-24 items-center justify-center text-[11px] text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const maxValue = Math.max(...items.map((d) => d.value), 1);

  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={item.label} className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="w-4 text-[11px] font-bold text-slate-500 shrink-0">
              {i + 1}.
            </span>
            <span className="flex-1 min-w-0 text-[11px] font-mono text-slate-400 truncate" title={item.label}>
              {item.label}
            </span>
            <span className="text-[12px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
              {item.value}x
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-4 shrink-0" />
            <div
              className="flex-1 bg-[var(--soc-elevated)] border border-[var(--soc-border-strong)] rounded h-4 overflow-hidden"
              title={`${item.label}: ${item.value} executions`}
            >
              <div
                className="h-full rounded transition-all"
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

const TopAgentsCard = ({ agents }) => {
  if (!agents || agents.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-600">No agent data</div>;
  }
  const maxValue = Math.max(...agents.map((a) => a.value), 1);
  const COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];
  return (
    <div className="space-y-3">
      {agents.map((item, i) => {
        const color = COLORS[i % COLORS.length];
        return (
          <div key={item.label} className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="w-5 text-[13px] font-bold text-slate-500 shrink-0">
                {i + 1}.
              </span>
              <span className="flex-1 min-w-0 text-[13px] font-mono text-slate-300 truncate" title={item.label}>
                {item.label}
              </span>
              <span className="text-[13px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
                {new Intl.NumberFormat("en-US").format(item.value)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-5 shrink-0" />
              <div
                className="flex-1 bg-[var(--soc-bg)] rounded h-4 overflow-hidden"
                title={item.lastSeen ? `Last seen ${formatDetailedTimestamp(item.lastSeen)}` : `${item.label}: ${item.value} events`}
              >
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(item.value / maxValue) * 100}%`,
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

const PaginationControls = ({
  pagination,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = true,
}) => {
  const totalPages = pagination?.totalPages || 1;
  const total = pagination?.total || 0;
  const limit = pagination?.limit || pageSize;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="border-t border-slate-800 bg-slate-900/50 px-4 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="text-[10px] md:text-[11px] font-mono text-slate-500">
            <span className="hidden md:inline">SHOWING </span>
            <span className="font-bold text-sky-400">{start}</span>
            <span className="hidden md:inline"> - </span>
            <span className="md:hidden">-</span>
            <span className="font-bold text-sky-400">{end}</span>
            <span className="hidden md:inline"> OF </span>
            <span className="md:hidden"> / </span>
            <span className="font-bold text-sky-400">{total}</span>
            <span className="hidden md:inline"> ENTRIES</span>
          </div>

          {showPageSizeSelector && (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <span>Rows</span>
              <select
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
                disabled={loading}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none disabled:opacity-40"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={page === 1 || loading}
            onClick={() => onPageChange(1)}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">FIRST</span>
            <span className="md:hidden">«</span>
          </button>
          <button
            disabled={page === 1 || loading}
            onClick={() => onPageChange(Math.max(page - 1, 1))}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">← PREV</span>
            <span className="md:hidden">‹</span>
          </button>
          <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400">
            <span className="hidden md:inline">PAGE </span>
            <span className="text-white">{page}</span> / {totalPages}
          </span>
          <button
            disabled={page === totalPages || loading}
            onClick={() => onPageChange(Math.min(page + 1, totalPages))}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">NEXT →</span>
            <span className="md:hidden">›</span>
          </button>
          <button
            disabled={page === totalPages || loading}
            onClick={() => onPageChange(totalPages)}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">LAST</span>
            <span className="md:hidden">»</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ========================================
// Command Highlighter
// ========================================
const CommandHighlighter = ({ command }) => {
  const parts = String(command || "").split(/(\s+)/);

  return (
    <code className="text-[10px] md:text-[11px] font-mono">
      {parts.map((part, idx) => {
        const isSuspicious = SUSPICIOUS_HIGHLIGHT_KEYWORDS.some((kw) =>
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
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

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

  if (!words || words.length === 0) return <div className="flex items-center justify-center h-full text-slate-600 text-xs">No command data</div>;
  const W = size.width || 640, H = size.height || 300;
  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const range = Math.max(1, maxCount - minCount);
  const fontSize = (count) => Math.round(16 + ((count - minCount) / range) * 46);
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
    <div ref={rootRef} className="w-full h-full min-h-0">
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="command-word-cloud block w-full h-full">
        <defs><radialGradient id="wcGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0f172a" stopOpacity="0" /><stop offset="100%" stopColor="#020617" stopOpacity="0.6" /></radialGradient></defs>
        <rect className="command-word-cloud-bg" width={W} height={H} fill="url(#wcGlow)" rx={8} />
        {placed.map((w) => (
          <text key={w.text} x={w.x} y={w.y} textAnchor="middle" dominantBaseline="middle" fontSize={w.fs} fontWeight={w.fs > 46 ? "800" : w.fs > 30 ? "700" : "500"} fill={w.color} opacity={w.opacity} style={{ cursor: "default", fontFamily: "monospace" }}>
            <title>{`${w.text}: ${w.count} occurrences`}</title>{w.text}
          </text>
        ))}
      </svg>
    </div>
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
const DEFAULT_PAGE_SIZE = 25;
const ANALYTICS_LIMIT = 1000;
const TIMELINE_BUCKET_MS = 60 * 1000;
const FALLBACK_TIMELINE_BUCKET_MS = 60 * 60 * 1000;

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
    agentName:
      item.agentName || item.agent_name || (item.agent && item.agent.name) || item.hostName || "-",
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

function createTimelineBucketPoint(
  timestamp,
  value,
  { suspicious = 0, bucketMs = TIMELINE_BUCKET_MS } = {}
) {
  const startDate = new Date(timestamp);
  if (Number.isNaN(startDate.getTime())) return null;

  const start = startDate.toISOString();

  return {
    key: start,
    t: start,
    start,
    end: new Date(startDate.getTime() + bucketMs - 1).toISOString(),
    bucketMs,
    v: value,
    suspicious,
  };
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
    .map(([t, v]) =>
      createTimelineBucketPoint(t, v, { bucketMs: FALLBACK_TIMELINE_BUCKET_MS })
    )
    .filter(Boolean);
}

function formatTimelineBucketLabel(point) {
  if (!point?.start) return "";

  if ((point.bucketMs || TIMELINE_BUCKET_MS) <= TIMELINE_BUCKET_MS) {
    return formatDetailedTimestamp(point.start);
  }

  return `${formatDetailedTimestamp(point.start)} - ${formatDetailedTimestamp(point.end)}`;
}

function getHighlightedCommandTokens(command) {
  return String(command || "")
    .split(/(\s+)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) =>
      SUSPICIOUS_HIGHLIGHT_KEYWORDS.some((kw) => part.toLowerCase().includes(kw.toLowerCase()))
    )
    .map((part) => part.toLowerCase());
}

function extractHighlightedCommandKeywords(logs) {
  const keywordCounts = new Map();

  for (const log of logs) {
    const highlightedParts = getHighlightedCommandTokens(log.command.cmd);

    highlightedParts.forEach((part) => {
      keywordCounts.set(part, (keywordCounts.get(part) || 0) + 1);
    });
  }

  return Array.from(keywordCounts.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
}

// ========================================
// Main Component
// ========================================
const HostMonitoring = () => {
  const [searchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const [searchQuery, setSearchQuery] = useState("");
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(() =>
    urlStart && urlEnd ? { key: "custom", start: urlStart, end: urlEnd } : null
  );
  const [rangeKey, setRangeKey] = useState(() =>
    urlRange && ["1h", "24h", "7d", "30d"].includes(urlRange) ? urlRange : "24h"
  );
  const [filterMode, setFilterMode] = useState(() =>
    urlStart && urlEnd ? "custom" : "range"
  );
  const [customDateRange, setCustomDateRange] = useState(() => {
    const base = createDefaultDateRange(1);
    if (urlStart && urlEnd) {
      return {
        start: toDateTimeLocalValue(new Date(urlStart)),
        end: toDateTimeLocalValue(new Date(urlEnd)),
      };
    }
    return base;
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [logs, setLogs] = useState([]);
  const [analyticsLogs, setAnalyticsLogs] = useState([]);
  const [dangerousLogs, setDangerousLogs] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [backendStats, setBackendStats] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [timelineChartHeight, setTimelineChartHeight] = useState(320);

  const logsTableRef = useRef(null);

  const loadDashboardData = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
    });
    const analyticsParams = new URLSearchParams({
      page: "1",
      limit: String(ANALYTICS_LIMIT),
    });
    const dangerousParams = new URLSearchParams({
      page: "1",
      limit: String(ANALYTICS_LIMIT),
      suspicious: "true",
    });

    if (searchQuery.trim()) {
      params.set("contains", searchQuery.trim());
      analyticsParams.set("contains", searchQuery.trim());
      dangerousParams.set("contains", searchQuery.trim());
    }
    if (suspiciousOnly) params.set("suspicious", "true");

    const filterDateRange =
      filterMode === "custom"
        ? getIsoDateRange(normalizeDateRange(customDateRange))
        : rangeKeyToDateRange(rangeKey);

    const timingStart = selectedTimelinePoint?.start || filterDateRange.start;
    const timingEnd = selectedTimelinePoint?.end || filterDateRange.end;
    params.set("start", timingStart);
    params.set("end", timingEnd);
    analyticsParams.set("start", timingStart);
    analyticsParams.set("end", timingEnd);
    dangerousParams.set("start", timingStart);
    dangerousParams.set("end", timingEnd);

    const minutes =
      filterMode === "custom"
        ? getDateRangeMinutes(getIsoDateRange(normalizeDateRange(customDateRange)))
        : RANGE_TO_MINUTES[rangeKey] || RANGE_TO_MINUTES["24h"];

    const statsParams = new URLSearchParams({
      start: filterDateRange.start,
      end: filterDateRange.end,
    });
    const timelineParams = new URLSearchParams({
      minutes: String(minutes),
      start: filterDateRange.start,
      end: filterDateRange.end,
    });

    try {
      setError("");
      setRefreshing(true);

      const [listResponse, statsResponse, timelineResponse, analyticsResponse, dangerousResponse] = await Promise.all([
        fetchJson(`${API_BASE_URL}/linux-commands?${params.toString()}`),
        fetchJson(`${API_BASE_URL}/linux-commands/stats?${statsParams.toString()}`),
        fetchJson(`${API_BASE_URL}/linux-commands/timeline?${timelineParams.toString()}`),
        fetchJson(`${API_BASE_URL}/linux-commands?${analyticsParams.toString()}`),
        fetchJson(`${API_BASE_URL}/linux-commands?${dangerousParams.toString()}`),
      ]);

      const normalizedLogs = (listResponse.data || []).map(normalizeLinuxCommand);
      const normalizedAnalyticsLogs = (analyticsResponse.data || []).map(normalizeLinuxCommand);
      const normalizedDangerousLogs = (dangerousResponse.data || []).map(normalizeLinuxCommand);
      const apiTimeline = (timelineResponse.data || [])
        .map((item) =>
          createTimelineBucketPoint(item.timestamp, item.total || 0, {
            suspicious: item.suspicious || 0,
            bucketMs: TIMELINE_BUCKET_MS,
          })
        )
        .filter(Boolean)
        .filter((item) => item.v > 0 || item.suspicious > 0);

      setLogs(normalizedLogs);
      setAnalyticsLogs(normalizedAnalyticsLogs.length ? normalizedAnalyticsLogs : normalizedLogs);
      setDangerousLogs(
        normalizedDangerousLogs.length
          ? normalizedDangerousLogs
          : normalizedLogs.filter((log) => log.command.risk === "suspicious")
      );
      setPagination(
        listResponse.pagination || {
          page,
          limit: pageSize,
          total: normalizedLogs.length,
          totalPages: 1,
        }
      );
      setBackendStats(statsResponse.data || null);
      setTimelineData(apiTimeline.length ? apiTimeline : buildTimelineFromLogs(normalizedLogs));
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load linux command data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, rangeKey, filterMode, customDateRange, searchQuery, selectedTimelinePoint, suspiciousOnly]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const stats = useMemo(() => {
    const loadedTotalCommands = logs.length;
    const loadedSuspiciousCount = logs.filter((l) => l.command.risk === "suspicious").length;
    const loadedUniqueSessions = new Set(logs.map((l) => l.sessionId)).size;
    const loadedUniqueUsers = new Set(logs.map((l) => l.user)).size;
    const backendUniqueUsers = Number(backendStats?.totalUsers || backendStats?.users?.length || 0);

    return {
      totalCommands: backendStats?.totalCommands ?? pagination?.total ?? loadedTotalCommands,
      suspiciousCount: backendStats?.suspiciousCommands ?? loadedSuspiciousCount,
      uniqueSessions: backendStats?.totalSessions ?? loadedUniqueSessions,
      uniqueUsers: backendUniqueUsers || loadedUniqueUsers,
      loadedTotalCommands,
      loadedSuspiciousCount,
      loadedUniqueSessions,
    };
  }, [backendStats, logs, pagination]);

  const analytics = useMemo(() => {
    const suspiciousSourceLogs = dangerousLogs.length
      ? dangerousLogs
      : (analyticsLogs.length ? analyticsLogs : logs).filter((log) => log.command.risk === "suspicious");
    const uniqueAgents = new Set(
      logs
        .map((log) => log.agentName)
        .filter((agentName) => agentName && agentName !== "-")
    ).size;

    const topUsers = (backendStats?.users?.length ? backendStats.users : countBy(logs, (log) => log.user))
      .slice(0, 5)
      .map((it, i) => ({
        label: it.user || it.label,
        value: it.count || it.value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

    // Top agents should be derived from the same agent label shown in the table.
    const agentMap = new Map();
    for (const log of logs) {
      const agentName = log.agentName;
      if (!agentName || agentName === "-") continue;
      const existing = agentMap.get(agentName) || { label: agentName, value: 0, lastSeen: 0 };
      existing.value += 1;
      const logTime = new Date(log.timestamp).getTime();
      if (Number.isFinite(logTime)) {
        existing.lastSeen = Math.max(existing.lastSeen, logTime);
      }
      agentMap.set(agentName, existing);
    }
    const topAgents = Array.from(agentMap.values())
      .sort((a, b) => b.value - a.value || b.lastSeen - a.lastSeen)
      .slice(0, 5)
      .map((it, i) => ({
        label: it.label,
        value: it.value,
        lastSeen: it.lastSeen ? new Date(it.lastSeen).toISOString() : new Date().toISOString(),
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

    const suspiciousCommands = suspiciousSourceLogs
      .filter((l) => l.command.risk === "suspicious")
      .map((l) => l.commandName && l.commandName !== "-" ? l.commandName : l.command.cmd.split(/\s+/)[0] || l.command.cmd);

    const topSuspicious = countBy(suspiciousCommands, (cmd) => cmd)
      .slice(0, 5)
      .map((it, i) => ({
        ...it,
        color: ["#ef4444", "#f97316", "#eab308", "#a78bfa", "#f87171"][i % 5],
      }));

    const riskIndicators = countBy(
      suspiciousSourceLogs.flatMap((log) => log.command.indicator),
      (indicator) => indicator
    ).map((it, i) => ({
      ...it,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

    const topSessions = countBy(logs, (log) => log.sessionId && log.sessionId !== "-" ? log.sessionId : null)
      .slice(0, 5)
      .map((it, i) => ({
        label: it.label.length > 18 ? `${it.label.slice(0, 16)}...` : it.label,
        fullLabel: it.label,
        value: it.value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

    return { topUsers, topAgents, topSuspicious, riskIndicators, uniqueAgents, topSessions };
  }, [analyticsLogs, backendStats, dangerousLogs, logs]);

  const wordCloudSourceLogs = useMemo(() => {
    const merged = new Map();

    [...analyticsLogs, ...dangerousLogs, ...logs].forEach((log) => {
      if (!log?.id) return;
      merged.set(log.id, log);
    });

    return Array.from(merged.values());
  }, [analyticsLogs, dangerousLogs, logs]);

  const commandPayloadWords = useMemo(
    () => extractHighlightedCommandKeywords(wordCloudSourceLogs),
    [wordCloudSourceLogs]
  );

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
      const bucketStart = new Date(selectedTimelinePoint.start).getTime();
      const bucketEnd = new Date(selectedTimelinePoint.end).getTime();

      result = result.filter((log) => {
        const logTime = new Date(log.timestamp).getTime();

        return Number.isFinite(logTime) && logTime >= bucketStart && logTime <= bucketEnd;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) => l.user.toLowerCase().includes(q) || (l.command?.cmd || "").toLowerCase().includes(q)
      );
    }

    if (suspiciousOnly) {
      result = result.filter((l) => l.command.risk === "suspicious");
    }

    return [...result].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [logs, searchQuery, selectedTimelinePoint, suspiciousOnly]);

  const sessionCommands = useMemo(() => {
    if (!selectedSession) return [];

    return logs
      .filter((l) => l.sessionId === selectedSession)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [selectedSession, logs]);

  const handleTimelinePointSelect = useCallback((point) => {
    setPage(1);
    setSelectedTimelinePoint((current) =>
      current?.key === point.key
        ? null
        : {
            key: point.key,
            time: point.time,
            start: point.start || point.time,
            end: point.end || point.time,
            bucketMs: point.bucketMs || TIMELINE_BUCKET_MS,
          }
    );
    
    // Scroll to logs table after state update
    setTimeout(() => {
      if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
        try {
          logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (e) {
          // ignore scroll errors
        }
      }
    }, 100);
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = viewportWidth < 768;

  const goToPage = useCallback(
    async (nextPage) => {
      if (!Number.isFinite(nextPage)) return;
      const target = Math.max(1, Math.min(nextPage, pagination?.totalPages || nextPage));
      setPage(target);

      // Scroll to logs table with delay to ensure DOM update
      setTimeout(() => {
        if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
          try {
            logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch (e) {
            // ignore scroll errors
          }
        }
      }, 100);
    },
    [pagination?.totalPages]
  );

  return (
    <>
    <div className="p-4 md:p-5 flex flex-col gap-4 w-full">
        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-3 md:p-4 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <Terminal className="h-5 w-5 text-orange-400" />
                Host Monitoring
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time Linux command auditing and user activity tracking
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-2 md:p-4 shadow-lg flex flex-col gap-3 md:gap-4">
          <div className="flex flex-col items-start gap-1 md:flex-row md:items-center md:justify-between md:gap-2">
            <label className="hidden items-center gap-1 text-[10px] text-slate-400 sm:flex">
              <span>Rows</span>
            </label>
            <div className="relative flex items-center bg-[var(--soc-card)] rounded border border-[var(--soc-border)]">
              <select
                value={pageSize}
                onChange={(event) => {
                  setPage(1);
                  setPageSize(Number(event.target.value));
                  // Scroll to logs table
                  setTimeout(() => {
                    if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
                      try {
                        logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
                      } catch (e) {
                        // ignore
                      }
                    }
                  }, 100);
                }}
                className="appearance-none bg-transparent py-1.5 pl-2 pr-5 text-left text-[11px] font-medium leading-tight text-slate-100 focus:outline-none"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size} className="bg-white text-black">{size}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <RangeFilter
                rangeKey={rangeKey}
                onRangeChange={(nextRange) => {
                  if (rangeKey !== nextRange) {
                    setPage(1);
                    setSelectedTimelinePoint(null);
                    setRangeKey(nextRange);
                    setFilterMode("range");
                  }
                }}
                dimmed={filterMode === "custom"}
              />
              <DateRangeFilter
                value={customDateRange}
                onChange={(range) => {
                  setPage(1);
                  setSelectedTimelinePoint(null);
                  setCustomDateRange(range);
                  setFilterMode("custom");
                }}
                className={filterMode === "range" ? "opacity-50" : ""}
              />
              <span className="hidden lg:flex items-center gap-1 text-[11px] text-slate-600">
                <CalendarRange className="h-3 w-3" />
                {filterMode === "custom"
                  ? new Date(getIsoDateRange(normalizeDateRange(customDateRange)).start).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) +
                    " - " +
                    new Date(getIsoDateRange(normalizeDateRange(customDateRange)).end).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                  : rangeKey}
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              Gagal mengambil data backend: {error}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-orange-400 uppercase font-semibold">Commands</div>
              <div className="text-sm md:text-lg font-black text-orange-300 mt-0.5 md:mt-1">
                {loading ? "..." : stats.totalCommands}
              </div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">Linux commands monitored</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-red-400 uppercase font-semibold">Suspicious</div>
              <div className="text-sm md:text-lg font-black text-red-300 mt-0.5 md:mt-1">
                {loading ? "..." : stats.suspiciousCount}
              </div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">suspicious detected</div>
            </div>
            <div className="bg-sky-500/10 border border-sky-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-sky-400 uppercase font-semibold">Sessions</div>
              <div className="text-sm md:text-lg font-black text-sky-300 mt-0.5 md:mt-1">
                {loading ? "..." : stats.uniqueSessions}
              </div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">unique sessions</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-emerald-400 uppercase font-semibold">Users</div>
              <div className="text-sm md:text-lg font-black text-emerald-300 mt-0.5 md:mt-1">
                {loading ? "..." : stats.uniqueUsers}
              </div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">unique users</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 items-stretch">
            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-6 flex flex-col h-full overflow-visible">
              <div className="flex justify-between items-center mb-4 md:mb-6 gap-2">
                <div className="text-[11px] md:text-xs font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                  <Activity className="h-3 md:h-4 w-3 md:w-4 text-orange-400" />
                  Command Timeline
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Last {rangeKey}</div>
                  <div className="text-[11px] text-slate-600">Updated {formatLiveTimestamp(lastUpdated)}</div>
                </div>
              </div>
              <div className="flex-1 min-h-[240px] md:min-h-[300px] min-w-0 rounded-lg bg-[var(--soc-card)] p-2 md:p-4 overflow-visible">
                <div className="min-w-0 h-full">
                  <WaveChart
                    data={timelineData}
                    rangeKey={rangeKey}
                    height={timelineChartHeight}
                    compact={isMobile}
                    activePointKey={selectedTimelinePoint?.key ?? null}
                    onPointSelect={handleTimelinePointSelect}
                  />
                </div>
              </div>
            </div>

            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-6 h-full">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] md:text-xs font-semibold text-slate-300">Top 5 Agents</div>
                  <div className="mt-1 text-[11px] text-slate-500">Most active agents from host monitoring events</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Unique agents</div>
                  <div className="text-xs font-black text-emerald-300">{analytics.uniqueAgents}</div>
                </div>
              </div>
              <TopAgentsCard agents={analytics.topAgents} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 flex flex-col h-full min-h-[260px]">
              <div className="text-[11px] md:text-xs font-semibold text-slate-300 mb-2 w-full">Top Sessions</div>
              <div className="flex-1 min-h-0 w-full">
                <CategoryLineChart items={analytics.topSessions} color="#f97316" totalLabel="sessions" />
              </div>
            </div>

            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 flex flex-col h-full min-h-[260px]">
              <div className="text-[11px] md:text-xs font-semibold text-slate-300 mb-2 w-full">Risk Indicators</div>
              <div className="flex-1 min-h-0 w-full">
                <CategoryLineChart items={analytics.riskIndicators} color="#ef4444" totalLabel="risks" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4">
              <div className="text-[11px] md:text-xs font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Top 5 Dangerous Commands Executed
              </div>
              <CompactBarChart
                items={analytics.topSuspicious}
                emptyLabel="No suspicious command data found"
              />
            </div>

            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4">
              <div className="text-[11px] md:text-xs font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Command Keywords Distribution
              </div>
              <div className="command-keywords-distribution-box w-full h-40">
                <PayloadWordCloud words={commandPayloadWords} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg overflow-hidden">
          <div ref={logsTableRef} className="p-3 md:p-4 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                {selectedTimelinePoint && (
                  <div className="text-xs text-orange-300">
                    Timeline filter: {formatTimelineBucketLabel(selectedTimelinePoint)}
                  </div>
                )}
              </div>

              {selectedTimelinePoint && (
                <button
                  onClick={() => {
                    setPage(1);
                    setSelectedTimelinePoint(null);
                  }}
                  className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
                >
                  Reset Time Filter
                </button>
              )}
            </div>

            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-64 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search user or command..."
                  value={searchQuery}
                  onChange={(e) => {
                    setPage(1);
                    setSearchQuery(e.target.value);
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500"
                />
              </div>
              <button
                onClick={() => {
                  setPage(1);
                  setSuspiciousOnly(!suspiciousOnly);
                }}
                className={`px-4 py-2 text-[13px] rounded-lg font-medium transition-colors ${
                  suspiciousOnly
                    ? "bg-red-600 text-white"
                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                }`}
              >
                Suspicious Only
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[10px] md:text-[11px] text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  {["waktu", "user", "agent", "session id", "command", "status"].map((header) => (
                    <th
                      key={header}
                      className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log, idx) => (
                    <tr
                      key={log.id}
                      className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${
                        idx % 2 !== 0 ? "bg-slate-900/60" : ""
                      }`}
                    >
                      <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-500 text-[10px] md:text-[11px]">
                        {new Date(log.timestamp).toLocaleString("en-US", {
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-3">
                        <span className="text-[10px] md:text-[11px] font-bold text-sky-300">{log.user}</span>
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-3 text-[10px] md:text-[11px] text-slate-400">{log.agentName}</td>
                      <td className="px-2 md:px-4 py-1.5 md:py-3">
                        <button
                          onClick={() =>
                            setSelectedSession(selectedSession === log.sessionId ? null : log.sessionId)
                          }
                          className="text-[10px] md:text-[11px] font-mono text-purple-300 hover:text-purple-200 transition-colors"
                        >
                          {log.sessionId}
                        </button>
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-3 min-w-96">
                        <CommandHighlighter command={log.command.cmd} />
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-3">
                        {log.command.risk === "suspicious" ? (
                          <span className="px-2 py-1 rounded-full text-[10px] md:text-[11px] font-bold bg-red-500/20 text-red-300">
                            Suspicious
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-[10px] md:text-[11px] font-bold bg-emerald-500/20 text-emerald-300">
                            Normal
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-2 md:px-4 py-10 text-center text-[10px] md:text-[11px] text-slate-500">
                      No audit log entries found for the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            pagination={pagination || { total: filteredLogs.length, totalPages: 1, limit: pageSize }}
            page={page}
            pageSize={pageSize}
            loading={refreshing || loading}
            onPageChange={goToPage}
            onPageSizeChange={(nextPageSize) => {
              setPage(1);
              setPageSize(nextPageSize);
              // Scroll to logs table
              setTimeout(() => {
                if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
                  try {
                    logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
                  } catch (e) {
                    // ignore
                  }
                }
              }, 100);
            }}
            showPageSizeSelector={false}
          />
        </div>
      </div>

      {/* ========== SESSION DETAIL MODAL ========== */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-slate-100">Session Playback</h2>
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
              <div className="text-xs font-semibold text-slate-300 mb-4 flex items-center gap-2">
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
                        <span>Agent: {log.agentName}</span>
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
                <div className="text-center py-8 text-xs text-slate-500">No commands found in this session</div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-6 py-4 flex justify-end">
              <button
                onClick={() => setSelectedSession(null)}
                className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HostMonitoring;
