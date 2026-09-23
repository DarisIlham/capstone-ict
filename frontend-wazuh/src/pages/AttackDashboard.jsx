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
  X,
  Users,
  MonitorPlay,
  ShieldAlert,
} from "lucide-react";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import FilterSelect from "../components/FilterSelect";
import CombinedFilter from "../components/CombinedFilter";
import ExportCsvButton from "../components/ExportCsvButton";
import { useTheme } from "../hooks/useTheme";
import { exportCsv } from "../utils/exportCsv";
import {
  createDefaultDateRange,
  normalizeDateRange,
  getIsoDateRange,
  getDateRangeMinutes,
  toDateTimeLocalValue,
} from "../utils/dateRange";
import { adaptiveLeftGutter } from "../utils/chartAxis";
import { InlineEmptyState } from "../components/EmptyState";

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

// X-axis tick labels for the Command Timeline: no year, keeps ticks short.
const formatBucketLabel = (timestamp, rangeKey) => {
  const d = new Date(timestamp);
  if (rangeKey === "1h") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (rangeKey === "24h") return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit" });
  if (rangeKey === "7d") return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

// Tooltip position in pixels, contained inside the plot box that the
// tooltip is absolutely positioned against (the relative SVG wrapper).
// The old percent-based position was relative to the taller outer
// container (header + plot + legend), which shifted the tooltip down and
// let it get clipped by the chart box on hover.
const getContainedTooltip = (px, py, width, height, tooltipWidth = 144, tooltipHeight = 56) => {
  const W = Math.max(width, 80);
  const H = Math.max(height, 80);
  const gap = 8;
  const edge = 4;
  const half = tooltipWidth / 2;
  const left = clamp(px, half + edge, Math.max(half + edge, W - half - edge));
  let below = false;
  let top = py - gap - tooltipHeight;
  if (top < edge) {
    below = true;
    top = py + 12;
  }
  top = clamp(top, edge, Math.max(edge, H - tooltipHeight - edge));
  return { left, top, below };
};

const WaveChart = ({ data, color = "#f97316", rangeKey = "24h", height = 80, compact = false, activePointKey = null, onPointSelect = null }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: Math.max(rect.width, 200), height: Math.max(rect.height, 40) });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const width = size.width;
  height = size.height;
  const baseP = { l: 28, r: 10, t: 8, b: 24 };

  if (!data || data.length === 0) {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="12" fill="#64748b">No data</text>
      </svg>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => d.v));
  const padding = { ...baseP, l: adaptiveLeftGutter([Math.round(maxV)], baseP.l) };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const defaultBucketMs = rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000;

  // When the chart is dense, shrink the visible markers and skip the large
  // transparent hit-targets so neighbouring points do not overlap.
  const isDense = data.length > 30;
  const denseVisualR = isDense ? 1.6 : 3.5;
  const denseHitR = isDense ? 5 : 10;

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
    <div ref={rootRef} className="relative h-full w-full" onMouseLeave={() => setHoveredPoint(null)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        {gridLines.map((gl) => (
          <g key={`grid-${gl.ratio}`}>
            <line x1={padding.l} y1={gl.y} x2={padding.l + innerW} y2={gl.y} stroke="var(--soc-border)" strokeDasharray="2,2" opacity="0.5" />
            <text x={padding.l - 5} y={gl.y + 3} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="500">{gl.value}</text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" />
        <path d={pathD} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <defs>
          <linearGradient id="cmdWaveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
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
            bucketMs: bucketMsForPoint,
          };

          const isHovered = hoveredPoint?.index === i;
          const isActive = (activePointKey !== null && typeof activePointKey !== "undefined") ? String(activePointKey) === pointKey : false;
          const isHighlighted = isHovered || isActive;

          // Keep the selected marker the same size; only its hit-area adapts for interaction.
          const visualR = `${denseVisualR}`;
          const hitR = isHighlighted || isHovered ? (isDense ? "7" : "10") : `${denseHitR}`;

          return (
            <g key={`point-${pointKey}`}>
              <circle
                cx={x}
                cy={y}
                r={hitR}
                fill="transparent"
                className="cursor-pointer focus:outline-none"
                style={{ outline: "none" }}
                role="button"
                tabIndex={0}
                aria-label={`Show audit log entries for ${formatDetailedTimestamp(pointData.start)}`}
                onClick={() => onPointSelect?.(pointData)}
                onMouseEnter={() => setHoveredPoint(pointData)}
                onMouseLeave={() => setHoveredPoint(null)}
                onFocus={() => setHoveredPoint(pointData)}
                onBlur={() => setHoveredPoint(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPointSelect?.(pointData);
                  }
                }}
              />
              <circle
                cx={x}
                cy={y}
                r={visualR}
                fill={isActive ? "#fb923c" : color}
                stroke={isActive ? "#0f172a" : "none"}
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
          return (
            <g key={`tick-${d.t}`}>
              <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="var(--soc-border)" />
              <text
                x={x}
                y={padding.t + innerH + 14}
                textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"}
                fontSize="10"
                fill="#64748b"
                fontWeight="500"
              >
                {formatBucketLabel(d.t, rangeKey)}
              </text>
            </g>
          );
        })}
      </svg>
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 min-w-[120px] max-w-[220px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${Math.min(Math.max((hoveredPoint.x / width) * 100, 10), 82)}%`,
            top: `${Math.max(((hoveredPoint.y - 40) / height) * 100, 6)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-[var(--soc-text-primary)]">{hoveredPoint.value} commands</div>
          <div className="mt-1 text-[var(--soc-text-secondary)]">{formatDetailedTimestamp(hoveredPoint.start || hoveredPoint.time)}</div>
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
        <text y={-3} textAnchor="middle" fontSize="11" fill="var(--soc-text-primary)" fontWeight="700">
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

const CategoryLineChart = ({ items, color = "#38bdf8", totalLabel = "items", onPointClick = null }) => {
  const [selected, setSelected] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 1000, height: 210 });
  // Responsive plot padding (presentation only): reclaim horizontal space
  // on narrow phones so the line itself stays wide enough to read.
  const narrowPlot = size.width < 480;
  const basePadding = narrowPlot
    ? { l: 34, r: 16, t: 12, b: 42 }
    : { l: 56, r: 56, t: 12, b: 42 };

  // Keep the measured plot size fresh (see PayloadWordCloud): the SVG
  // viewBox and the hover tooltip both assume these match the live box.
  const syncSize = useCallback(() => {
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height }
      );
    }
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    syncSize();
    const raf = requestAnimationFrame(() => syncSize());
    const observer = new ResizeObserver(syncSize);
    observer.observe(node);
    window.addEventListener("resize", syncSize);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", syncSize);
    };
  }, [syncSize, items]);

  const width = size.width;
  const height = size.height;
  if (!items || items.length === 0) {
    return <InlineEmptyState title="No data available" />;
  }

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, it) => s + it.value, 0) || 1;
  const maxV = Math.max(1, ...sorted.map((d) => d.value));
  const gridVals = [0, 1, 2, 3].map((i) => Math.round(((i / 3) * maxV * 10)) / 10);
  const padding = { ...basePadding, l: adaptiveLeftGutter(gridVals, basePadding.l, 12, "600 11px sans-serif") };
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
  // 8% headroom so the peak never touches the top edge (gridlines keep
  // their nice round values; only plotted points sit slightly lower).
  const yFor = (v) => padding.t + innerH - (v / maxV) * innerH * 0.92;

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
    <div className="relative w-full min-w-0 max-w-full flex flex-col h-full min-h-0 overflow-hidden" onMouseLeave={() => setSelected(null)}>
      <div className="flex items-center justify-between mb-1 px-1 min-w-0">
        <span className="text-[11px] text-slate-600 uppercase font-semibold shrink-0">Total</span>
        <span className="text-sm font-bold text-slate-300 truncate">
          {total} <span className="text-xs font-normal text-slate-500">{totalLabel}</span>
        </span>
      </div>
      <div ref={rootRef} className="relative w-full min-w-0 max-w-full min-h-0 flex-1 overflow-hidden cat-chart-plot" style={{ minHeight: 0 }}>
        {/* "meet" keeps axis/legend glyphs proportional (never gepeng):
            the viewBox always matches this box via ResizeObserver. */}
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block w-full max-w-full overflow-hidden" style={{ display: "block" }}>
          {gridLines.map((grid, idx) => (
            <g key={`grid-${idx}`}>
              <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1" opacity={grid.y === padding.t || grid.y === padding.t + innerH ? "1" : "0.5"} />
              <text x={padding.l - 6} y={grid.y + 3} textAnchor="end" fontSize="11" fill="var(--soc-text-muted)" fontWeight="600">
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
            // Keep edge labels inside the SVG box: shift the centered label
            // so its estimated half-width never crosses the box border.
            const halfLabel = Math.ceil(String(p.label ?? "").length * 5.4 / 2) + 3;
            const labelX = clamp(p.x, halfLabel + 2, Math.max(halfLabel + 2, width - halfLabel - 2));
            return (
              <g
                key={`${p.label}-${p.index}`}
                onMouseEnter={() => setSelected(p)}
                onMouseLeave={() => setSelected(null)}
                onPointerEnter={() => setSelected(p)}
                onPointerMove={() => setSelected(p)}
              >
                <title>{`${p.label}: ${p.value} ${totalLabel}`}</title>
                <circle cx={p.x} cy={p.y} r={isSel ? "6" : "9"} fill="transparent" className="cursor-pointer focus:outline-none" style={{ outline: "none" }}
                  onMouseEnter={() => setSelected(p)}
                  onMouseLeave={() => setSelected(null)}
                  onPointerEnter={() => setSelected(p)}
                  onPointerMove={() => setSelected(p)}
                  onFocus={() => setSelected(p)}
                  onBlur={() => setSelected(null)}
                  onClick={() => {
                    setSelected(isSel ? null : p);
                    onPointClick?.(p);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onPointClick?.(p);
                    }
                  }}
                  role={onPointClick ? "button" : undefined}
                  tabIndex={onPointClick ? 0 : undefined}
                  aria-label={onPointClick ? `Filter logs for session ${p.label}` : undefined}
                />
                <circle cx={p.x} cy={p.y} r={isSel ? "5" : "3.5"} fill={p.color} stroke={isSel && onPointClick ? p.color : onPointClick ? "none" : "var(--soc-bg)"} strokeWidth={isSel && onPointClick ? "2.5" : "1.5"} opacity="0.95" className="pointer-events-none" />
                <text x={labelX} y={padding.t + innerH + 18} textAnchor="middle" fontSize="10" fill="var(--soc-text-muted)" fontWeight="500">{p.label}</text>
              </g>
            );
          })}
        </svg>
        {selected &&
          (() => {
            const pos = getContainedTooltip(selected.x, selected.y, width, height);
            return (
              <div
                className="pointer-events-none absolute z-20 min-w-[110px] max-w-[180px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-xl"
                style={{
                  left: `${pos.left}px`,
                  top: `${pos.top}px`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="font-semibold text-slate-300 break-words">{selected.label}</div>
                <div className="mt-1 text-slate-500">{selected.value} {totalLabel}</div>
              </div>
            );
          })()}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-center px-1 mt-1 min-w-0 max-w-full overflow-hidden">
        {points.map((p) => {
          const isLegendSelected = selected?.index === p.index;
          return (
          <div key={`${p.label}-${p.index}`} onMouseEnter={() => setSelected(p)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(p)} onBlur={() => setSelected(null)} onClick={() => { setSelected(p); onPointClick?.(p); }} className={`flex items-center gap-1.5 text-[11px] min-w-0 max-w-full ${isLegendSelected ? "font-bold text-slate-200" : "text-slate-400"} ${onPointClick ? "cursor-pointer" : ""}`} title={onPointClick ? `Filter logs for session ${p.label}` : undefined}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="truncate min-w-0 max-w-[140px]">{p.label}</span>
            <span className="text-slate-500 font-mono shrink-0">{p.value}</span>
          </div>
          );
        })}
      </div>
    </div>
  );
};

