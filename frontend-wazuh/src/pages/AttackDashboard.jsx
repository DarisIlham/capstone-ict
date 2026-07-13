import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "../components/Navbar";
import {
  Search,
  AlertTriangle,
  Clock,
  Terminal,
  Activity,
  RefreshCw,
} from "lucide-react";

// ========================================
// Range Filter Component
// ========================================
const RangeFilter = ({ rangeKey, onRangeChange }) => (
  <div className="flex items-center gap-1 md:gap-2">
    <span className="hidden sm:inline text-xs text-slate-500">Range</span>
    <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700 gap-0.5">
      {['1h', '24h', '7d', '30d'].map((k) => (
        <button
          key={k}
          onClick={() => onRangeChange(k)}
          className={`px-1.5 md:px-2.5 py-0.5 md:py-1 text-xs rounded-sm ${rangeKey === k ? 'bg-sky-600 text-white' : 'text-slate-400'}`}
        >
          {k}
        </button>
      ))}
    </div>
  </div>
);

const SUSPICIOUS_HIGHLIGHT_KEYWORDS = [
  'rm',
  'curl',
  'wget',
  'nc',
  'chmod',
  'bash',
  'sh',
  'sudo',
  'dd',
  'cat',
  '/etc/shadow',
  '/etc/passwd',
  'base64',
  'eval',
  '|',
  '&',
  ';',
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

function getTooltipPosition(point, chartWidth, chartHeight) {
  const rawLeft = (point.x / chartWidth) * 100;
  const nearLeft = rawLeft < 16;
  const nearRight = rawLeft > 84;
  const placeBelow = point.y < 78;
  const left = clamp(rawLeft, 3, 97);
  const top = placeBelow
    ? clamp(((point.y + 18) / chartHeight) * 100, 3, 88)
    : clamp(((point.y - 18) / chartHeight) * 100, 10, 97);

  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(${nearLeft ? "0" : nearRight ? "-100%" : "-50%"}, ${placeBelow ? "0" : "-100%"})`,
  };
}

const WaveChart = ({ data, rangeKey = "24h", height = 80, compact = false, activePointKey = null, onPointSelect }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const chartRef = useRef(null);
  const baseWidth = compact ? 620 : 800;
  const [chartWidth, setChartWidth] = useState(baseWidth);
  const width = chartWidth;
  const chartHeight = Math.max(compact ? 220 : 240, height);
  const padding = { l: 58, r: 24, t: 20, b: 56 };
  const innerW = width - padding.l - padding.r;
  const innerH = chartHeight - padding.t - padding.b;

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return undefined;

    const updateWidth = () => {
      const rect = node.getBoundingClientRect();
      const nextWidth = Math.max(compact ? 620 : 320, Math.round(rect.width || baseWidth));
      setChartWidth((current) => (current === nextWidth ? current : nextWidth));
      setHoveredPoint((current) => (current ? null : current));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [baseWidth, compact]);

  if (!data || data.length === 0) {
    return (
      <div ref={chartRef} className="relative w-full overflow-visible" style={{ height: chartHeight }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${chartHeight}`} className="block overflow-visible">
          <text x={width / 2} y={chartHeight / 2} textAnchor="middle" fontSize="12" fill="#64748b">No data</text>
        </svg>
      </div>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => d.v));
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : 0;
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
  const tooltipPosition = hoveredPoint ? getTooltipPosition(hoveredPoint, width, chartHeight) : null;

  return (
    <div
      ref={chartRef}
      className="relative w-full overflow-visible"
      style={{ height: chartHeight }}
      onMouseLeave={() => setHoveredPoint(null)}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${chartHeight}`} className="block overflow-visible">
        {gridLines.map((gl) => (
          <g key={`grid-${gl.ratio}`}>
            <line x1={padding.l} y1={gl.y} x2={padding.l + innerW} y2={gl.y} stroke="#334155" strokeDasharray="2,2" opacity="0.5" />
            <text x={padding.l - 7} y={gl.y + 3} textAnchor="end" fontSize="9" fill="#64748b" fontWeight="600">{gl.value}</text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="#334155" />
        <text
          x={padding.l + innerW / 2}
          y={chartHeight - 12}
          textAnchor="middle"
          fontSize="11"
          fill="#64748b"
          fontWeight="700"
        >
          Time Bucket
        </text>
        <text
          x={-(padding.t + innerH / 2)}
          y="15"
          transform="rotate(-90)"
          textAnchor="middle"
          fontSize="11"
          fill="#64748b"
          fontWeight="700"
        >
          Command Count
        </text>
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
            bucketMs: bucketMsForPoint,
          };
          const isHovered = hoveredPoint?.key === pointKey;
          const isActive = activePointKey === pointKey;
          const isHighlighted = isHovered || isActive;
          return (
            <g key={pointKey}>
              {isHighlighted && (
                <circle cx={x} cy={y} r="8" fill="#0f172a" stroke={isActive ? "#fb923c" : "#f97316"} strokeWidth="1.5" opacity="0.95" className="pointer-events-none" />
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
              <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="#334155" />
              <text x={x} y={padding.t + innerH + 17} textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"} fontSize="8" fill="#64748b">{label}</text>
            </g>
          );
        })}
      </svg>
      {hoveredPoint && (
        <div className="pointer-events-none absolute z-50 min-w-[120px] max-w-[220px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg" style={tooltipPosition}>
          <div className="font-semibold text-white">{hoveredPoint.value} commands</div>
          <div className="mt-1 text-slate-400">{formatDetailedTimestamp(hoveredPoint.start || hoveredPoint.time)}</div>
        </div>
      )}
    </div>
  );
};

const Donut = ({ items, size = 120, stroke = 12, centerLabelTop, centerLabelBottom, centerFontTop, centerFontBottom, compact = false }) => {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const fontTop = centerFontTop ?? (compact ? 10 : Math.max(11, Math.round(size * 0.09)));
  const fontBottom = centerFontBottom ?? (compact ? 7 : Math.max(8, Math.round(size * 0.06)));
  const topY = compact ? -1 : -Math.round(fontTop / 2);
  const bottomY = compact ? 10 : Math.round(fontBottom * 1.1);

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
        <text y={topY} textAnchor="middle" fontSize={fontTop} fill="#f1f5f9" fontWeight="700">
          {centerLabelTop}
        </text>
        <text y={bottomY} textAnchor="middle" fontSize={fontBottom} fill="#64748b">
          {centerLabelBottom}
        </text>
      </g>
    </svg>
  );
};

const Legend = ({ items }) => (
  <div className="flex flex-wrap gap-3 w-full justify-center">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-1.5 text-base text-slate-400">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
        <span>{it.label}</span>
        <span className="text-slate-500 font-mono">{it.value}</span>
      </div>
    ))}
  </div>
);

const CompactBarChart = ({ items, emptyLabel = "No data available" }) => {
  if (!items || items.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const maxValue = Math.max(...items.map((d) => d.value), 1);

  return (
    <div className="space-y-4 md:space-y-6">
      {items.map((item, i) => (
        <div key={item.label} className="flex flex-col gap-2 md:gap-3">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-6">
              <span className="text-sm md:text-base font-bold text-slate-400">#{i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm md:text-sm font-mono text-slate-300 truncate" title={item.label}>
                {item.label}
              </p>
            </div>
            <span className="text-sm md:text-sm font-bold text-slate-300">{item.value}x</span>
          </div>
          <div className="flex items-center gap-2 ml-6 md:ml-8">
            <div className="flex-1 bg-slate-800/50 rounded-full h-5 md:h-6 overflow-hidden border border-slate-700/30">
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

const TopAgentsCard = ({ agents }) => {
  if (!agents || agents.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-600">No agent data</div>;
  }
  const peak = Math.max(...agents.map((a) => a.value), 1);
  const COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];
  return (
    <div className="flex flex-col gap-2.5">
      {agents.map((agent, idx) => {
        const accent = COLORS[idx % COLORS.length];
        const fill = Math.max(10, Math.round((agent.value / peak) * 100));
        return (
          <div key={agent.label} className="rounded-xl border border-slate-700/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black" style={{ backgroundColor: `${accent}1f`, color: accent }}>
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">{agent.label}</div>
                  <div className="text-[11px] text-slate-500">
                    Last seen {formatDetailedTimestamp(agent.lastSeen)}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-black" style={{ color: accent }}>{agent.value}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">events</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full" style={{ width: `${fill}%`, background: accent }} />
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
          <div className="text-xs font-mono text-slate-500">
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
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">FIRST</span>
            <span className="md:hidden">«</span>
          </button>
          <button
            disabled={page === 1 || loading}
            onClick={() => onPageChange(Math.max(page - 1, 1))}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">← PREV</span>
            <span className="md:hidden">‹</span>
          </button>
          <span className="px-1 text-xs font-black text-slate-400">
            <span className="hidden md:inline">PAGE </span>
            <span className="text-white">{page}</span> / {totalPages}
          </span>
          <button
            disabled={page === totalPages || loading}
            onClick={() => onPageChange(Math.min(page + 1, totalPages))}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">NEXT →</span>
            <span className="md:hidden">›</span>
          </button>
          <button
            disabled={page === totalPages || loading}
            onClick={() => onPageChange(totalPages)}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
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
const CommandHighlighter = ({ command, compact = false }) => {
  const raw = String(command || "");
  const maxLen = compact ? 240 : Infinity; // allow more chars in the wider command column
  const display = raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw;
  const parts = display.split(/(\s+)/);

  return (
    <code
      className={`text-xs font-mono ${compact ? "block truncate max-w-[240ch]" : "inline"}`}
      title={raw}
    >
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

const PayloadWordCloud = ({ words, fitHeight = false }) => {
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
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className={`command-word-cloud block w-full ${fitHeight ? "h-full" : ""}`} style={{ minHeight: fitHeight ? 0 : 140 }}>
      <defs><radialGradient id="wcGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0f172a" stopOpacity="0" /><stop offset="100%" stopColor="#020617" stopOpacity="0.6" /></radialGradient></defs>
      <rect className="command-word-cloud-bg" width={W} height={H} fill="url(#wcGlow)" rx={8} />
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

function getCommandDashboardTimeRange(rangeKey, selectedTimelinePoint = null, nowDate = new Date()) {
  if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
    return {
      start: selectedTimelinePoint.start,
      end: selectedTimelinePoint.end,
    };
  }

  const minutes = RANGE_TO_MINUTES[rangeKey] || RANGE_TO_MINUTES["24h"];
  const endDate = nowDate;
  const startDate = new Date(endDate.getTime() - minutes * 60 * 1000);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function applyCommandDashboardFilters(
  params,
  { searchUser, searchCommand, suspiciousOnly, timeRange },
  { forceSuspicious = false } = {}
) {
  if (searchUser.trim()) {
    params.set("user", searchUser.trim());
  }

  if (searchCommand.trim()) {
    params.set("contains", searchCommand.trim());
  }

  if (forceSuspicious || suspiciousOnly) {
    params.set("suspicious", "true");
  }

  if (timeRange?.start) {
    params.set("start", timeRange.start);
  }

  if (timeRange?.end) {
    params.set("end", timeRange.end);
  }
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
  const [searchUser, setSearchUser] = useState("");
  const [searchCommand, setSearchCommand] = useState("");
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(null);
  const [rangeKey, setRangeKey] = useState("24h");
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
  const [timelineChartHeight, setTimelineChartHeight] = useState(300);
  const [commandKeywordsPanelHeight, setCommandKeywordsPanelHeight] = useState(null);

  const logsTableRef = useRef(null);
  const topAgentsContentRef = useRef(null);
  const timelineHeaderRef = useRef(null);
  const dangerousCommandsContentRef = useRef(null);

  const loadDashboardData = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
    });
    const statsParams = new URLSearchParams();
    const analyticsParams = new URLSearchParams({
      page: "1",
      limit: String(ANALYTICS_LIMIT),
    });
    const dangerousParams = new URLSearchParams({
      page: "1",
      limit: String(ANALYTICS_LIMIT),
    });

    const minutes = RANGE_TO_MINUTES[rangeKey] || RANGE_TO_MINUTES["24h"];
    const requestNow = new Date();
    const tableTimeRange = getCommandDashboardTimeRange(rangeKey, selectedTimelinePoint, requestNow);
    const timelineTimeRange = getCommandDashboardTimeRange(rangeKey, null, requestNow);
    const commonFilters = {
      searchUser,
      searchCommand,
      suspiciousOnly,
      timeRange: tableTimeRange,
    };
    const timelineFilters = {
      searchUser,
      searchCommand,
      suspiciousOnly,
      timeRange: timelineTimeRange,
    };
    const timelineParams = new URLSearchParams({
      minutes: String(minutes),
    });

    applyCommandDashboardFilters(params, commonFilters);
    applyCommandDashboardFilters(statsParams, commonFilters);
    applyCommandDashboardFilters(analyticsParams, commonFilters);
    applyCommandDashboardFilters(dangerousParams, commonFilters, { forceSuspicious: true });
    applyCommandDashboardFilters(timelineParams, timelineFilters);

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
  }, [page, pageSize, rangeKey, searchCommand, searchUser, selectedTimelinePoint, suspiciousOnly]);

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
    const sourceLogs = analyticsLogs.length ? analyticsLogs : logs;
    const suspiciousSourceLogs = dangerousLogs.length
      ? dangerousLogs
      : sourceLogs.filter((log) => log.command.risk === "suspicious");
    const backendAgentTotal = Number(backendStats?.totalAgents ?? backendStats?.uniqueAgents);
    const uniqueAgents = Number.isFinite(backendAgentTotal) && backendAgentTotal > 0
      ? backendAgentTotal
      : new Set(
        sourceLogs
        .map((log) => log.agentName)
        .filter((agentName) => agentName && agentName !== "-")
      ).size;

    const topUsersSource = backendStats?.users?.length
      ? backendStats.users
      : countBy(sourceLogs, (log) => log.user);
    const topUsers = topUsersSource
      .slice(0, 5)
      .map((it, i) => ({
        label: it.user || it.label,
        value: Number(it.count ?? it.value ?? 0),
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

    let topAgents = [];
    if (backendStats?.agents?.length) {
      topAgents = backendStats.agents
        .slice(0, 5)
        .map((it, i) => ({
          label: it.agentName || it.label,
          value: Number(it.count ?? it.value ?? 0),
          lastSeen: it.lastSeen || new Date().toISOString(),
          color: CHART_COLORS[i % CHART_COLORS.length],
        }));
    } else {
      // Top agents should be derived from the same agent label shown in the table.
      const agentMap = new Map();
      for (const log of sourceLogs) {
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
      topAgents = Array.from(agentMap.values())
        .sort((a, b) => b.value - a.value || b.lastSeen - a.lastSeen)
        .slice(0, 5)
        .map((it, i) => ({
          label: it.label,
          value: it.value,
          lastSeen: it.lastSeen ? new Date(it.lastSeen).toISOString() : new Date().toISOString(),
          color: CHART_COLORS[i % CHART_COLORS.length],
        }));
    }

    const topSuspiciousSource = backendStats?.topDangerousCommands?.length
      ? backendStats.topDangerousCommands.map((it) => ({
        label: it.command || it.label,
        value: Number(it.count ?? it.value ?? 0),
      }))
      : countBy(
        suspiciousSourceLogs
          .filter((l) => l.command.risk === "suspicious")
          .map((l) => l.command.cmd),
        (cmd) => cmd
      );
    const topSuspicious = topSuspiciousSource
      .slice(0, 5)
      .map((it, i) => ({
        ...it,
        color: ["#ef4444", "#f97316", "#eab308", "#a78bfa", "#f87171"][i % 5],
      }));

    const riskIndicatorSource = backendStats?.riskIndicators?.length
      ? backendStats.riskIndicators.map((it) => ({
        label: it.indicator || it.label,
        value: Number(it.count ?? it.value ?? 0),
      }))
      : countBy(
        suspiciousSourceLogs.flatMap((log) => log.command.indicator),
        (indicator) => indicator
      );
    const riskIndicators = riskIndicatorSource
      .map((it, i) => ({
        ...it,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

    return { topUsers, topAgents, topSuspicious, riskIndicators, uniqueAgents };
  }, [analyticsLogs, backendStats, dangerousLogs, logs]);

  const wordCloudSourceLogs = useMemo(() => {
    const merged = new Map();

    [...analyticsLogs, ...dangerousLogs, ...logs].forEach((log) => {
      if (!log?.id) return;
      merged.set(log.id, log);
    });

    return Array.from(merged.values());
  }, [analyticsLogs, dangerousLogs, logs]);

  const commandPayloadWords = useMemo(() => {
    if (backendStats?.commandKeywords?.length) {
      return backendStats.commandKeywords
        .map((it) => ({
          text: it.keyword || it.text || it.label,
          count: Number(it.count ?? it.value ?? 0),
        }))
        .filter((it) => it.text && it.count > 0)
        .slice(0, 40);
    }

    return extractHighlightedCommandKeywords(wordCloudSourceLogs);
  }, [backendStats, wordCloudSourceLogs]);

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
  }, [logs, searchUser, searchCommand, selectedTimelinePoint, suspiciousOnly]);

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
        } catch {
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
  const isCommandPanelsSideBySide = viewportWidth >= 1024;
  const isTablet = viewportWidth < 1024;
  const donutSize = isMobile ? 148 : isTablet ? 190 : 280;
  const donutStroke = isMobile ? 16 : isTablet ? 18 : 24;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateTimelineHeight = () => {
      if (isMobile) {
        setTimelineChartHeight(220);
        return;
      }

      const topAgentsHeight = topAgentsContentRef.current?.getBoundingClientRect().height;
      const timelineHeaderHeight = timelineHeaderRef.current?.getBoundingClientRect().height || 0;
      if (!topAgentsHeight) return;

      const headerGap = viewportWidth >= 768 ? 24 : 16;
      const chartFramePadding = viewportWidth >= 768 ? 32 : 16;
      const nextHeight = Math.max(
        240,
        Math.min(Math.round(topAgentsHeight - timelineHeaderHeight - headerGap - chartFramePadding), 460)
      );
      setTimelineChartHeight(nextHeight);
    };

    updateTimelineHeight();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(updateTimelineHeight);
    if (topAgentsContentRef.current) observer.observe(topAgentsContentRef.current);
    if (timelineHeaderRef.current) observer.observe(timelineHeaderRef.current);
    return () => observer.disconnect();
  }, [isMobile, viewportWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateCommandKeywordsHeight = () => {
      if (!isCommandPanelsSideBySide) {
        setCommandKeywordsPanelHeight(null);
        return;
      }

      const contentHeight = dangerousCommandsContentRef.current?.getBoundingClientRect().height;
      if (!contentHeight) return;

      const nextHeight = Math.round(contentHeight);
      setCommandKeywordsPanelHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight
      );
    };

    updateCommandKeywordsHeight();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(updateCommandKeywordsHeight);
    if (dangerousCommandsContentRef.current) observer.observe(dangerousCommandsContentRef.current);
    return () => observer.disconnect();
  }, [analytics.topSuspicious.length, isCommandPanelsSideBySide]);

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
          } catch {
            // ignore scroll errors
          }
        }
      }, 100);
    },
    [pagination?.totalPages]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-2 md:p-4 flex flex-col gap-3 md:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl p-3 md:p-4 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <Terminal className="h-5 md:h-6 w-5 md:w-6 text-orange-400" />
                Command Monitoring
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-1">
                Real-time Linux command auditing and user activity tracking
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl p-2 md:p-4 shadow-lg flex flex-col gap-3 md:gap-4">
          <div className="flex items-center justify-between gap-1 md:gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={loadDashboardData}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 transition-colors border border-slate-700 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>

              <label className="flex items-center gap-2 text-xs text-slate-400">
                <span className="hidden sm:inline">Rows</span>
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
                        } catch {
                          // ignore
                        }
                      }
                    }, 100);
                  }}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            </div>

            <RangeFilter
              rangeKey={rangeKey}
              onRangeChange={(nextRange) => {
                if (rangeKey !== nextRange) {
                  setPage(1);
                  setSelectedTimelinePoint(null);
                  setRangeKey(nextRange);
                }
              }}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Gagal mengambil data backend: {error}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className="bg-slate-800/50 border border-slate-700/60 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-slate-500 uppercase font-semibold">Commands</div>
              <div className="text-lg md:text-2xl font-black text-orange-400 mt-0.5 md:mt-1">
                {loading ? "..." : stats.totalCommands}
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-red-400 uppercase font-semibold">Suspicious</div>
              <div className="text-lg md:text-2xl font-black text-red-300 mt-0.5 md:mt-1">
                {loading ? "..." : stats.suspiciousCount}
              </div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-emerald-400 uppercase font-semibold">Safe Commands</div>
              <div className="text-lg md:text-2xl font-black text-emerald-300 mt-0.5 md:mt-1">
                {loading ? "..." : Math.max(stats.totalCommands - stats.suspiciousCount, 0)}
              </div>
            </div>
            <div className="bg-sky-500/10 border border-sky-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-sky-400 uppercase font-semibold">Users</div>
              <div className="text-lg md:text-2xl font-black text-sky-300 mt-0.5 md:mt-1">
                {loading ? "..." : stats.uniqueUsers}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 items-stretch">
            <div className="bg-slate-800/30 border border-slate-800/50 rounded-lg p-4 md:p-6 flex flex-col h-full overflow-visible">
              <div ref={timelineHeaderRef} className="flex justify-between items-center mb-4 md:mb-6 gap-2">
                <div className="text-xs md:text-sm font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                  <Activity className="h-3 md:h-4 w-3 md:w-4 text-orange-400" />
                  Command Timeline
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Last {rangeKey}</div>
                  <div className="text-[11px] text-slate-600">Updated {formatLiveTimestamp(lastUpdated)}</div>
                </div>
              </div>
              <div className="flex-1 rounded-lg border border-slate-800/40 p-2 md:p-4 overflow-x-auto overflow-y-visible">
                <div className={isMobile ? "min-w-[620px]" : "min-w-0"}>
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

            <div className="bg-slate-800/30 border border-slate-800/50 rounded-lg p-4 md:p-6 h-full">
              <div ref={topAgentsContentRef}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs md:text-sm font-semibold text-slate-300">Top 5 Agents</div>
                    <div className="mt-1 text-[11px] text-slate-500">Most active agents from command monitoring events</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Unique agents</div>
                    <div className="text-sm font-black text-emerald-300">{analytics.uniqueAgents}</div>
                  </div>
                </div>
                <TopAgentsCard agents={analytics.topAgents} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4 flex flex-col">
              <div className="text-xs md:text-sm font-semibold text-slate-300 mb-4">Active Users</div>
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-6 w-full">
                  <Donut
                    items={analytics.topUsers}
                    size={donutSize}
                    stroke={donutStroke}
                    centerLabelTop={stats.uniqueUsers}
                    centerLabelBottom="users"
                    compact={isMobile}
                  />
                  <div className="w-full text-base">
                    <Legend items={analytics.topUsers} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4">
              <div className="text-xs md:text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Top 5 Dangerous Commands Executed
              </div>
              <div ref={dangerousCommandsContentRef} className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50 min-h-[220px] md:min-h-[300px]">
                <CompactBarChart items={analytics.topSuspicious} emptyLabel="No suspicious command data found" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4 shadow-lg w-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs md:text-sm font-semibold text-slate-300">Risk Indicators</div>
            </div>

            <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-32 md:gap-40 w-full xl:w-auto">

              {/* Donut 2 - Risk Indicators */}
              <div className="flex flex-col items-center gap-6 w-full sm:w-auto">
                <Donut
                  items={analytics.riskIndicators.slice(0, 5)}
                  size={donutSize}
                  stroke={donutStroke}
                  centerLabelTop={analytics.riskIndicators.reduce((sum, r) => sum + r.value, 0)}
                  centerLabelBottom="risks"
                  compact={isMobile}
                />
                <div className="w-full text-base">
                  <Legend items={analytics.riskIndicators.slice(0, 5)} />
                </div>
              </div>
            </div>
          </div>
          </div>
            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4">
              <div className="text-xs md:text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Command Keywords Distribution
              </div>
              <div
                className="command-keywords-distribution-box w-full overflow-x-auto overflow-y-hidden bg-slate-950 border border-slate-800 rounded-lg p-2 md:p-4"
                style={commandKeywordsPanelHeight ? { height: commandKeywordsPanelHeight } : undefined}
              >
                <div className="h-full min-w-[520px] md:min-w-0">
                  <PayloadWordCloud words={commandPayloadWords} fitHeight={Boolean(commandKeywordsPanelHeight)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl shadow-lg overflow-hidden">
          <div ref={logsTableRef} className="p-3 md:p-4 border-b border-slate-800 bg-slate-800/50">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs md:text-sm font-semibold text-slate-300">
                  Audit Log Entries ({pagination?.total ?? filteredLogs.length})
                </div>
                {selectedTimelinePoint && (
                  <div className="mt-1 text-xs text-orange-300">
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
                  placeholder="Filter by user..."
                  value={searchUser}
                  onChange={(e) => {
                    setPage(1);
                    setSearchUser(e.target.value);
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <div className="flex-1 min-w-64 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search command..."
                  value={searchCommand}
                  onChange={(e) => {
                    setPage(1);
                    setSearchCommand(e.target.value);
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <button
                onClick={() => {
                  setPage(1);
                  setSuspiciousOnly(!suspiciousOnly);
                }}
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

          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  {["waktu", "user", "hostname", "session id", "command", "status"].map((header) => (
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
                      <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-500 text-xs">
                        {new Date(log.timestamp).toLocaleString("en-US", {
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-3">
                        <span className="text-xs font-bold text-sky-300">{log.user}</span>
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-3 text-xs text-slate-400">{log.agentName}</td>
                      <td className="px-2 md:px-4 py-1.5 md:py-3">
                        <button
                          onClick={() =>
                            setSelectedSession(selectedSession === log.sessionId ? null : log.sessionId)
                          }
                          className="text-xs font-mono text-purple-300 hover:text-purple-200 transition-colors"
                        >
                          {log.sessionId}
                        </button>
                      </td>
                      <td style={{ width: '60%' }} className="pl-2 md:pl-3 pr-6 md:pr-15 py-1.5 md:py-3 min-w-0">
                        <CommandHighlighter command={log.command.cmd} compact />
                      </td>
                      <td className="pl-0 md:pl-1 pr-2 md:pr-3 py-1.5 md:py-3">
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
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-2 md:px-4 py-10 text-center text-xs md:text-sm text-slate-500">
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
                  } catch {
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
