import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, CalendarRange, ChevronDown, FileText, Search, X } from "lucide-react";
import { API_BASE_URL } from "../config/Api";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import {
  createDefaultDateRange,
  normalizeDateRange,
  getIsoDateRange,
  toDateTimeLocalValue,
} from "../utils/dateRange";

// ----------------------------
// Small, dependency-free charts (SVG Components)
// ----------------------------
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const formatBucketLabel = (ms, rangeKey) => {
  const d = new Date(ms);
  if (rangeKey === "1h") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (rangeKey === "24h") return d.toLocaleTimeString("en-US", { hour: "2-digit" });
  if (rangeKey === "7d") return d.toLocaleString("en-US", { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

const formatDetailedTimestamp = (timestamp) =>
  new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const WaveChart = ({ data, color = "#10b981", height = 80, rangeKey, compact = false, activePointKey = null, onPointSelect = null }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const width = 800;
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  if (!data || data.length === 0) {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="12" fill="#64748b">No data</text>
      </svg>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => d.v));
  const pointSpacing = data.length ? innerW / (data.length - 1) : innerW;
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
    <div className="relative h-full w-full" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        {gridLines.map((gl) => (
          <g key={`grid-${gl.ratio}`}>
            <line x1={padding.l} y1={gl.y} x2={padding.l + innerW} y2={gl.y} stroke="var(--soc-border)" strokeDasharray="2,2" opacity="0.5" />
            <text x={padding.l - 5} y={gl.y + 3} textAnchor="end" fontSize="8" fill="#64748b">{gl.value}</text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" />
        <path d={pathD} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <defs>
          <linearGradient id="fimWaveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill="url(#fimWaveGradient)" />
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
             start: new Date(Number(d.t)).toISOString(),
             end: new Date(Number(d.t) + bucketMsForPoint - 1).toISOString(),
             bucketMs: bucketMsForPoint,
           };

           const isHovered = selectedPoint?.index === i;
           const isActive = (activePointKey !== null && typeof activePointKey !== "undefined") ? String(activePointKey) === pointKey : false;
           const isHighlighted = isHovered || isActive;

           // Visual circle radius adapts to density; hit-area only used when interactive states apply.
           const visualR = isHighlighted ? (isDense ? "5" : "7") : `${denseVisualR}`;
           const hitR = isHighlighted || isHovered ? (isDense ? "7" : "10") : `${denseHitR}`;

           return (
             <g key={`point-${pointKey}`}>
               {isActive && (
                 <circle
                   cx={x}
                   cy={y}
                   r={isDense ? "5" : "7.5"}
                   fill="transparent"
                   stroke="#34d399"
                   strokeWidth="1.5"
                   opacity="0.85"
                   className="pointer-events-none"
                 />
               )}
               <circle
                 cx={x}
                 cy={y}
                 r={hitR}
                 fill="transparent"
                 className="cursor-pointer"
                 role="button"
                 tabIndex={0}
                 aria-label={`Filter events for ${formatDetailedTimestamp(pointData.start)}`}
                 onClick={() => onPointSelect?.(pointData)}
                 onMouseEnter={() => setSelectedPoint(pointData)}
                 onMouseLeave={() => setSelectedPoint(null)}
                 onFocus={() => setSelectedPoint(pointData)}
                 onBlur={() => setSelectedPoint(null)}
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
                 fill={isActive ? "#34d399" : color}
                 stroke={isActive ? "#34d399" : color}
                 strokeWidth={isDense ? "0.75" : "1.5"}
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
                fontSize="8"
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
          className="pointer-events-none absolute z-10 min-w-[120px] max-w-[220px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`,
            top: `${Math.max(((selectedPoint.y - 40) / height) * 100, 6)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-white">{selectedPoint.value} events</div>
          <div className="mt-1 text-slate-400">{formatDetailedTimestamp(selectedPoint.time)}</div>
        </div>
      )}
    </div>
  );
};

const SimpleBarHistogram = ({ data, width = 800, height = 65, rangeKey }) => {
  const maxV = Math.max(1, ...data.map((d) => d.v));
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const barW = data.length ? innerW / data.length : innerW;
  const tickCount = clamp(Math.floor(innerW / 160), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
      <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" />
      <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" />
      {data.map((d, i) => {
        const h = (d.v / maxV) * innerH;
        const x = padding.l + i * barW;
        const y = padding.t + (innerH - h);
        return (
          <g key={d.t}>
            <rect x={x + 1} y={y} width={Math.max(1, barW - 2)} height={h} rx={2} fill="#38bdf8" opacity={0.75}>
              <title>{`${new Date(d.t).toLocaleString()} — ${d.v} events`}</title>
            </rect>
          </g>
        );
      })}
      <text x={padding.l - 5} y={padding.t + 8} textAnchor="end" fontSize="9" fill="#64748b">{maxV}</text>
      <text x={padding.l - 5} y={padding.t + innerH} textAnchor="end" fontSize="9" fill="#64748b">0</text>
      {data.map((d, i) => {
        if (i % tickEvery !== 0) return null;
        const x = padding.l + i * barW + barW / 2;
        return (
          <g key={`tick-${d.t}`}>
            <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="var(--soc-border)" />
            <text x={x} y={padding.t + innerH + 15} textAnchor="middle" fontSize="9" fill="#64748b">{formatBucketLabel(d.t, rangeKey)}</text>
          </g>
        );
      })}
    </svg>
  );
};

const Donut = ({ items, size = 140, stroke = 14, centerLabelTop, centerLabelBottom, compact = false }) => {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`translate(${size / 2} ${size / 2})`}>
        <circle r={r} fill="transparent" stroke="var(--soc-border)" strokeWidth={stroke} />
        {items.map((it, idx) => {
          const currentOffset = items.slice(0, idx).reduce((acc, prev) => acc + (prev.value / total) * c, 0);
          const dash = (it.value / total) * c;
          const strokeDashoffset = -currentOffset;

          return (
            <circle
              key={it.label}
              r={r}
              fill="transparent"
              stroke={it.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90)"
              strokeLinecap="butt"
            >
              <title>{`${it.label}: ${it.value}`}</title>
            </circle>
          );
        })}
        <text y={compact ? -2 : -4} textAnchor="middle" fontSize={compact ? "14" : "18"} fill="#f1f5f9" fontWeight="700">{centerLabelTop}</text>
        <text y={compact ? 13 : 16} textAnchor="middle" fontSize={compact ? "10" : "12"} fill="#64748b">{centerLabelBottom}</text>
      </g>
    </svg>
  );
};

const Legend = ({ items }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 w-full min-w-0 justify-center">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-1 text-[10px] text-slate-400">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
        <span className="truncate min-w-0 max-w-[10rem]">{it.label}</span>
        <span className="text-slate-500 tabular-nums shrink-0">{it.value}</span>
      </div>
    ))}
  </div>
);

// ── Domain Colors ────────────────────────────────────────────────────────────
const DOMAIN_COLORS = ["#f472b6", "#38bdf8", "#4ade80", "#a78bfa", "#fb923c", "#34d399", "#f87171", "#facc15", "#60a5fa", "#e879f9"];

// ── Domain Horizontal Bar Chart (Modern Design) ────
const DomainBarChart = ({ domains }) => {
  if (!domains || domains.length === 0) return <div className="flex items-center justify-center h-full text-slate-600 text-xs">No domain data</div>;

  const maxCount = Math.max(...domains.map(d => d.count), 1);
  const barGap = 12;
  const barHeight = 10;
  const chartHeight = barHeight * domains.length + barGap * Math.max(0, domains.length - 1);
  const CHART_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#8b5cf6", "#d946ef"];

  const truncateDomain = (name, maxChars = 26) => (name.length > maxChars ? name.substring(0, maxChars - 3) + "..." : name);

  const labelX = 18;
  const barX = 180;
  const rightPad = 20;
  const maxBarArea = 950 - barX - rightPad;

  return (
    <svg width="100%" viewBox={`0 0 1000 ${chartHeight}`} className="block" style={{ minHeight: chartHeight }}>
      {domains.map((domain, i) => {
        const barWidth = Math.max(6, Math.round((domain.count / maxCount) * maxBarArea));
        const y = i * (barHeight + barGap);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const name = truncateDomain(domain.name);

        return (
          <g key={domain.name}>
            <text x={labelX} y={y + barHeight / 2 + 3} fontSize="8px" fill="#cbd5e1" textAnchor="start" fontWeight="600" fontFamily="monospace">
              {name}
            </text>
            <rect x={barX} y={y} width={barWidth} height={barHeight} fill={color} opacity="0.92" rx="4" />
            <text x={barX + barWidth + 8} y={y + barHeight / 2 + 3} fontSize="7px" fill="#94a3b8" fontWeight="700">
              {domain.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Top 5 Domains Card (Modern Design) ────────────────────────────────────
const Top5DomainsCard = ({ domains }) => {
  const top5 = domains.slice(0, 5);

  return (
    <div className="flex flex-col gap-2">
      {top5.map((domain, idx) => {
        const badgeColors = ["#34d399", "#fbbf24", "#f97316", "#06b6d4", "#a78bfa"];
        const badgeColor = badgeColors[idx];

        return (
          <div key={domain.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-slate-400 font-bold text-right w-5">{idx + 1}</span>
              <span className="text-sky-300 font-mono truncate text-xs">{domain.name}</span>
            </div>
            <span className="font-bold ml-2 text-xs" style={{ color: badgeColor }}>{domain.count}</span>
          </div>
        );
      })}
    </div>
  );
};

const TOP_AGENT_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];

const TopAgentsCard = ({ agents }) => {
  if (!agents || agents.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-600">No agent data</div>;
  }

  const maxValue = Math.max(...agents.map((a) => a.count), 1);

  return (
    <div className="space-y-3">
      {agents.map((item, i) => {
        const color = TOP_AGENT_COLORS[i % TOP_AGENT_COLORS.length];
        return (
          <div key={item.name} className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="w-5 text-[13px] font-bold text-slate-500 shrink-0">
                {i + 1}.
              </span>
              <span className="flex-1 min-w-0 text-[13px] font-mono text-slate-300 truncate" title={item.name}>
                {item.name}
              </span>
              <span className="text-[13px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
                {new Intl.NumberFormat("en-US").format(item.count)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-5 shrink-0" />
              <div
                className="flex-1 bg-[var(--soc-bg)] rounded h-4 overflow-hidden"
                title={item.lastSeen ? `Last seen ${formatDetailedTimestamp(item.lastSeen)}` : `${item.name}: ${item.count} events`}
              >
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(item.count / maxValue) * 100}%`,
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

const WORD_COLORS = ["#f472b6", "#38bdf8", "#4ade80", "#a78bfa", "#fb923c", "#34d399", "#f87171", "#facc15", "#60a5fa", "#e879f9"];

const PayloadWordCloud = ({ words, compact = false }) => {
  if (!words || words.length === 0) return <div className="flex items-center justify-center h-full text-slate-600 text-xs">No payload data</div>;
  const W = compact ? 520 : 620, H = compact ? 180 : 200;
  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const range = Math.max(1, maxCount - minCount);
  const fontSize = (count) => Math.round((compact ? 9 : 11) + ((count - minCount) / range) * (compact ? 22 : 31));
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
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="block w-full h-full" style={{ minHeight: 140 }}>
      <defs><radialGradient id="wcGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0f172a" stopOpacity="0" /><stop offset="100%" stopColor="#020617" stopOpacity="0.6" /></radialGradient></defs>
      <rect className="command-word-cloud-bg" width={W} height={H} fill="url(#wcGlow)" rx={12} />
      {placed.map((w) => (
        <text key={w.text} x={w.x} y={w.y} textAnchor="middle" dominantBaseline="middle" fontSize={w.fs} fontWeight={w.fs > 26 ? "800" : w.fs > 18 ? "700" : "500"} fill={w.color} opacity={w.opacity} style={{ cursor: "default", fontFamily: "monospace" }}>
          <title>{`${w.text}: ${w.count} occurrences`}</title>{w.text}
        </text>
      ))}
    </svg>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const TIME_RANGE_OPTIONS = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

const getRangeWindow = (key) => {
  const end = new Date();
  const start = new Date(end);

  switch (String(key || "").trim()) {
    case "1h":
      start.setHours(start.getHours() - 1);
      break;
    case "24h":
      start.setDate(start.getDate() - 1);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    default:
      start.setDate(start.getDate() - 1);
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const extractFimPathFromLog = (fullLog) => {
  const match = String(fullLog || "").match(/File\s+'([^']+)'/i);
  return match?.[1] || "-";
};

const inferFimEvent = (item) => {
  const groups = Array.isArray(item?.groups) ? item.groups.join(" ").toLowerCase() : "";
  const text = `${item?.ruleDescription || ""} ${item?.fullLog || ""} ${groups}`.toLowerCase();

  if (text.includes("deleted")) return "deleted";
  if (text.includes("added") || text.includes("created")) return "added";
  if (text.includes("modified") || text.includes("changed")) return "modified";
  return item?.location || "syscheck";
};

const mapHuntingFimEvent = (item) => ({
  id: item.id,
  timestamp: item.timestamp,
  agentName: item.agentName || "-",
  username: item.username || item.user || "-",
  syscheckPath: item.syscheckPath || item.filePath || extractFimPathFromLog(item.fullLog),
  syscheckEvent: item.syscheckEvent || inferFimEvent(item),
  ruleDescription: item.ruleDescription || "-",
  ruleLevel: Number(item.ruleLevel) || 0,
  ruleId: item.ruleId || "-",
  fileDiff: item.fileDiff || item.fullLog || null,
});

const EVENT_TYPE_OPTIONS = [
  { value: "added", label: "Added" },
  { value: "modified", label: "Modified" },
  { value: "deleted", label: "Deleted" },
  { value: "unknown", label: "Unknown" },
];

const FimEvents = ({ agentId = "all" }) => {
  const [searchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const [events, setEvents] = useState([]);
  const [aggregatedEvents, setAggregatedEvents] = useState([]);
  const [_domainData, setDomainData] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState(() =>
    urlRange && TIME_RANGE_OPTIONS.some((o) => o.value === urlRange) ? urlRange : "24h"
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
  const [lastUpdated, setLastUpdated] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const topAgentsPanelRef = useRef(null);
  const logsTableRef = useRef(null);
  const skipNextFetchRef = useRef(false);
  const [timelineChartHeight, setTimelineChartHeight] = useState(250);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(() =>
    urlStart && urlEnd ? { key: "custom", start: urlStart, end: urlEnd } : null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");

  const USE_STATIC = false;

  const MOCK_EVENTS = [
    {
      id: "evt-1",
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      agentName: "agent-1",
      username: "root",
      syscheckPath: "/etc/passwd",
      syscheckEvent: "modified",
      fileDiff: ">-line removed\n>+line added",
      ruleDescription: "Example rule description",
      ruleLevel: 5,
    },
    {
      id: "evt-2",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      agentName: "agent-2",
      username: "admin",
      syscheckPath: "/var/log/auth.log",
      syscheckEvent: "deleted",
      fileDiff: ">-sensitive line removed",
      ruleDescription: "Deleted file detected",
      ruleLevel: 8,
    },
  ];

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalHits, setTotalHits] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const getEffectiveRange = useCallback((rk) => {
    if (filterMode === "custom") {
      return getIsoDateRange(normalizeDateRange(customDateRange));
    }
    return getRangeWindow(rk || rangeKey);
  }, [filterMode, customDateRange, rangeKey]);

  const fetchHuntingFimEvents = useCallback(async (page, size, start, end) => {
    const agentParam = agentId === "all" ? "" : `&agent_id=${encodeURIComponent(agentId)}`;
    const endpoint =
      `${API_BASE_URL}/api/hunting?page=${page}&size=${size}&group=syscheck` +
      `&start=${encodeURIComponent(start)}` +
      `&end=${encodeURIComponent(end)}` +
      agentParam;

    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`API Error ${response.status}`);

    const result = await response.json();
    if (!result.success) throw new Error(result.message || "Gagal mengambil data FIM fallback");

    const data = Array.isArray(result.data) ? result.data.map(mapHuntingFimEvent) : [];
    const total = Number(result.total) || data.length;

    return {
      success: true,
      data,
      total_hits: total,
      current_page: Number(result.page) || page,
      total_pages: Math.ceil(total / size) || 1,
      page_size: size,
    };
  }, [agentId]);

const fetchEvents = useCallback(async (page = 1, rk, startOverride = null, endOverride = null, options = {}) => {
    try {
      setLoading(true);
      setError(null);

      const effectiveRangeKey = rk || rangeKey;
      let start;
      let end;

      if (startOverride && endOverride) {
        start = startOverride;
        end = endOverride;
      } else if (!options.ignoreTimeline && selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
        start = selectedTimelinePoint.start;
        end = selectedTimelinePoint.end;
      } else {
        const rangeWindow = getEffectiveRange(effectiveRangeKey);
        start = rangeWindow.start;
        end = rangeWindow.end;
      }

      const baseEndpoint =
        agentId === "all"
          ? `${API_BASE_URL}/api/events`
          : `${API_BASE_URL}/api/events/${agentId}`;

      const endpoint =
        `${baseEndpoint}?page=${page}&size=${pageSize}` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`;

      console.log("Fetching Page:", page, endpoint);

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`API Error ${response.status}`);

      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Gagal mengambil data");

      const primaryData = Array.isArray(result.data) ? result.data : [];
      const resolvedResult = primaryData.length === 0
        ? await fetchHuntingFimEvents(page, pageSize, start, end)
        : result;

      setEvents(Array.isArray(resolvedResult.data) ? resolvedResult.data : []);
      setTotalHits(Number(resolvedResult.total_hits) || 0);
      setTotalPages(Number(resolvedResult.total_pages) || 1);
      setCurrentPage(Number(resolvedResult.current_page) || page);
      return resolvedResult;
    } catch (err) {
      console.error("❌ Fetch Error:", err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
}, [agentId, pageSize, rangeKey, selectedTimelinePoint, getEffectiveRange, fetchHuntingFimEvents]);

  const fetchAggregated = useCallback(async (size = 1000, rk) => {
    try {
      const rangeWindow = getEffectiveRange(rk);
      const { start, end } = rangeWindow;

      const baseEndpoint =
        agentId === "all"
          ? `${API_BASE_URL}/api/events`
          : `${API_BASE_URL}/api/events/${agentId}`;

      const endpoint =
        `${baseEndpoint}?page=1&size=${size}` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`;

      const resp = await fetch(endpoint);
      if (!resp.ok) throw new Error(`API Error ${resp.status}`);
      const r = await resp.json();
      if (!r.success) throw new Error(r.message || "Gagal mengambil data (aggregated)");
      const primaryData = Array.isArray(r.data) ? r.data : [];
      const resolvedResult = primaryData.length === 0
        ? await fetchHuntingFimEvents(1, size, start, end)
        : r;

      setAggregatedEvents(Array.isArray(resolvedResult.data) ? resolvedResult.data : []);
      return resolvedResult;
} catch (err) {
      console.error("❌ Fetch Aggregated Error:", err.message);
      return null;
    }
  }, [agentId, getEffectiveRange, fetchHuntingFimEvents]);

  const fetchDomains = useCallback(async (rk) => {
    try {
      const rangeWindow = getEffectiveRange(rk);
      const { start, end } = rangeWindow;

      const baseEndpoint =
        agentId === "all"
          ? `${API_BASE_URL}/api/fim/domains`
          : `${API_BASE_URL}/api/fim/${agentId}/domains`;

      const endpoint =
        `${baseEndpoint}?size=1000` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`API Error ${response.status}`);

      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Gagal mengambil data domain");

      setDomainData(Array.isArray(result.data) ? result.data : []);
      return result;
} catch (err) {
      console.error("Domain fetch error:", err.message);
      setDomainData([]);
      return null;
    }
  }, [agentId, getEffectiveRange]);

  const refreshAllData = useCallback(async (page = 1, rk, options = {}) => {
    const result = await fetchEvents(page, rk, null, null, options);
    const sampleSize = Math.min(1000, Number(result?.total_hits) || 1000);

    await Promise.all([
      fetchAggregated(sampleSize, rk),
      fetchDomains(rk),
    ]);

    if (result) {
      setLastUpdated(new Date().toISOString());
    }

    return result;
  }, [fetchAggregated, fetchDomains, fetchEvents]);

  useEffect(() => {
    if (!USE_STATIC) return;
    setEvents(MOCK_EVENTS);
    setAggregatedEvents(MOCK_EVENTS);
    setDomainData([]);
    setTotalHits(MOCK_EVENTS.length);
    setTotalPages(1);
    setCurrentPage(1);
    setLastUpdated(new Date().toISOString());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (USE_STATIC) return;
    if (skipNextFetchRef.current) {
      // Skip a single scheduled fetch because we already fetched manually
      skipNextFetchRef.current = false;
      return;
    }

    let cancelled = false;

    (async () => {
      const targetPage = currentPage > 1 ? currentPage : 1;
      await refreshAllData(targetPage, rangeKey);
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [agentId, currentPage, rangeKey, refreshAllData, filterMode, customDateRange]);

  useEffect(() => {
    if (USE_STATIC) return;
    const interval = setInterval(() => {
      refreshAllData(currentPage, rangeKey);
    }, 30000);

    return () => clearInterval(interval);
  }, [currentPage, rangeKey, refreshAllData]);

  // Only react to real pageSize changes, not the initial mount/effect re-run in StrictMode.
  const previousPageSizeRef = useRef(pageSize);
  useEffect(() => {
    if (previousPageSizeRef.current === pageSize) {
      return;
    }

    previousPageSizeRef.current = pageSize;

    (async () => {
      setCurrentPage(1);
      try {
        await refreshAllData(1, rangeKey);
      } catch {
        // ignore refresh errors here
      }

      if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
        try {
          logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          // ignore
        }
      }
    })();
  }, [pageSize, refreshAllData, rangeKey]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const now = Date.now();
  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth < 1024;
  const donutSize = isMobile ? 148 : isTablet ? 160 : 280;
  const donutStroke = isMobile ? 16 : isTablet ? 18 : 24;

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
    async (next) => {
      if (!Number.isFinite(next)) return;
      const target = Math.max(1, Math.min(next, totalPages || next));
      skipNextFetchRef.current = true;
      try {
        await refreshAllData(target, rangeKey);
      } catch {
        // ignore fetch errors
      }
      setCurrentPage(target);

      if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
        try {
          logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          // ignore
        }
      }
    },
    [refreshAllData, rangeKey, totalPages]
  );

  const handleTimelinePointSelect = useCallback(
    async (point) => {
      if (!point) return;
      const pointKey = String(point.key ?? point.t ?? point.start ?? point);
      const bucketMs = point.bucketMs || (rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000);
      const startIso = point.start || new Date(Number(point.t)).toISOString();
      const endIso = point.end || new Date(Number(point.t) + bucketMs - 1).toISOString();

      setCurrentPage(1);

      if (selectedTimelinePoint?.key === pointKey) {
        setSelectedTimelinePoint(null);
        try {
          await refreshAllData(1, rangeKey, { ignoreTimeline: true });
        } catch {
          // ignore
        }
      } else {
        setSelectedTimelinePoint({ key: pointKey, start: startIso, end: endIso, bucketMs, time: point.t });
        try {
          await fetchEvents(1, rangeKey, startIso, endIso);
        } catch {
          // ignore
        }
      }

      if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
        try {
          logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          // ignore
        }
      }
    },
    [fetchEvents, refreshAllData, rangeKey, selectedTimelinePoint]
  );

  const formatTime = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }).replace(",", "").replace("AM", "").replace("PM", "");
  };

  const formatRate = (eps) => {
    if (!eps || Number.isNaN(eps) || eps <= 0) return "0.00 / sec";
    if (eps >= 0.01) return `${eps.toFixed(2)} / sec`;
    const perMin = eps * 60;
    if (perMin >= 0.01) return `${perMin.toFixed(2)} / min`;
    const perHour = eps * 3600;
    if (perHour >= 0.01) return `${perHour.toFixed(2)} / hour`;
    return `${eps.toExponential(2)} / sec`;
  };

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

  const renderSeverityBadge = (level) => {
    if (level >= 12) return <span className="bg-red-900/50 text-red-300 border border-red-700/50 px-2 py-0.5 rounded text-[10px] md:text-[11px] font-bold">Critical Lvl {level}</span>;
    if (level >= 8) return <span className="bg-orange-900/50 text-orange-300 border border-orange-700/50 px-2 py-0.5 rounded text-[10px] md:text-[11px] font-bold">High Lvl {level}</span>;
    if (level >= 5) return <span className="bg-yellow-900/50 text-yellow-300 border border-yellow-700/50 px-2 py-0.5 rounded text-[10px] md:text-[11px] font-bold">Medium Lvl {level}</span>;
    return <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-[10px] md:text-[11px] font-bold">Low Lvl {level}</span>;
  };

  const derived = useMemo(() => {
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
      startMs = now - rangeMs;
      endMs = now;
    }

    const sourceEvents = (aggregatedEvents && aggregatedEvents.length) ? aggregatedEvents : events;

    const filtered = sourceEvents
      .map((e) => ({ ...e, _ms: e.timestamp ? new Date(e.timestamp).getTime() : NaN }))
      .filter((e) => Number.isFinite(e._ms) && e._ms >= startMs && e._ms <= endMs)
      .sort((a, b) => b._ms - a._ms);

    let stepMs = filterMode === "custom"
      ? (rangeMs <= 3600000 ? 300000 : rangeMs <= 86400000 ? 3600000 : rangeMs <= 604800000 ? 21600000 : 86400000)
      : (rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000);
    const bucketStart = (ms) => Math.floor(ms / stepMs) * stepMs;
    const buckets = new Map();
    for (const e of filtered) {
      const b = bucketStart(e._ms);
      buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    const series = [];
    for (let t = bucketStart(startMs); t <= bucketStart(endMs); t += stepMs) {
      series.push({ t, v: buckets.get(t) || 0, bucketMs: stepMs });
    }

    const byEvent = new Map();

    for (const e of filtered) {
      const k = e.syscheckEvent || "unknown";
      byEvent.set(k, (byEvent.get(k) || 0) + 1);
    }

    const eventItemsAll = Array.from(byEvent.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const eventTop = eventItemsAll.slice(0, 6);
    const eventItems = eventTop.map((it, i) => ({ ...it, color: ["#38bdf8", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6", "#9CA3AF"][i % 7] }));

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
    const STOP = new Set([
      "", "---", "@@", "+", "-", "//", "#", "the", "is", "to", "and",
      "file", "mode", "old", "new", "was", "now", "sum", "changed", "attributes", "realtime",
    ]);
    for (const e of filtered) {
      const rawPayload = e.fileDiff || e.file_diff || e.fullLog || e.full_log;
      if (!rawPayload) continue;

      const lines = String(rawPayload)
        .replace(/\\n/g, "\n")
        .replace(/\\u003e/g, ">")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const diffLines = lines.filter((line) => line.startsWith(">") || line.startsWith("<"));
      const payloadLines = diffLines.length ? diffLines.map((line) => line.substring(1)) : lines;

      for (const line of payloadLines) {
        const tokens = line
          .split(/[\s/=:;,'"(){}[\]<>|&!?@#%^*`~]+/)
          .map((token) => token.toLowerCase())
          .filter((token) =>
            token.length >= 2 &&
            !STOP.has(token) &&
            !/^\d+$/.test(token) &&
            !/^[a-f0-9]{16,}$/i.test(token)
          );

        for (const token of tokens) byPayload.set(token, (byPayload.get(token) || 0) + 1);
      }
    }
    const payloadWords = Array.from(byPayload.entries()).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 40);

    const bySeverity = new Map();
    for (const e of filtered) {
      const level = e.ruleLevel || 0;
      let severityLabel = "Low";
      if (level >= 12) severityLabel = "Critical";
      else if (level >= 8) severityLabel = "High";
      else if (level >= 5) severityLabel = "Medium";
      bySeverity.set(severityLabel, (bySeverity.get(severityLabel) || 0) + 1);
    }
    const severityItemsAll = Array.from(bySeverity.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const severityItems = severityItemsAll.map((it) => {
      const colorMap = { "Critical": "#ef4444", "High": "#f97316", "Medium": "#eab308", "Low": "#3b82f6" };
      return { ...it, color: colorMap[it.label] || "#64748b" };
    });
    const totalForUI = Number(totalHits) || filtered.length;
    const eps = totalForUI ? totalForUI / (rangeMs / 1000) : 0;

    const criticalCount = filtered.filter((e) => (e.ruleLevel || 0) >= 12).length;

    const byFile = new Map();
    for (const e of filtered) {
      const key = String(e.syscheckPath || e.syscheckPath || "unknown").trim() || "unknown";
      byFile.set(key, (byFile.get(key) || 0) + 1);
    }
    const uniqueFiles = byFile.size;

    const mostSevere = filtered.reduce((acc, e) => {
      const level = e.ruleLevel || 0;
      if (!acc || level > (acc.ruleLevel || 0)) {
        return { ruleLevel: level, description: e.ruleDescription || e.rule_description || "-" };
      }
      return acc;
    }, null);

    return {
      filtered,
      series,
      eventItems,
      topAgents,
      severityItems,
      payloadWords,
      total: totalForUI,
      eps,
      startMs,
      endMs,
      uniqueAgents: byAgent.size,
      criticalCount,
      uniqueFiles,
      mostSevereEvent: mostSevere,
    };
  }, [events, rangeKey, totalHits, aggregatedEvents, now, filterMode, customDateRange]);

  const tableEvents = useMemo(() => {
    const activeRange = selectedTimelinePoint?.start && selectedTimelinePoint?.end
      ? { start: selectedTimelinePoint.start, end: selectedTimelinePoint.end }
      : getEffectiveRange();
    const startMs = new Date(activeRange.start).getTime();
    const endMs = new Date(activeRange.end).getTime();

    return events
      .map((event) => ({ ...event, _ms: event.timestamp ? new Date(event.timestamp).getTime() : NaN }))
      .filter((event) => Number.isFinite(event._ms) && event._ms >= startMs && event._ms <= endMs)
      .filter((event) => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return [event.agentName, event.username, event.syscheckPath, event.syscheckEvent, event.ruleDescription]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q));
      })
      .filter((event) => eventFilter === "all" || (event.syscheckEvent || "unknown").toLowerCase() === eventFilter.toLowerCase())
      .sort((a, b) => b._ms - a._ms);
  }, [events, selectedTimelinePoint, getEffectiveRange, searchQuery, eventFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-sky-400 gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400"></div>
        <div className="text-sm font-medium">Memuat data</div>
      </div>
    );
  }

  if (error) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="bg-red-950/60 border border-red-800/60 rounded-xl px-6 py-4 text-red-300 text-sm">⚠ Error: {error}</div></div>;

  return (
    <div className="p-4 md:p-5 flex flex-col gap-4 w-full">
        {/* FIM Header */}
        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-3 md:p-4 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-400" />
                File Integrity Monitoring
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">Real-time file changes monitoring</p>
            </div>
          </div>
        </div>

        {/* FIM Data Container */}
        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-2 md:p-4 shadow-lg flex flex-col gap-3 md:gap-4">
          <div className="flex flex-col items-start gap-1 md:flex-row md:items-center md:justify-between md:gap-2">
            <label className="hidden items-center gap-1 text-[10px] text-slate-400 sm:flex">
              <span>Rows</span>
            </label>
            <div className="relative flex items-center bg-[var(--soc-card)] rounded border border-[var(--soc-border)]">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="appearance-none bg-transparent py-1.5 pl-2 pr-5 text-left text-[11px] font-medium leading-tight text-slate-100 focus:outline-none"
              >
                {[10, 25, 50, 100].map((s) => (
                  <option key={s} value={s} className="bg-white text-black">{s}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <RangeFilter
                rangeKey={rangeKey}
                onRangeChange={(nextRange) => {
                  if (rangeKey !== nextRange) {
                    setCurrentPage(1);
                    setSelectedTimelinePoint(null);
                    setRangeKey(nextRange);
                    setFilterMode("range");
                  }
                }}
                dimmed={filterMode === "custom"}
                options={TIME_RANGE_OPTIONS}
              />
              <DateRangeFilter
                value={customDateRange}
                onChange={(range) => {
                  setCurrentPage(1);
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className="bg-violet-500/10 border border-violet-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-violet-400 uppercase font-semibold">Total Events</div>
              <div className="text-sm md:text-lg font-black text-violet-300 mt-0.5 md:mt-1">{derived.total}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">events in range</div>
            </div>
            <div className="bg-sky-500/10 border border-sky-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-sky-400 uppercase font-semibold">Files Changed</div>
              <div className="text-sm md:text-lg font-black text-sky-300 mt-0.5 md:mt-1">{derived.uniqueFiles}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">unique files modified</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-red-400 uppercase font-semibold">Critical Events</div>
              <div className="text-sm md:text-lg font-black text-red-300 mt-0.5 md:mt-1">{derived.criticalCount}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">rule level ≥ 12</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-emerald-400 uppercase font-semibold">Most Severe Event</div>
              <div className="text-sm md:text-lg font-black text-emerald-300 mt-0.5 md:mt-1">
                {derived.mostSevereEvent ? `Lvl ${derived.mostSevereEvent.ruleLevel}` : "—"}
              </div>
              <div className="text-[8px] md:text-[9px] text-slate-400 mt-0.5 truncate" title={derived.mostSevereEvent?.description}>
                {derived.mostSevereEvent ? derived.mostSevereEvent.description : "no events"}
              </div>
            </div>
          </div>
<div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 items-stretch">
            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-6 flex flex-col h-full overflow-visible">
              <div className="flex justify-between items-center mb-4 md:mb-6 gap-2">
                <div className="text-[11px] md:text-xs font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                  <Activity className="h-3 md:h-4 w-3 md:w-4 text-emerald-400" />
                  FIM Timeline
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Last {rangeKey}</div>
                  <div className="text-[11px] text-slate-600">Updated {formatLiveTimestamp(lastUpdated)}</div>
                </div>
              </div>
              <div className="flex-1 min-h-[240px] md:min-h-[280px] min-w-0 rounded-lg bg-[var(--soc-card)] p-2 md:p-4 overflow-visible">
                <div className="min-w-0 h-full">
                  <WaveChart
                    data={derived.series}
                    color="#10b981"
                    height={timelineChartHeight}
                    rangeKey={rangeKey}
                    compact={isMobile}
                    activePointKey={selectedTimelinePoint?.key ?? null}
                    onPointSelect={handleTimelinePointSelect}
                  />
                </div>
              </div>
            </div>
            <div ref={topAgentsPanelRef} className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-6 h-full">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] md:text-xs font-semibold text-slate-300">Top 5 Agents</div>
                  <div className="mt-1 text-[11px] text-slate-500">Most active agents from FIM events</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Unique agents</div>
                  <div className="text-xs font-black text-emerald-300">{derived.uniqueAgents}</div>
                </div>
              </div>
              <TopAgentsCard agents={derived.topAgents} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            {/* Kotak 1: Event + Severity Distribution */}
            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 shadow-lg flex flex-col">
              <div className="w-full text-[11px] md:text-xs font-semibold text-slate-300 mb-4">Event & Severity Distribution</div>
              <div className="flex flex-col md:flex-row gap-5 md:gap-6 flex-1 items-center justify-center min-h-0">
                <div className="flex flex-1 min-w-0 flex-col items-center justify-center">
                  <Donut items={derived.eventItems} size={donutSize} stroke={donutStroke} centerLabelTop={derived.total} centerLabelBottom="events" compact={isMobile} />
                  <div className="w-full text-xs mt-3"><Legend items={derived.eventItems} /></div>
                </div>
                <div className="flex flex-1 min-w-0 flex-col items-center justify-center">
                  <Donut items={derived.severityItems} size={donutSize} stroke={donutStroke} centerLabelTop={derived.total} centerLabelBottom="severity" compact={isMobile} />
                  <div className="w-full text-xs mt-3"><Legend items={derived.severityItems} /></div>
                </div>
              </div>
            </div>
            {/* Kotak 2: Payload Pattern Cloud */}
            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 shadow-lg flex flex-col">
              <div className="w-full text-[11px] md:text-xs font-semibold text-slate-300 mb-4">Payload Pattern Cloud</div>
<div className="command-keywords-distribution-box w-full flex-1 min-h-0 rounded-xl overflow-hidden">
  <PayloadWordCloud words={derived.payloadWords} />
</div>
            </div>
          </div>
        </div>

        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 md:p-3 border-b border-[var(--soc-border)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari agent, user, path, event, rule..."
                className="w-full rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-8 pr-8 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="relative">
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="appearance-none rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-8 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              >
                <option value="all" className="bg-white text-black">Semua event</option>
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-white text-black">{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>
          <div ref={logsTableRef} className="overflow-x-auto">
            {selectedTimelinePoint && (
              <div className="p-3 border-b border-[var(--soc-border)] bg-[var(--soc-card)] flex items-center justify-between">
                <div className="text-xs text-orange-300">
                  Timeline filter: {formatDetailedTimestamp(selectedTimelinePoint.start)}
                  {selectedTimelinePoint.end ? ` - ${formatDetailedTimestamp(selectedTimelinePoint.end)}` : ""}
                </div>
                <button
                  onClick={async () => {
                    setSelectedTimelinePoint(null);
                    setCurrentPage(1);
                    try {
                      await refreshAllData(1, rangeKey, { ignoreTimeline: true });
                    } catch {
                      // ignore
                    }
                  }}
                  className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
                >
                  Reset Time Filter
                </button>
              </div>
            )}
            <table className="w-full text-[10px] md:text-[11px] text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  {["↓ time", "agent", "user", "path", "event", "payload", "severity"].map(h => (
                    <th key={h} className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableEvents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">
                      No FIM events found for the selected filter.
                    </td>
                  </tr>
                ) : tableEvents.map((evt, idx) => (
                  <tr
                    key={evt.id}
                    className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${
                      idx % 2 !== 0 ? "bg-slate-900/60" : ""
                    }`}
                  >
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-500 text-[10px] md:text-[11px]">{formatTime(evt.timestamp)}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-sky-400 font-medium text-[10px] md:text-[11px]">{evt.agentName}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-violet-400 font-medium text-[10px] md:text-[11px]">{evt.username}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-emerald-400 font-mono text-[10px] md:text-[11px] truncate">{evt.syscheckPath}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3">
                      <span
                        className={`text-[10px] md:text-[11px] px-1 md:px-2 py-0.5 rounded border ${
                          evt.syscheckEvent === "deleted"
                            ? "text-red-400 bg-red-900/30"
                            : "text-green-400 bg-green-900/30"
                        }`}
                      >
                        {evt.syscheckEvent}
                      </span>
                    </td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-300 max-w-xs md:max-w-md text-[10px] md:text-[11px]">
                      {(() => {
                        const diffData = evt.fileDiff || evt.file_diff;

                        if (diffData) {
                          return (
                            <div className="mb-2">
                              <div className="text-[8px] md:text-[9px] text-sky-500 uppercase font-bold mb-1 tracking-tight">
                                Changes:
                              </div>
                              <pre className="p-1 md:p-2 bg-black/60 text-[8px] md:text-[10px] rounded border border-slate-700/50 font-mono text-emerald-400 overflow-x-auto leading-normal whitespace-pre-wrap">
                                {String(diffData)
                                  .replace(/\\n/g, "\n")
                                  .replace(/\\u003e/g, "→")
                                  .replace(/["']/g, "")}
                              </pre>
                            </div>
                          );
                        }
                      })()}

                      <div className="text-[10px] md:text-[11px] font-semibold text-slate-100 opacity-80 border-t border-slate-800/50 pt-1">
                        {evt.ruleDescription || evt.rule_description}
                      </div>
                    </td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3">{renderSeverityBadge(evt.ruleLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- TOMBOL NAVIGASI --- */}
            <div className="border-t border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="text-[10px] md:text-[11px] font-mono text-slate-500">
                    <span className="hidden md:inline">SHOWING </span>
                    <span className="font-bold text-sky-400">{totalHits === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span>
                    <span className="hidden md:inline"> - </span>
                    <span className="md:hidden">-</span>
                    <span className="font-bold text-sky-400">{Math.min(currentPage * pageSize, totalHits)}</span>
                    <span className="hidden md:inline"> OF </span>
                    <span className="md:hidden"> / </span>
                    <span className="font-bold text-sky-400">{totalHits}</span>
                    <span className="hidden md:inline"> EVENTS</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={currentPage === 1 || loading}
                    onClick={() => goToPage(1)}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <span className="hidden md:inline">FIRST</span>
                    <span className="md:hidden">«</span>
                  </button>
                  <button
                    disabled={currentPage === 1 || loading}
                    onClick={() => goToPage(Math.max(currentPage - 1, 1))}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <span className="hidden md:inline">← PREV</span>
                    <span className="md:hidden">‹</span>
                  </button>
                  <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400">
                    <span className="hidden md:inline">PAGE </span>
                    <span className="text-white">{currentPage}</span> / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages || loading}
                    onClick={() => goToPage(Math.min(currentPage + 1, totalPages))}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <span className="hidden md:inline">NEXT →</span>
                    <span className="md:hidden">›</span>
                  </button>
                  <button
                    disabled={currentPage === totalPages || loading}
                    onClick={() => goToPage(totalPages)}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <span className="hidden md:inline">LAST</span>
                    <span className="md:hidden">»</span>
                  </button>
                </div>
              </div>
            </div>
        </div>
      </div>
  );
};

export default FimEvents;