const CompactBarChart = ({ items, emptyLabel = "No data available", onItemClick = null, activeValue = null }) => {
  if (!items || items.length === 0) {
    return <InlineEmptyState title={emptyLabel} />;
  }

  const maxValue = Math.max(...items.map((d) => d.value), 1);
  const CHART_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];

  return (
    <div className="w-full min-w-0 max-w-full space-y-1.5">
      {items.map((item, i) => {
        const color = item.color || CHART_COLORS[i % CHART_COLORS.length];
        const label = item.label;
        const value = item.value;
        const isActive = activeValue != null && String(label) === String(activeValue);
        return (
          <div key={label} onClick={() => onItemClick?.(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg ${onItemClick ? "cursor-pointer" : ""} ${isActive ? "bg-orange-500/10 ring-1 ring-orange-500/30" : ""}`} title={onItemClick ? `Filter logs for ${label}` : undefined}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color }}>
                  {i + 1}
                </span>
                <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)]" title={label}>
                  {label}
                </span>
              </div>
              <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">
                {new Intl.NumberFormat("en-US").format(value)}
              </span>
            </div>
            <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
              <div
                className="h-full rounded-full transition-all duration-500"
                title={`${label}: ${value} executions`}
                style={{
                  width: `${(value / maxValue) * 100}%`,
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

const TopAgentsCard = ({ agents, onItemClick = null, activeName = null }) => {
  if (!agents || agents.length === 0) {
    return <InlineEmptyState title="No agent data" description="No agent activity available for the selected time range." />;
  }
  const maxValue = Math.max(...agents.map((a) => a.value), 1);
  const CHART_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
  return (
    <div className="w-full min-w-0 max-w-full space-y-1.5">
      {agents.map((item, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const value = item.value;
        const label = item.label;
        const isActive = activeName != null && String(label) === String(activeName);
        return (
          <div key={label} onClick={() => onItemClick?.(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg ${onItemClick ? "cursor-pointer" : ""} ${isActive ? "bg-orange-500/10 ring-1 ring-orange-500/30" : ""}`} title={onItemClick ? `Filter logs for ${label}` : undefined}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color }}>
                  {i + 1}
                </span>
                <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)]" title={label}>
                  {label}
                </span>
              </div>
              <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">
                {new Intl.NumberFormat("en-US").format(value)}
              </span>
            </div>
            <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
              <div
                className="h-full rounded-full transition-all duration-500"
                title={item.lastSeen ? `Last seen ${formatDetailedTimestamp(item.lastSeen)}` : `${label}: ${value} events`}
                style={{
                  width: `${(value / maxValue) * 100}%`,
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
// Palet terang (tema terang) vs palet cerah (tema gelap) agar keyword tetap terbaca
const WORD_COLORS_LIGHT = ["#be123c", "#0369a1", "#047857", "#6d28d9", "#b45309", "#0f766e", "#b91c1c", "#1d4ed8", "#7c3aed", "#a16207"];
const WORD_COLORS_DARK = ["#fb7185", "#38bdf8", "#34d399", "#a78bfa", "#fbbf24", "#2dd4bf", "#f87171", "#60a5fa", "#c084fc", "#facc15"];

const PayloadWordCloud = ({ words, activeWord = null, onWordClick = null }) => {
  const { theme } = useTheme();
  const palette = theme === "light" ? WORD_COLORS_LIGHT : WORD_COLORS_DARK;
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // The SVG viewBox MUST track the live box size: a stale viewBox renders
  // as a narrow centered blob (meet) or stretched text (none). Size is
  // therefore re-synced from several sources — ResizeObserver, window
  // resizes, a post-mount frame (layout/sidebar settle), and data changes.
  const syncSize = useCallback(() => {
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height }
      );
    }
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    syncSize();
    const raf = requestAnimationFrame(() => syncSize());
    const observer = new ResizeObserver(syncSize);
    observer.observe(node);
    window.addEventListener("resize", syncSize);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", syncSize);
    };
  }, [syncSize, words]);

  if (!words || words.length === 0) return <InlineEmptyState title="No command data" description="No command activity available for the selected time range." />;

  // Follow the measured box (presentation only): never assume a minimum
  // wider than the actual container, or words overflow on small phones.
  const W = Math.max(size.width || 300, 140);
  const H = Math.max(size.height || 160, 120);

  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const range = Math.max(1, maxCount - minCount);

  const measureTextWidth = (() => {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = canvas ? canvas.getContext("2d") : null;
    return (text, fs, weight) => {
      if (!ctx || !fs || fs <= 0) return text.length * fs * 0.6;
      ctx.font = `${weight} ${fs}px monospace`;
      return Math.ceil(ctx.measureText(text).width);
    };
  })();

  const toWeight = (fs) => (fs > 26 ? "800" : fs > 18 ? "700" : "500");
  const SAFE_X = 18;
  const SAFE_Y = 14;
  const fontSize = (count) => Math.round(30 + ((count - minCount) / range) * 60);
  const placed = [];
  const rects = [];
  const overlaps = (nx, ny, nw, nh) => {
    const pad = 3;
    return rects.some((r) =>
      nx - nw / 2 - pad < r.x + r.w / 2 &&
      nx + nw / 2 + pad > r.x - r.w / 2 &&
      ny - nh / 2 - pad < r.y + r.h / 2 &&
      ny + nh / 2 + pad > r.y - r.h / 2
    );
  };

  for (let i = 0; i < words.length; i++) {
    const { text, count } = words[i];
    const fs = fontSize(count);
    const weight = toWeight(fs);
    const tw = measureTextWidth(text, fs, weight);
    const th = Math.ceil(fs * 1.4);
    if (tw > W - 2 * SAFE_X || th > H - 2 * SAFE_Y) continue;

    // Start inside a moderate central zone. The local spiral fills this area
    // first, then expands only as needed instead of spanning the full card.
    const zoneW = (W - 2 * SAFE_X) * 0.55;
    const zoneH = (H - 2 * SAFE_Y) * 0.6;
    const zoneX = (W - zoneW) / 2;
    const zoneY = (H - zoneH) / 2;
    const targetX = zoneX + (((i * 0.61803398875 + 0.17) % 1) * zoneW);
    const targetY = zoneY + (((i * 0.41421356237 + 0.23) % 1) * zoneH);
    let placedX = targetX;
    let placedY = targetY;
    let found = false;
    for (let step = 0; step < 800; step++) {
      const angle = step * 0.35;
      const radius = step * 0.45;
      const cx = targetX + radius * Math.cos(angle);
      const cy = targetY + radius * Math.sin(angle) * 0.6;
      if (cx - tw / 2 >= SAFE_X && cx + tw / 2 <= W - SAFE_X && cy - th / 2 >= SAFE_Y && cy + th / 2 <= H - SAFE_Y && !overlaps(cx, cy, tw, th)) {
        placedX = cx;
        placedY = cy;
        found = true;
        break;
      }
    }

    if (found) {
      rects.push({ x: placedX, y: placedY, w: tw, h: th });
      placed.push({ text, fs, weight, color: palette[i % palette.length], opacity: 0.65 + ((count - minCount) / range) * 0.35, x: placedX, y: placedY, count });
    }
  }

  // Uniform scaling only: with "meet" the text can never be stretched
  // non-uniformly (gepeng) even if the measured box lags the real box —
  // worst case is small even margins, never squished glyphs.
  return (
    <div ref={rootRef} className="relative w-full h-full min-h-0">
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="command-word-cloud block w-full h-full">
        <defs><radialGradient id="wcGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="var(--soc-wc-center, #0f172a)" stopOpacity="0" /><stop offset="100%" stopColor="var(--soc-wc-edge, #020617)" stopOpacity="var(--soc-wc-edge-opacity, 0.6)" /></radialGradient></defs>
        <rect className="command-word-cloud-bg" width={W} height={H} fill="url(#wcGlow)" rx={12} />
        {placed.map((w) => (
          <text
            key={w.text}
            className="fim-payload-span"
            x={w.x}
            y={w.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={w.fs}
            fontWeight={activeWord === w.text ? "600" : w.weight}
            fill={w.color}
            stroke={activeWord === w.text ? w.color : "none"}
            strokeWidth={activeWord === w.text ? 0.5 : 0}
            opacity={activeWord != null && activeWord !== w.text ? 0.4 : activeWord === w.text ? 1 : w.opacity}
            style={{ cursor: typeof onWordClick === "function" ? "pointer" : "default", fontFamily: "monospace", transition: "opacity 120ms, fill 120ms" }}
            role={typeof onWordClick === "function" ? "button" : undefined}
            tabIndex={typeof onWordClick === "function" ? 0 : undefined}
            aria-label={typeof onWordClick === "function" ? `Filter logs containing ${w.text}` : undefined}
            onClick={typeof onWordClick === "function" ? () => onWordClick(w.text) : undefined}
            onKeyDown={typeof onWordClick === "function" ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onWordClick(w.text); } } : undefined}
          >
            <title>{`${w.text}: ${w.count} occurrences${typeof onWordClick === "function" ? " — click to filter logs" : ""}`}</title>
            {w.text}
          </text>
        ))}
      </svg>
    </div>
  );
};

const API_BASE_URL =
  `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

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
  const rawCommand = item.command;
  const commandText = typeof rawCommand === "string"
    ? rawCommand
    : rawCommand?.cmd || rawCommand?.command || rawCommand?.value || "";

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
      cmd: String(commandText),
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
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

// ========================================
// Main Component
// ========================================
const HostMonitoring = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const urlStatus = searchParams.get("status");
  const urlFocus = searchParams.get("focus");
  const urlAgent = searchParams.get("agent");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(() =>
    urlStatus === "suspicious" || urlStatus === "normal" ? urlStatus : "all"
  );
  const [userFilter, setUserFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState(urlAgent || "all");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(null);
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
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [selectedCommandFilter, setSelectedCommandFilter] = useState("");

  const [logs, setLogs] = useState([]);
  const [analyticsLogs, setAnalyticsLogs] = useState([]);
  const [dangerousLogs, setDangerousLogs] = useState([]);
  const [backendTimelineData, setBackendTimelineData] = useState([]);
  const [backendStats, setBackendStats] = useState(null);
  const [backendTopSessions, setBackendTopSessions] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [timelineChartHeight, setTimelineChartHeight] = useState(250);

  const logsTableRef = useRef(null);
  const topAgentsPanelRef = useRef(null);
  const knownDangerousIdsRef = useRef(null);
  const audioContextRef = useRef(null);

  const playDangerAlert = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") audioContext.resume();

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (audioError) {
      console.warn("Danger alert sound is unavailable:", audioError);
    }
  }, []);

  React.useEffect(() => {
    if (!urlAgent && urlFocus !== "logs") return;
    const id = setTimeout(() => {
      if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
        try { logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
      }
    }, 300);
    return () => clearTimeout(id);
  }, [urlAgent, urlFocus, loading]);

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

    if (searchQuery.trim()) params.set("limit", String(ANALYTICS_LIMIT));
    if (statusFilter === "suspicious") params.set("suspicious", "true");
    else if (statusFilter === "normal") params.set("suspicious", "false");
    if (userFilter !== "all") {
      params.set("user", userFilter);
      analyticsParams.set("user", userFilter);
      dangerousParams.set("user", userFilter);
    }
    if (agentFilter !== "all") {
      params.set("agentName", agentFilter);
      analyticsParams.set("agentName", agentFilter);
      dangerousParams.set("agentName", agentFilter);
    }
    if (sessionFilter !== "all") {
      params.set("session", sessionFilter);
      analyticsParams.set("session", sessionFilter);
      dangerousParams.set("session", sessionFilter);
    }
    if (selectedCommandFilter) params.set("contains", selectedCommandFilter);

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
    // Top Sessions memakai agregasi full-range khusus session (tidak
    // terpotong limit 1000 sampel) yang selalu mengikuti filter hari.
    const sessionParams = new URLSearchParams({
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

      const [listResponse, statsResponse, timelineResponse, analyticsResponse, dangerousResponse, sessionsResponse] = await Promise.all([
        fetchJson(`${API_BASE_URL}/linux-commands?${params.toString()}`),
        fetchJson(`${API_BASE_URL}/linux-commands/stats?${statsParams.toString()}`),
        fetchJson(`${API_BASE_URL}/linux-commands/timeline?${timelineParams.toString()}`),
        fetchJson(`${API_BASE_URL}/linux-commands?${analyticsParams.toString()}`),
        fetchJson(`${API_BASE_URL}/linux-commands?${dangerousParams.toString()}`),
        fetchJson(`${API_BASE_URL}/host-monitoring/top-sessions?${sessionParams.toString()}`).catch(() => null),
      ]);

      const normalizedLogs = (listResponse.data || []).map(normalizeLinuxCommand);
      const normalizedAnalyticsLogs = (analyticsResponse.data || []).map(normalizeLinuxCommand);
      const normalizedDangerousLogs = (dangerousResponse.data || []).map(normalizeLinuxCommand);
      const currentDangerousLogs = normalizedDangerousLogs.length
        ? normalizedDangerousLogs
        : normalizedLogs.filter((log) => log.command.risk === "suspicious");
      const currentDangerousIds = new Set(
        currentDangerousLogs.map((log) => String(
          log.id || `${log.timestamp}|${log.agentName}|${log.command?.cmd}`
        ))
      );
      if (knownDangerousIdsRef.current) {
        const hasNewDanger = [...currentDangerousIds].some(
          (id) => !knownDangerousIdsRef.current.has(id)
        );
        if (hasNewDanger) playDangerAlert();
      }
      knownDangerousIdsRef.current = currentDangerousIds;

      setLogs(normalizedLogs);
      setAnalyticsLogs(normalizedAnalyticsLogs.length ? normalizedAnalyticsLogs : normalizedLogs);
      setDangerousLogs(currentDangerousLogs);
      setPagination(
        listResponse.pagination || {
          page,
          limit: pageSize,
          total: normalizedLogs.length,
          totalPages: 1,
        }
      );
      setBackendStats(statsResponse.data || null);
      setBackendTimelineData(Array.isArray(timelineResponse.data) ? timelineResponse.data : []);
      const sessionsData = Array.isArray(sessionsResponse?.data) ? sessionsResponse.data : null;
      // null = endpoint gagal → pakai fallback; [] = memang tidak ada session di rentang ini.
      setBackendTopSessions(sessionsData);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load linux command data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, rangeKey, filterMode, customDateRange, searchQuery, selectedTimelinePoint, statusFilter, userFilter, agentFilter, sessionFilter, selectedCommandFilter, playDangerAlert]);

  const handleExportCsv = async () => {
    try {
      const filterDateRange =
        filterMode === "custom"
          ? getIsoDateRange(normalizeDateRange(customDateRange))
          : rangeKeyToDateRange(rangeKey);
      const start = selectedTimelinePoint?.start || filterDateRange.start;
      const end = selectedTimelinePoint?.end || filterDateRange.end;
      const collected = [];
      for (let pg = 1; pg <= 50; pg++) {
        const params = new URLSearchParams({
          page: String(pg),
          limit: String(100),
          start,
          end,
        });
        if (searchQuery.trim()) params.set("contains", searchQuery.trim());
        if (selectedCommandFilter) params.set("contains", selectedCommandFilter);
        if (statusFilter === "suspicious") params.set("suspicious", "true");
        else if (statusFilter === "normal") params.set("suspicious", "false");
        if (userFilter !== "all") params.set("user", userFilter);
        if (agentFilter !== "all") params.set("agentName", agentFilter);
        if (sessionFilter !== "all") params.set("session", sessionFilter);
        const response = await fetchJson(`${API_BASE_URL}/linux-commands?${params.toString()}`);
        const data = (response.data || []).map(normalizeLinuxCommand);
        collected.push(...data);
        const totalPages = Number(response.pagination?.totalPages || 1);
        if (pg >= totalPages || data.length < 100) break;
      }
      const formatTs = (v) =>
        v
          ? new Date(v).toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
          : "-";
      const rows = collected.map((log) => [
        formatTs(log.timestamp),
        log.agentName || "-",
        log.user || "-",
        log.sessionId || "-",
        log.command?.cmd || "-",
        log.command?.risk || "-",
        log.hostIp || "-",
        Array.isArray(log.command?.indicator) && log.command.indicator.length
          ? log.command.indicator.join(", ")
          : "-",
        log.logFilePath || "-",
      ]);
      exportCsv({
        filename: `host-monitoring-commands-${new Date().toISOString().slice(0, 10)}.csv`,
        header: ["Timestamp", "Agent", "User", "Session", "Command", "Risk", "Host IP", "Indicators", "Log File"],
        rows,
      });
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadDashboardData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  const timelineData = useMemo(() => {
    const rangeMsMap = {
      "1h": 3600000,
      "24h": 86400000,
      "7d": 604800000,
      "30d": 2592000000,
    };

    let rangeMs;
    let startMs;
    let endMs;

    if (filterMode === "custom") {
      const { start, end } = getIsoDateRange(normalizeDateRange(customDateRange));
      startMs = new Date(start).getTime();
      endMs = new Date(end).getTime();
      rangeMs = Math.max(endMs - startMs, 1);
    } else {
      rangeMs = rangeMsMap[rangeKey] ?? 86400000;
      const nowMs = Date.now();
      startMs = nowMs - rangeMs;
      endMs = nowMs;
    }

    let stepMs =
      filterMode === "custom"
        ? rangeMs <= 3600000
          ? 300000
          : rangeMs <= 86400000
            ? 3600000
            : rangeMs <= 604800000
              ? 21600000
              : 86400000
        : rangeKey === "1h"
          ? 300000
          : rangeKey === "24h"
            ? 3600000
            : rangeKey === "7d"
              ? 21600000
              : 86400000;

    const bucketStart = (ms) => Math.floor(ms / stepMs) * stepMs;
    const buckets = new Map();

    const hasBackendData =
      Array.isArray(backendTimelineData) &&
      backendTimelineData.length > 0 &&
      backendTimelineData.some((it) => (it.total || 0) > 0 || (it.suspicious || 0) > 0);

    if (hasBackendData) {
      for (const item of backendTimelineData) {
        const ms = new Date(item.timestamp).getTime();
        if (!Number.isFinite(ms)) continue;
        const b = bucketStart(ms);
        const existing = buckets.get(b) || { total: 0, suspicious: 0 };
        existing.total += Number(item.total) || 0;
        existing.suspicious += Number(item.suspicious) || 0;
        buckets.set(b, existing);
      }
    } else {
      const sourceLogs = analyticsLogs.length ? analyticsLogs : logs;
      for (const log of sourceLogs) {
        const ms = new Date(log.timestamp).getTime();
        if (!Number.isFinite(ms) || ms < startMs || ms > endMs) continue;
        const b = bucketStart(ms);
        const existing = buckets.get(b) || { total: 0, suspicious: 0 };
        existing.total += 1;
        if (log.command?.risk === "suspicious" || log.risk === "suspicious") {
          existing.suspicious += 1;
        }
        buckets.set(b, existing);
      }
    }

    const series = [];
    for (let t = bucketStart(startMs); t <= bucketStart(endMs); t += stepMs) {
      const bData = buckets.get(t) || { total: 0, suspicious: 0 };
      const startIso = new Date(t).toISOString();
      const endIso = new Date(t + stepMs - 1).toISOString();
      series.push({
        key: String(t),
        t,
        start: startIso,
        end: endIso,
        bucketMs: stepMs,
        v: bData.total,
        suspicious: bData.suspicious,
      });
    }

    return series;
  }, [filterMode, customDateRange, rangeKey, backendTimelineData, analyticsLogs, logs]);

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
    // Range-wide source: analyticsLogs is fetched with the same start/end
    // as the selected date filter (up to ANALYTICS_LIMIT rows), so Top
    // Agents and sibling summaries always reflect the active period —
    // not just the current table page.
    const rangedLogs = analyticsLogs.length ? analyticsLogs : logs;
    const suspiciousSourceLogs = dangerousLogs.length
      ? dangerousLogs
      : (analyticsLogs.length ? analyticsLogs : logs).filter((log) => log.command.risk === "suspicious");
    const uniqueAgents = new Set(
      rangedLogs
        .map((log) => log.agentName)
        .filter((agentName) => agentName && agentName !== "-")
    ).size;

    const topUsers = (backendStats?.users?.length ? backendStats.users : countBy(rangedLogs, (log) => log.user))
      .slice(0, 5)
      .map((it, i) => ({
        label: it.user || it.label,
        value: it.count || it.value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

    // Top agents should be derived from the same agent label shown in the table.
    const agentMap = new Map();
    for (const log of rangedLogs) {
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
    // Prefer the backend terms aggregation (complete across the whole date
    // range); fall back to the client-side sample when unavailable.
    const backendAgents = Array.isArray(backendStats?.agents) ? backendStats.agents : [];
    const topAgentsSource = backendAgents.length
      ? backendAgents.map((it) => ({
        label: it.agent || it.label,
        value: it.count || it.value,
        lastSeen: 0,
      }))
      : Array.from(agentMap.values()).sort((a, b) => b.value - a.value || b.lastSeen - a.lastSeen);
    const topAgents = topAgentsSource
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

    // Urutan sumber Top Sessions (semuanya sudah mengikuti filter hari):
    // 1. Agregasi by_session dari linux-commands/stats — hanya menghitung
    //    session dari command activity (sesuai judul grafik), full-range.
    //    (butuh backend terbaru; null bila backend lama)
    // 2. Endpoint khusus top-sessions (full-range, semua tipe log) —
    //    null berarti fetch gagal, [] berarti memang kosong.
    // 3. Hitungan sampel client-side (terbatas) sebagai fallback terakhir.
    const backendSessions = Array.isArray(backendStats?.sessions) ? backendStats.sessions : [];
    const topSessionsSource = backendSessions.length
      ? backendSessions.map((it) => ({
        label: it.session || it.label,
        fullLabel: it.session || it.label,
        value: it.count || it.value,
      }))
      : backendTopSessions !== null
        ? backendTopSessions.map((it) => ({
          label: it.label ?? it.fullLabel ?? it.session,
          fullLabel: it.fullLabel ?? it.label ?? it.session,
          value: it.value ?? it.count,
        }))
        : countBy(rangedLogs, (log) => log.sessionId && log.sessionId !== "-" ? log.sessionId : null);
    const topSessions = topSessionsSource
      .filter((it) => it.label && it.label !== "-")
      .slice(0, 5)
      .map((it, i) => ({
        label: String(it.label).length > 18 ? `${String(it.label).slice(0, 16)}...` : String(it.label),
        fullLabel: String(it.label),
        value: it.value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

    return { topUsers, topAgents, topSuspicious, riskIndicators, uniqueAgents, topSessions };
  }, [analyticsLogs, backendStats, backendTopSessions, dangerousLogs, logs]);

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

  const filterOptions = useMemo(() => {
    const source = analyticsLogs.length ? analyticsLogs : logs;
    const toOptions = (getKey) =>
      Array.from(
        new Set(source.map(getKey).filter((value) => value && value !== "-"))
      ).sort((a, b) => String(a).localeCompare(String(b)));

    return {
      users: toOptions((log) => log.user),
      agents: toOptions((log) => log.agentName),
      sessions: toOptions((log) => log.sessionId),
    };
  }, [analyticsLogs, logs]);

  // Height is now controlled by CSS (.soc-panel--responsive-height) for
  // responsiveness; no inline fixed height needed.

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
        (l) => [l.user, l.commandName, l.command?.cmd, l.agentName, l.sessionId]
          .some((value) => String(value || "").toLowerCase().includes(q))
      );
    }

    if (selectedCommandFilter) {
      const q = String(selectedCommandFilter).toLowerCase();
      result = result.filter((l) => String(l.command?.cmd || l.commandName || "").toLowerCase().includes(q));
    }

    if (statusFilter === "suspicious") {
      result = result.filter((l) => l.command.risk === "suspicious");
    } else if (statusFilter === "normal") {
      result = result.filter((l) => l.command.risk === "normal");
    }

    if (userFilter !== "all") {
      result = result.filter((l) => String(l.user) === userFilter);
    }

    if (agentFilter !== "all") {
      result = result.filter((l) => String(l.agentName) === agentFilter);
    }

    if (sessionFilter !== "all") {
      result = result.filter((l) => String(l.sessionId) === sessionFilter);
    }

    return [...result].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [logs, searchQuery, selectedTimelinePoint, statusFilter, userFilter, agentFilter, sessionFilter, selectedCommandFilter]);

  const keywordFilterActive = Boolean(selectedKeyword);

  const crossFilteredLogs = useMemo(() => {
    if (!keywordFilterActive) return null;

    let result = wordCloudSourceLogs;

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
        (l) => [l.user, l.commandName, l.command?.cmd, l.agentName, l.sessionId]
          .some((value) => String(value || "").toLowerCase().includes(q))
      );
    }

    if (selectedCommandFilter) {
      const q = String(selectedCommandFilter).toLowerCase();
      result = result.filter((l) => String(l.command?.cmd || l.commandName || "").toLowerCase().includes(q));
    }

    if (statusFilter === "suspicious") {
      result = result.filter((l) => l.command.risk === "suspicious");
    } else if (statusFilter === "normal") {
      result = result.filter((l) => l.command.risk === "normal");
    }

    if (userFilter !== "all") {
      result = result.filter((l) => String(l.user) === userFilter);
    }

    if (agentFilter !== "all") {
      result = result.filter((l) => String(l.agentName) === agentFilter);
    }

    if (sessionFilter !== "all") {
      result = result.filter((l) => String(l.sessionId) === sessionFilter);
    }

    if (selectedKeyword) {
      const needle = String(selectedKeyword).toLowerCase();
      result = result.filter((l) => (l.command?.cmd || "").toLowerCase().includes(needle));
    }

    return [...result].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [wordCloudSourceLogs, keywordFilterActive, selectedKeyword, selectedTimelinePoint, searchQuery, statusFilter, userFilter, agentFilter, sessionFilter, selectedCommandFilter]);

  const handleSelectKeyword = useCallback(
    (word) => {
      setSelectedKeyword((prev) => (prev === word ? null : word));
      setPage(1);
    },
    []
  );

  const clearKeywordFilter = useCallback(() => {
    setSelectedKeyword(null);
    setPage(1);
  }, []);

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

  const focusLogs = useCallback(() => {
    setPage(1);
    setTimeout(() => {
      if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
        try { logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
      }
    }, 100);
  }, []);

  const handleAgentSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const next = agentFilter === value ? "all" : value;
    setAgentFilter(next);
    if (next !== "all") focusLogs();
  }, [agentFilter, focusLogs]);

  const handleUserSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const next = userFilter === value ? "all" : value;
    setUserFilter(next);
    if (next !== "all") focusLogs();
  }, [userFilter, focusLogs]);

  const handleSessionSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const next = sessionFilter === value ? "all" : value;
    setSessionFilter(next);
    if (next !== "all") focusLogs();
  }, [sessionFilter, focusLogs]);

  const handleDangerousCommandClick = useCallback((item) => {
    const command = String(item?.label || "");
    const isCancel = selectedCommandFilter === command;
    if (isCancel) {
      setStatusFilter("all");
      setSelectedCommandFilter("");
    } else {
      setStatusFilter("suspicious");
      setSelectedCommandFilter(command);
      focusLogs();
    }
  }, [selectedCommandFilter, focusLogs]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = viewportWidth < 768;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateTimelineHeight = () => {
      if (isMobile) {
        setTimelineChartHeight(110);
        return;
      }

      const panelHeight = topAgentsPanelRef.current?.getBoundingClientRect().height;
      if (!panelHeight) return;

      const nextHeight = clamp(Math.round(panelHeight - 104), 180, 420);
      setTimelineChartHeight(nextHeight);
    };

    updateTimelineHeight();

    if (typeof ResizeObserver === "undefined" || !topAgentsPanelRef.current) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      updateTimelineHeight();
    });

    observer.observe(topAgentsPanelRef.current);
    return () => observer.disconnect();
  }, [isMobile, viewportWidth]);

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
      <div className="flex flex-col gap-4 w-full min-w-0">
        {/* Header */}
        <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">
              Host Monitoring
            </h1>
            <p className="text-[11px] text-[var(--soc-text-muted)] mt-0.5">
              Real-time Linux command auditing and user activity tracking
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            />
            <DateRangeFilter
              value={customDateRange}
              onChange={(range) => {
                setPage(1);
                setSelectedTimelinePoint(null);
                setCustomDateRange(range);
                setFilterMode("custom");
              }}
            />
            <div className="relative flex items-center bg-[var(--soc-card)] rounded-lg border border-[var(--soc-border)]">
              <select
                value={pageSize}
                onChange={(event) => {
                  setPage(1);
                  setPageSize(Number(event.target.value));
                  setTimeout(() => {
                    if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
                      try {
                        logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
                      } catch (e) {}
                    }
                  }, 100);
                }}
                className="appearance-none bg-transparent py-2 pl-2.5 pr-5 text-left text-[11px] font-medium leading-tight text-[var(--soc-text-primary)] focus:outline-none"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size} className="bg-[var(--soc-card)] text-[var(--soc-text-primary)]">{size}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--soc-text-muted)]" />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            Failed to fetch backend data: {error}
          </div>
        )}

        {/* KPI Cards — disamakan dengan MainDashboard (gambar 1): kpi-modern + stagger + p-2 icon wrapper */}
        <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-3">
          <div className="kpi-modern animate-fadeInUp stagger-1" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">Commands</span>
              <div className="p-2 rounded-lg text-purple-400 bg-opacity-10">
                <Terminal className="h-4 w-4 text-purple-400" />
              </div>
            </div>
            <div className="text-xl font-bold text-purple-400 mb-1">
              {loading ? <div className="skeleton h-6 w-16"></div> : new Intl.NumberFormat("en-US").format(Number(stats.totalCommands || 0))}
            </div>
            <div className="text-[9px] text-[var(--soc-text-muted)]">Linux commands monitored</div>
          </div>
          <div className="kpi-modern animate-fadeInUp stagger-2" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">Suspicious</span>
              <div className="p-2 rounded-lg text-pink-400 bg-opacity-10">
                <AlertTriangle className="h-4 w-4 text-pink-400" />
              </div>
            </div>
            <div className="text-xl font-bold text-pink-400 mb-1">
              {loading ? <div className="skeleton h-6 w-16"></div> : new Intl.NumberFormat("en-US").format(Number(stats.suspiciousCount || 0))}
            </div>
            <div className="text-[9px] text-[var(--soc-text-muted)]">Suspicious detected</div>
          </div>
          <div className="kpi-modern animate-fadeInUp stagger-3" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">Sessions</span>
              <div className="p-2 rounded-lg text-cyan-400 bg-opacity-10">
                <Users className="h-4 w-4 text-cyan-400" />
              </div>
            </div>
            <div className="text-xl font-bold text-cyan-400 mb-1">
              {loading ? <div className="skeleton h-6 w-16"></div> : new Intl.NumberFormat("en-US").format(Number(stats.uniqueSessions || 0))}
            </div>
            <div className="text-[9px] text-[var(--soc-text-muted)]">Unique sessions</div>
          </div>
          <div className="kpi-modern animate-fadeInUp stagger-4" style={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">Users</span>
              <div className="p-2 rounded-lg text-emerald-400 bg-opacity-10">
                <Activity className="h-4 w-4 text-emerald-400" />
              </div>
            </div>
            <div className="text-xl font-bold text-emerald-400 mb-1">
              {loading ? <div className="skeleton h-6 w-16"></div> : new Intl.NumberFormat("en-US").format(Number(stats.uniqueUsers || 0))}
            </div>
            <div className="text-[9px] text-[var(--soc-text-muted)]">Unique users</div>
          </div>
        </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Command Timeline — disamakan dengan Risk Distribution (Dashboard) */}
            <div className="xl:col-span-2 chart-card animate-fadeInUp stagger-1 flex flex-col" style={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-orange-500/10">
                    <Activity className="h-3.5 w-3.5 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Command Timeline</h3>
                    <p className="text-[9px] text-[var(--soc-text-muted)]">Commands executed by agents. Click a point to filter logs.</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-[var(--soc-text-muted)]">Last {rangeKey}</div>
                  <div className="text-[10px] font-semibold text-[var(--soc-text-muted)]">Updated {formatLiveTimestamp(lastUpdated)}</div>
                </div>
              </div>
              <div className="h-[220px]">
                <WaveChart
                  data={timelineData}
                  rangeKey={rangeKey}
                  height={220}
                  compact={isMobile}
                  activePointKey={selectedTimelinePoint?.key ?? null}
                  onPointSelect={handleTimelinePointSelect}
                />
              </div>
            </div>

            {/* Top 5 Agents — disamakan dengan Top Active Users (Dashboard) */}
            <div ref={topAgentsPanelRef} className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/10">
                    <Users className="h-3.5 w-3.5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Agents</h3>
                    <p className="text-[9px] text-[var(--soc-text-muted)]">Most active agents from host monitoring events</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[9px] text-[var(--soc-text-muted)]">Unique agents</span>
                <span className="text-[11px] font-bold text-[var(--soc-text-primary)]">{analytics.uniqueAgents}</span>
              </div>
              <TopAgentsCard agents={analytics.topAgents} onItemClick={handleAgentSummaryClick} activeName={agentFilter !== "all" ? agentFilter : null} />
            </div>
          </div>

          {/* Top Sessions + Top 5 Dangerous — disamakan dengan Command Timeline + Top 5 Agents (Dashboard: Risk + Top Users) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-w-0 max-w-full">
            <div className="xl:col-span-2 chart-card animate-fadeInUp stagger-1 flex flex-col min-w-0 max-w-full overflow-hidden" style={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-3 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-orange-500/10 shrink-0">
                    <MonitorPlay className="h-3.5 w-3.5 text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)] truncate">Top Sessions</h3>
                    <p className="text-[9px] text-[var(--soc-text-muted)] truncate">Most active sessions by command activity</p>
                  </div>
                </div>
              </div>
              <div className="w-full min-w-0 max-w-full min-h-0 overflow-hidden" style={{ height: 220 }}>
                <CategoryLineChart
                  items={analytics.topSessions}
                  color="#f97316"
                  totalLabel="sessions"
                  onPointClick={handleSessionSummaryClick}
                />
              </div>
            </div>

            <div className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/10">
                    <Users className="h-3.5 w-3.5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Active Users</h3>
                    <p className="text-[9px] text-[var(--soc-text-muted)]">Most active users by command execution</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-[var(--soc-text-muted)]">Unique</span>
                  <span className="ml-1 text-[11px] font-bold text-purple-400">{new Set((analyticsLogs.length ? analyticsLogs : logs).map(l=>l.user).filter(u=>u && u!=="-")).size}</span>
                </div>
              </div>
              {(() => {
                const items = analytics.topUsers || [];
                if (!items.length) return <InlineEmptyState title="No active user data" description="No user activity for the selected time range." />;
                const maxValue = Math.max(...items.map(d=>d.value), 1);
                const CHART_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
                return (
                  <div className="w-full min-w-0 max-w-full space-y-1.5">
                    {items.slice(0,5).map((item, i) => {
                      const color = item.color || CHART_COLORS[i % CHART_COLORS.length];
                      const label = item.label;
                      const value = item.value;
                      const isActive = userFilter !== "all" && String(userFilter) === String(label);
                      return (
                        <div key={label} onClick={() => handleUserSummaryClick(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg cursor-pointer ${isActive ? "bg-orange-500/10 ring-1 ring-orange-500/30" : ""}`} title={`Filter logs for ${label}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color }}>{i + 1}</span>
                              <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)]" title={label}>{label}</span>
                            </div>
                            <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(value)}</span>
                          </div>
                          <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(value / maxValue) * 100}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 chart-card animate-fadeInUp stagger-1 flex flex-col overflow-hidden" style={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10">
                    <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Command Keywords Distribution</h3>
                    <p className="text-[9px] text-[var(--soc-text-muted)]">Command payload keywords ranked by frequency</p>
                  </div>
                </div>
              </div>
              <div className="w-full h-[280px] shrink-0 overflow-hidden rounded-xl" style={{ background: "transparent" }}>
                <div className="w-full h-full rounded-xl overflow-hidden" style={{ background: "transparent" }}>
                  <PayloadWordCloud words={commandPayloadWords} activeWord={selectedKeyword} onWordClick={handleSelectKeyword} />
                </div>
              </div>
            </div>

            <div className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/10">
                    <AlertTriangle className="h-3.5 w-3.5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Dangerous Commands Executed</h3>
                    <p className="text-[9px] text-[var(--soc-text-muted)]">Most frequently executed dangerous commands</p>
                  </div>
                </div>
              </div>
              <CompactBarChart
                items={analytics.topSuspicious}
                emptyLabel="No suspicious command data found"
                onItemClick={handleDangerousCommandClick}
                activeValue={selectedCommandFilter ? selectedCommandFilter : null}
              />
            </div>
          </div>

        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg h-auto">
          <div ref={logsTableRef} className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
            <div className="flex gap-2 flex-wrap attack-logs-search soc-filter-row items-center">
              <div className="flex-1 min-w-0 basis-full sm:basis-0 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search user or command..."
                  value={searchQuery}
                  onChange={(e) => {
                    setPage(1);
                    setSelectedCommandFilter("");
                    setSearchQuery(e.target.value);
                  }}
                  className="w-full pl-10 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500"
                />
              </div>
              <CombinedFilter
                statusFilter={statusFilter}
                onStatusChange={(v) => { setPage(1); setStatusFilter(v); }}
                userFilter={userFilter}
                onUserChange={(v) => { setPage(1); setUserFilter(v); }}
                userOptions={filterOptions.users}
                agentFilter={agentFilter}
                onAgentChange={(v) => { setPage(1); setAgentFilter(v); }}
                agentOptions={filterOptions.agents}
                sessionFilter={sessionFilter}
                onSessionChange={(v) => { setPage(1); setSessionFilter(v); }}
                sessionOptions={filterOptions.sessions}
                commandFilterLabel={selectedCommandFilter}
                onResetCommandFilter={() => { setPage(1); setSelectedCommandFilter(""); setSearchQuery(""); }}
                dateFilterLabel={selectedTimelinePoint
                  ? formatTimelineBucketLabel(selectedTimelinePoint)
                  : urlStart && urlEnd
                    ? `${formatDetailedTimestamp(urlStart)} - ${formatDetailedTimestamp(urlEnd)}`
                    : ""}
                onResetDateFilter={() => {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.delete("start");
                  nextParams.delete("end");
                  setSearchParams(nextParams);
                  setSelectedTimelinePoint(null);
                  setFilterMode("range");
                  setRangeKey("24h");
                  setCustomDateRange(createDefaultDateRange(1));
                }}
              />
              <ExportCsvButton accent="orange" onClick={handleExportCsv} />
            </div>
          </div>

          {keywordFilterActive && (
            <div className="px-2 md:px-3 py-2 border-b border-[var(--soc-border)] bg-slate-900/40 flex flex-wrap items-center gap-1.5 md:gap-2">
              <span className="text-[10px] md:text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Active Filters:</span>
              {selectedKeyword && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] md:text-[11px] text-emerald-300">
                  Keyword: {selectedKeyword}
                  <button onClick={() => handleSelectKeyword(selectedKeyword)} className="hover:text-white" aria-label="Remove keyword filter"><X className="h-3 w-3" /></button>
                </span>
              )}
              <span className="text-[10px] md:text-[11px] font-mono text-slate-400">
                <span className="font-bold text-sky-300">{(crossFilteredLogs || []).length.toLocaleString()}</span>
                <span className="hidden sm:inline"> matching logs</span>
              </span>
              <button
                onClick={clearKeywordFilter}
                className="ml-auto text-[10px] md:text-[11px] font-semibold text-slate-300 hover:text-sky-300 border border-slate-700 rounded-full px-2 py-0.5 hover:border-sky-500/50 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}

          <div className="overflow-x-auto soc-table-scroll">
            <table className="w-full min-w-[720px] text-[10px] md:text-[11px] text-left soc-responsive-table">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  {["time", "user", "agent", "session id", "command", "status"].map((header) => (
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
                {(keywordFilterActive ? crossFilteredLogs || [] : filteredLogs).length > 0 ? (
                  (keywordFilterActive ? crossFilteredLogs || [] : filteredLogs).map((log, idx) => (
                    <tr
                      key={log.id}
                      className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${idx % 2 !== 0 ? "bg-slate-900/60" : ""
                        }`}
                    >
                      <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-500 text-[10px] md:text-[11px]">
                        {new Date(log.timestamp).toLocaleString("en-US", {
                          month: "short",
                          day: "2-digit",
                          year: "numeric",
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
                      <td className="px-2 md:px-4 py-1.5 md:py-3 align-top max-w-[200px] sm:max-w-[260px] md:max-w-[360px] lg:max-w-[420px]">
                        <div className="truncate max-w-[200px] sm:max-w-[260px] md:max-w-[360px] lg:max-w-[420px] overflow-hidden text-ellipsis whitespace-nowrap" title={log.command.cmd}>
                          <CommandHighlighter command={log.command.cmd} />
                        </div>
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
                      {keywordFilterActive ? (
                        <div className="flex flex-col items-center gap-2">
                          <div>
                            <p className="text-[10px] font-semibold text-[var(--soc-text-secondary)]">No logs match the selected filters</p>
                            <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">Try adjusting the selected filters.</p>
                          </div>
                          <button onClick={clearKeywordFilter} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-semibold text-slate-300 hover:border-sky-500/50 hover:text-sky-300 transition-colors">Clear filters</button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] font-semibold text-[var(--soc-text-secondary)]">No audit log entries found</p>
                          <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">No audit log entries match the current filter.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            pagination={keywordFilterActive
              ? (crossFilteredLogs || []).length > 0
                ? { total: (crossFilteredLogs || []).length, totalPages: 1, limit: (crossFilteredLogs || []).length }
                : { total: 0, totalPages: 1, limit: pageSize }
              : pagination || { total: filteredLogs.length, totalPages: 1, limit: pageSize }}
            page={keywordFilterActive ? 1 : page}
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
