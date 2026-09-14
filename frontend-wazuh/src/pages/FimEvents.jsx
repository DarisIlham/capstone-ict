import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, CalendarRange, ChevronDown, FileText, Search, X } from "lucide-react";
import { API_BASE_URL } from "../config/Api";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import PageLoader from "../components/PageLoader";
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
    <div ref={rootRef} className="relative h-full w-full" onMouseLeave={() => setSelectedPoint(null)}>
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
  const elRef = useRef(null);
  const [measured, setMeasured] = useState({ width, height });

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setMeasured({ width: rect.width, height: Math.max(rect.height, 30) });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  width = measured.width;
  height = measured.height;
  const maxV = Math.max(1, ...data.map((d) => d.v));
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const barW = data.length ? innerW / data.length : innerW;
  const tickCount = clamp(Math.floor(innerW / 160), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <svg ref={elRef} width="100%" viewBox={`0 0 ${width} ${height}`} className="block" style={{ height: "auto" }}>
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

const Donut = ({ items, size = 140, stroke = 14, centerLabelTop, centerLabelBottom, compact = false, activeLabel = null, onSelect = null }) => {
  const [hovered, setHovered] = useState(null);
  const positive = items.filter((it) => (it.value || 0) > 0);
  if (positive.length === 0) {
    return (
      <div
        className="flex shrink-0 items-center justify-center text-xs text-slate-600"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }
  const total = positive.reduce((a, b) => a + b.value, 0) || 1;
  const R = size / 2;
  const ro = R;
  const ri = Math.max(0, R - stroke);
  const isInteractive = typeof onSelect === "function";

  const polar = (radius, angle) => {
    const a = angle - Math.PI / 2;
    return [radius * Math.cos(a), radius * Math.sin(a)];
  };

  const annularPiece = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x1o, y1o] = polar(ro, a0);
    const [x2o, y2o] = polar(ro, a1);
    const [x2i, y2i] = polar(ri, a1);
    const [x1i, y1i] = polar(ri, a0);
    return [
      `M ${x1o} ${y1o}`,
      `A ${ro} ${ro} 0 ${large} 1 ${x2o} ${y2o}`,
      `L ${x2i} ${y2i}`,
      `A ${ri} ${ri} 0 ${large} 0 ${x1i} ${y1i}`,
      "Z",
    ].join(" ");
  };

  const annularSector = (a0, a1) => {
    let span = a1 - a0;
    if (span <= 0) return "";
    const parts = [];
    let cur = a0;
    while (span > 1e-9) {
      const piece = Math.min(Math.PI, span);
      parts.push(annularPiece(cur, cur + piece));
      cur += piece;
      span -= piece;
    }
    return parts.join(" ");
  };

  let acc = 0;
  const sectors = positive.map((it) => {
    const sweep = (it.value / total) * Math.PI * 2;
    const sector = { it, start: acc, end: acc + sweep };
    acc += sweep;
    return sector;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`translate(${size / 2} ${size / 2})`}>
        {sectors.map(({ it, start, end }) => {
          const active = activeLabel != null && String(it.label).toLowerCase() === String(activeLabel).toLowerCase();
          const dimmed = activeLabel != null && !active;
          const hoveredSelf = hovered === it.label;
          const sliceOpacity = dimmed ? (hoveredSelf ? 0.85 : 0.7) : 1;
          const d = annularSector(start, end);
          if (!d) return null;

          return (
            <path
              key={it.label}
              className="fim-donut-seg"
              d={d}
              fill={it.color}
              opacity={sliceOpacity}
              stroke="none"
              style={{ cursor: isInteractive ? "pointer" : "default", transition: "opacity 150ms", WebkitTapHighlightColor: "transparent" }}
              role={isInteractive ? "button" : undefined}
              tabIndex={isInteractive ? 0 : undefined}
              aria-label={isInteractive ? `Filter logs by ${it.label} events` : undefined}
              onClick={isInteractive ? () => onSelect(it.label) : undefined}
              onKeyDown={isInteractive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(it.label); } } : undefined}
              onMouseEnter={() => setHovered(it.label)}
              onMouseLeave={() => setHovered((h) => (h === it.label ? null : h))}
            >
              <title>{`${it.label}: ${it.value}${isInteractive ? " — click to filter" : ""}`}</title>
            </path>
          );
        })}
        <text y={compact ? -2 : -4} textAnchor="middle" fontSize={compact ? "14" : "18"} fill="#f1f5f9" fontWeight="700">{centerLabelTop}</text>
        <text y={compact ? 13 : 16} textAnchor="middle" fontSize={compact ? "10" : "12"} fill="#64748b">{centerLabelBottom}</text>
      </g>
    </svg>
  );
};

const Legend = ({ items, activeLabel = null, onSelect = null, compact = false }) => {
  const isInteractive = typeof onSelect === "function";

  return (
    <div className={`flex flex-wrap items-center w-full min-w-0 justify-center ${compact ? "gap-x-2 gap-y-1" : "gap-x-4 gap-y-1.5"}`}>
      {items.map((it) => {
        const active = activeLabel != null && String(it.label).toLowerCase() === String(activeLabel).toLowerCase();
        return (
          <div
            key={it.label}
            className={`fim-legend-item flex items-center gap-1 whitespace-nowrap transition-colors ${compact ? "text-[9px]" : "text-[10px]"} ${active ? "text-slate-100 font-bold" : "text-slate-400"
              } ${activeLabel != null && !active ? "opacity-70" : ""} ${isInteractive ? "cursor-pointer hover:text-slate-200" : ""} ${isInteractive ? "px-1 -mx-1 rounded" : ""}`}
            role={isInteractive ? "button" : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            aria-label={isInteractive ? `Filter logs by ${it.label}` : undefined}
            onClick={isInteractive ? () => onSelect(it.label) : undefined}
            onKeyDown={isInteractive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(it.label); } } : undefined}
          >
            <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
            <span className="truncate min-w-0 max-w-[10rem]">{it.label}</span>
            <span className="text-slate-500 tabular-nums shrink-0">{it.value}</span>
          </div>
        );
      })}
    </div>
  );
};

// ── Domain Colors ────────────────────────────────────────────────────────────
const DOMAIN_COLORS = ["#f472b6", "#38bdf8", "#4ade80", "#a78bfa", "#fb923c", "#34d399", "#f87171", "#facc15", "#60a5fa", "#e879f9"];

// ── Domain Horizontal Bar Chart (Modern Design) ────
const DomainBarChart = ({ domains }) => {
  const chartWrapRef = useRef(null);
  const [wrapWidth, setWrapWidth] = useState(1000);

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    const updateSize = () => {
      if (el.clientWidth > 0) setWrapWidth(el.clientWidth);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!domains || domains.length === 0) return <div className="flex items-center justify-center h-full text-slate-600 text-xs">No domain data</div>;

  const width = Math.max(wrapWidth, 420);
  const maxCount = Math.max(...domains.map(d => d.count), 1);
  const barGap = 12;
  const barHeight = 10;
  const chartHeight = barHeight * domains.length + barGap * Math.max(0, domains.length - 1);
  const CHART_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#8b5cf6", "#d946ef"];

  const truncateDomain = (name, maxChars = 26) => (name.length > maxChars ? name.substring(0, maxChars - 3) + "..." : name);

  const labelX = 18;
  const barX = Math.round(width * 0.2);
  const rightPad = 20;
  const maxBarArea = Math.max(60, width - barX - rightPad);

  return (
    <svg ref={chartWrapRef} width="100%" viewBox={`0 0 ${width} ${chartHeight}`} className="block" style={{ minHeight: chartHeight }}>
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

const PayloadWordCloud = ({ words, compact = false, activeWord = null, onWordClick = null }) => {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
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
  }, []);

  if (!words || words.length === 0) return <div className="flex items-center justify-center h-auto min-h-16 px-3 py-6 text-center text-slate-600 text-xs">No payload data</div>;
  const W = Math.max(size.width || 0, 140);
  const H = Math.max(size.height || 0, 120);
  const wScale = W / (compact ? 520 : 620);
  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const range = Math.max(1, maxCount - minCount);
  const SAFE_X = 18, SAFE_Y = 14;
  const minInnerW = 2 * SAFE_X, minInnerH = 2 * SAFE_Y;

  const measureTextWidth = (() => {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = canvas ? canvas.getContext("2d") : null;
    return (text, fs, weight) => {
      if (!ctx || !fs || fs <= 0) return text.length * fs * 0.62;
      ctx.font = `${weight} ${fs}px monospace`;
      return Math.ceil(ctx.measureText(text).width);
    };
  })();

  const toWeight = (fs) => (fs > 26 ? "800" : fs > 18 ? "700" : "500");

  const fitFontSize = (text, fs) => {
    const maxW = W - minInnerW, maxH = H - minInnerH;
    if (maxW < 12 || maxH < 12) return 8;
    let f = fs;
    let weight = toWeight(f);
    for (let iter = 0; iter < 3; iter++) {
      const w = measureTextWidth(text, f, weight);
      const h = f * 1.4;
      const s = Math.min(maxW / w, maxH / h);
      if (s >= 1) break;
      f = Math.max(8, Math.floor(f * s));
      weight = toWeight(f);
    }
    return f;
  };

  const fontSize = (count) => Math.round((compact ? 9 : 11) + ((count - minCount) / range) * (compact ? 22 : 31) * Math.min(1, Math.max(0.6, wScale)));
  const placed = [];
  const rects = [];
  const overlaps = (nx, ny, nw, nh) => {
    const pad = 4;
    return rects.some(r => nx - nw / 2 - pad < r.x + r.w / 2 && nx + nw / 2 + pad > r.x - r.w / 2 && ny - nh / 2 - pad < r.y + r.h / 2 && ny + nh / 2 + pad > r.y - r.h / 2);
  };
  for (let i = 0; i < words.length; i++) {
    const { text, count } = words[i];
    const fs = fitFontSize(text, fontSize(count));
    const weight = toWeight(fs);
    const tw = measureTextWidth(text, fs, weight);
    const th = Math.ceil(fs * 1.4);
    if (tw > W - minInnerW || th > H - minInnerH) continue;
    let placed_x = W / 2, placed_y = H / 2, found = false;
    for (let step = 0; step < 800; step++) {
      const angle = step * 0.35, radius = step * 0.8;
      const cx = W / 2 + radius * Math.cos(angle), cy = H / 2 + radius * Math.sin(angle) * 0.6;
      if (cx - tw / 2 >= SAFE_X && cx + tw / 2 <= W - SAFE_X && cy - th / 2 >= SAFE_Y && cy + th / 2 <= H - SAFE_Y && !overlaps(cx, cy, tw, th)) {
        placed_x = cx; placed_y = cy; found = true; break;
      }
    }
    if (found) {
      rects.push({ x: placed_x, y: placed_y, w: tw, h: th });
      placed.push({ text, fs, weight, color: WORD_COLORS[i % WORD_COLORS.length], opacity: 0.65 + ((count - minCount) / range) * 0.35, x: placed_x, y: placed_y, count });
    }
  }
  return (
    <div ref={wrapRef} className="relative w-full h-full min-h-0">
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="command-word-cloud block w-full h-full">
        <defs><radialGradient id="wcGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0f172a" stopOpacity="0" /><stop offset="100%" stopColor="#020617" stopOpacity="0.6" /></radialGradient></defs>
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

const SEVERITY_LABELS = ["Critical", "High", "Medium", "Low"];

const severityForLevel = (level) => {
  if (level >= 12) return "Critical";
  if (level >= 8) return "High";
  if (level >= 5) return "Medium";
  return "Low";
};

const PAYLOAD_SEARCH_FIELDS = [
  "fileDiff",
  "file_diff",
  "fullLog",
  "full_log",
  "syscheckPath",
  "syscheck_path",
  "ruleDescription",
  "rule_description",
  "username",
  "agentName",
];

const payloadTextIncludes = (value, needleLower) => {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") return String(value).toLowerCase().includes(needleLower);
  if (Array.isArray(value)) {
    return value.some((v) => payloadTextIncludes(v, needleLower));
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value).toLowerCase().includes(needleLower);
    } catch {
      return false;
    }
  }
  return String(value).toLowerCase().includes(needleLower);
};

const eventMatchesFilters = (event, eventType, severity, payloadPattern) => {
  if (eventType) {
    const actual = String(event.syscheckEvent || "unknown").toLowerCase();
    if (actual !== String(eventType).toLowerCase()) return false;
  }

  if (severity) {
    const level = Number(event.ruleLevel) || 0;
    if (severityForLevel(level) !== severity) return false;
  }

  if (payloadPattern) {
    const needle = String(payloadPattern).toLowerCase();
    const hit = PAYLOAD_SEARCH_FIELDS.some((field) => payloadTextIncludes(event[field], needle));
    if (!hit) return false;
  }

  return true;
};

const matchesGridFilters = (event, agentFilter, userFilter, eventFilter, severityFilter) => {
  if (agentFilter !== "all" && String(event.agentName || event.agent_name || "Unknown agent").trim() !== agentFilter) return false;
  if (userFilter !== "all" && String(event.username || event.user || "-") !== userFilter) return false;
  if (eventFilter !== "all" && (event.syscheckEvent || "unknown").toLowerCase() !== eventFilter.toLowerCase()) return false;
  if (severityFilter !== "all" && severityForLevel(Number(event.ruleLevel) || 0) !== severityFilter) return false;
  return true;
};

const FimEvents = ({ agentId = "all" }) => {
  const [searchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const [events, setEvents] = useState([]);
  const [aggregatedEvents, setAggregatedEvents] = useState([]);
  // Backend terms aggregation across the full date range (complete agent
  // list); client-side counting below is only the fallback.
  const [agentStats, setAgentStats] = useState([]);
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
  const [agentFilter, setAgentFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const [selectedEventType, setSelectedEventType] = useState(null);
  const [selectedSeverity, setSelectedSeverity] = useState(null);
  const [selectedPayloadPattern, setSelectedPayloadPattern] = useState(null);
  const [clientPage, setClientPage] = useState(1);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalHits, setTotalHits] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [distributionData, setDistributionData] = useState(null);

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
    if (!result.success) throw new Error(result.message || "Failed to fetch FIM fallback data");

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
      if (!result.success) throw new Error(result.message || "Failed to fetch data");

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
      if (!r.success) throw new Error(r.message || "Failed to fetch data (aggregated)");
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
      if (!result.success) throw new Error(result.message || "Failed to fetch domain data");

      setDomainData(Array.isArray(result.data) ? result.data : []);
      return result;
    } catch (err) {
      console.error("Domain fetch error:", err.message);
      setDomainData([]);
      return null;
    }
  }, [agentId, getEffectiveRange]);

  const fetchAgentStats = useCallback(async (rk) => {
    try {
      const rangeWindow = getEffectiveRange(rk);
      const { start, end } = rangeWindow;

      const baseEndpoint =
        agentId === "all"
          ? `${API_BASE_URL}/api/events/agents/stats`
          : `${API_BASE_URL}/api/events/${agentId}/agents/stats`;

      const endpoint =
        `${baseEndpoint}?size=20` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`;

      const resp = await fetch(endpoint);
      if (!resp.ok) throw new Error(`API Error ${resp.status}`);
      const r = await resp.json();
      if (!r.success) throw new Error(r.message || "Failed to fetch agent stats");
      setAgentStats(Array.isArray(r.data) ? r.data : []);
      return r;
    } catch (err) {
      console.error("Agent stats fetch error:", err.message);
      setAgentStats([]);
      return null;
    }
  }, [agentId, getEffectiveRange]);

  const fetchDistribution = useCallback(async (rk) => {
    try {
      const rangeWindow = getEffectiveRange(rk);
      const { start, end } = rangeWindow;

      const baseEndpoint =
        agentId === "all"
          ? `${API_BASE_URL}/api/events/distribution/stats`
          : `${API_BASE_URL}/api/events/${agentId}/distribution/stats`;

      const endpoint =
        `${baseEndpoint}?` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`;

      const resp = await fetch(endpoint);
      if (!resp.ok) throw new Error(`API Error ${resp.status}`);
      const r = await resp.json();
      if (!r.success) throw new Error(r.message || "Failed to fetch distribution");
      setDistributionData(r);
      return r;
    } catch (err) {
      console.error("Distribution fetch error:", err.message);
      setDistributionData(null);
      return null;
    }
  }, [agentId, getEffectiveRange]);

  const refreshAllData = useCallback(async (page = 1, rk, options = {}) => {
    const result = await fetchEvents(page, rk, null, null, options);
    const sampleSize = Math.min(1000, Number(result?.total_hits) || 1000);

    await Promise.all([
      fetchAggregated(sampleSize, rk),
      fetchDomains(rk),
      fetchAgentStats(rk),
      fetchDistribution(rk),
    ]);

    if (result) {
      setLastUpdated(new Date().toISOString());
    }

    return result;
  }, [fetchAggregated, fetchDomains, fetchAgentStats, fetchDistribution, fetchEvents]);

  useEffect(() => {
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
      setClientPage(1);
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

  useEffect(() => {
    setClientPage(1);
  }, [searchQuery, eventFilter, agentFilter, userFilter, severityFilter]);

  const now = Date.now();
  const isMobile = viewportWidth < 768;
  const usesCompactDonuts = viewportWidth < 1280;
  const usesLargeDonuts = viewportWidth >= 1600;
  // This panel shares a row with the payload chart, so its two donuts must
  // fit inside half of the available dashboard width—not the whole viewport.
  const donutSize = isMobile ? 124 : usesCompactDonuts ? 160 : usesLargeDonuts ? 260 : 200;
  const donutStroke = isMobile ? 14 : usesCompactDonuts ? 18 : usesLargeDonuts ? 22 : 20;

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

  const vizFiltersActive = Boolean(selectedEventType || selectedSeverity || selectedPayloadPattern);

  const handleSelectEventType = useCallback((label) => {
    setSelectedEventType((prev) => (String(prev || "").toLowerCase() === String(label).toLowerCase() ? null : label));
    setClientPage(1);
  }, []);

  const handleSelectSeverity = useCallback((label) => {
    setSelectedSeverity((prev) => (prev === label ? null : label));
    setClientPage(1);
  }, []);

  const handleSelectPayload = useCallback((word) => {
    setSelectedPayloadPattern((prev) => (prev === word ? null : word));
    setClientPage(1);
  }, []);

  const clearVizFilters = useCallback(() => {
    setSelectedEventType(null);
    setSelectedSeverity(null);
    setSelectedPayloadPattern(null);
    setClientPage(1);
  }, []);

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

    const distEventTypes = Array.isArray(distributionData?.eventTypes) ? distributionData.eventTypes : [];
    const distSeverity = Array.isArray(distributionData?.severity) ? distributionData.severity : [];

    const byEvent = new Map();

    if (!distEventTypes.length) {
      for (const e of filtered) {
        const k = e.syscheckEvent || "unknown";
        byEvent.set(k, (byEvent.get(k) || 0) + 1);
      }
    }

    const eventItemsAll = Array.from(byEvent.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const eventTop = eventItemsAll.slice(0, 6);
    const eventItems = distEventTypes.length
      ? distEventTypes
          .filter((it) => it && it.value > 0)
          .slice(0, 6)
          .map((it, i) => ({ ...it, color: ["#38bdf8", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6", "#9CA3AF"][i % 7] }))
      : eventTop.map((it, i) => ({ ...it, color: ["#38bdf8", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6", "#9CA3AF"][i % 7] }));

    const byAgent = new Map();
    for (const e of filtered) {
      const agentLabel = String(e.agentName || e.agent_name || "Unknown agent").trim() || "Unknown agent";
      const existing = byAgent.get(agentLabel) || { name: agentLabel, count: 0, lastSeen: 0 };
      existing.count += 1;
      existing.lastSeen = Math.max(existing.lastSeen, e._ms || 0);
      byAgent.set(agentLabel, existing);
    }
    // Prefer the backend terms aggregation (complete across the whole date
    // range); fall back to client-side counting of the fetched sample.
    const backendAgents = Array.isArray(agentStats) ? agentStats : [];
    const topAgents = (backendAgents.length
      ? backendAgents.map((it) => ({
        name: String(it.agent || it.name || "Unknown agent"),
        count: Number(it.count || it.value || 0),
        lastSeen: 0,
      }))
      : Array.from(byAgent.values())
        .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen || a.name.localeCompare(b.name))
    ).slice(0, 5);

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
    if (!distSeverity.length) {
      for (const e of filtered) {
        const level = e.ruleLevel || 0;
        let severityLabel = "Low";
        if (level >= 12) severityLabel = "Critical";
        else if (level >= 8) severityLabel = "High";
        else if (level >= 5) severityLabel = "Medium";
        bySeverity.set(severityLabel, (bySeverity.get(severityLabel) || 0) + 1);
      }
    }
    const severityItemsAll = Array.from(bySeverity.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const severityColorMap = { "Critical": "#ef4444", "High": "#f97316", "Medium": "#eab308", "Low": "#3b82f6" };
    const severityItems = distSeverity.length
      ? distSeverity
          .filter((it) => it && it.value > 0)
          .map((it) => ({ ...it, color: severityColorMap[it.label] || "#64748b" }))
          .sort((a, b) => b.value - a.value)
      : severityItemsAll.map((it) => ({
          ...it,
          color: severityColorMap[it.label] || "#64748b",
        }));
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
  }, [events, rangeKey, totalHits, aggregatedEvents, agentStats, now, filterMode, customDateRange, distributionData]);

  const filterOptions = useMemo(() => {
    const base = (aggregatedEvents && aggregatedEvents.length) ? aggregatedEvents : events;
    const agentSet = new Set();
    const userSet = new Set();
    for (const e of base) {
      const agentLabel = String(e.agentName || e.agent_name || "Unknown agent").trim() || "Unknown agent";
      agentSet.add(agentLabel);
      const userLabel = String(e.username || e.user || "-").trim();
      if (userLabel && userLabel !== "-") userSet.add(userLabel);
    }
    const sortLabel = (a, b) => a.localeCompare(b);
    return {
      agents: Array.from(agentSet).sort(sortLabel),
      users: Array.from(userSet).sort(sortLabel),
    };
  }, [aggregatedEvents, events]);

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
      .filter((event) => matchesGridFilters(event, agentFilter, userFilter, eventFilter, severityFilter))
      .sort((a, b) => b._ms - a._ms);
  }, [events, selectedTimelinePoint, getEffectiveRange, searchQuery, eventFilter, agentFilter, userFilter, severityFilter]);

  const crossFilteredEvents = useMemo(() => {
    if (!vizFiltersActive) return null;

    const searchLower = searchQuery.trim().toLowerCase();

    const base = (aggregatedEvents && aggregatedEvents.length) ? aggregatedEvents : events;

    return base
      .map((event) => ({ ...event, _ms: event.timestamp ? new Date(event.timestamp).getTime() : NaN }))
      .filter((event) => Number.isFinite(event._ms) && event._ms >= derived.startMs && event._ms <= derived.endMs)
      .filter((event) => {
        if (!searchLower) return true;
        return [event.agentName, event.username, event.syscheckPath, event.syscheckEvent, event.ruleDescription]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(searchLower));
      })
      .filter((event) => matchesGridFilters(event, agentFilter, userFilter, eventFilter, severityFilter))
      .filter((event) => eventMatchesFilters(event, selectedEventType, selectedSeverity, selectedPayloadPattern))
      .sort((a, b) => b._ms - a._ms);
  }, [vizFiltersActive, derived.startMs, derived.endMs, aggregatedEvents, events, searchQuery, eventFilter, agentFilter, userFilter, severityFilter, selectedEventType, selectedSeverity, selectedPayloadPattern]);

  const displayTotal = vizFiltersActive ? (crossFilteredEvents || []).length : totalHits;
  const displayPages = vizFiltersActive ? Math.max(1, Math.ceil((crossFilteredEvents || []).length / pageSize)) : totalPages;
  const safeDisplayPage = Math.min(vizFiltersActive ? clientPage : currentPage, Math.max(displayPages, 1));
  const visibleEvents = vizFiltersActive ? (crossFilteredEvents || []).slice((safeDisplayPage - 1) * pageSize, safeDisplayPage * pageSize) : tableEvents;

  const goToDisplayPage = useCallback((next) => {
    if (vizFiltersActive) {
      setClientPage(Math.max(1, Math.min(next, Math.max(displayPages, 1))));
      if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
        try {
          logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          // ignore
        }
      }
      return;
    }
    goToPage(next);
  }, [vizFiltersActive, displayPages, goToPage]);

  if (loading) {
    return <PageLoader message="Loading data..." />;
  }

  if (error) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="bg-red-950/60 border border-red-800/60 rounded-xl px-6 py-4 text-red-300 text-sm">⚠ Error: {error}</div></div>;

  return (
    <div className="soc-page-shell soc-fluid-page flex flex-col gap-3 sm:gap-4 w-full min-w-0">
      {/* FIM Header */}
      <div className="soc-page-heading bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-3 md:p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
          <div>
            <h1 className="soc-page-title flex items-center gap-2">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400" />
              File Integrity Monitoring
            </h1>
            <p className="soc-page-subtitle">Real-time file changes monitoring</p>
          </div>
        </div>
      </div>

      {/* FIM Data Container */}
      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-2 md:p-4 flex flex-col gap-3 md:gap-4">
        <div className="soc-data-toolbar flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="rows-selector flex items-center gap-2 min-w-0 flex-shrink-0">
          <label className="hidden items-center gap-1 text-[10px] text-slate-400 sm:flex whitespace-nowrap">
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
          </div>

          <div className="soc-filter-toolbar ml-auto flex flex-wrap items-center gap-2">
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

        <div className="soc-kpi-grid">
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
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-5 flex flex-col h-full overflow-visible soc-fluid-card">
            <div className="soc-chart-header flex flex-wrap justify-between items-start gap-x-3 gap-y-1.5 mb-4 md:mb-4">
              <div className="text-[11px] md:text-xs font-semibold text-slate-300 flex items-center gap-1 md:gap-2 min-w-0">
                <Activity className="h-3 md:h-4 w-3 md:w-4 text-emerald-400 shrink-0" />
                <span className="truncate">FIM Timeline</span>
              </div>
              <div className="soc-chart-meta text-right min-w-0">
                <div className="text-xs text-slate-500 whitespace-nowrap">Last {rangeKey}</div>
                <div className="text-[11px] text-slate-600 break-words">Updated {formatLiveTimestamp(lastUpdated)}</div>
              </div>
            </div>
            <div className="flex-1 min-h-0 min-w-0 soc-chart--fim rounded-lg bg-[var(--soc-card)] p-2 md:p-4 overflow-visible">
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
          <div ref={topAgentsPanelRef} className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-5 h-full flex flex-col">
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
            <div className="flex-1 flex flex-col">
              <TopAgentsCard agents={derived.topAgents} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          {/* Kotak 1: Event + Severity Distribution */}
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 shadow-lg flex flex-col h-auto soc-fluid-card">
            <div className="w-full text-[11px] md:text-xs font-semibold text-slate-300 mb-4">Event & Severity Distribution</div>
            {derived.total === 0 ? (
              <div className="flex flex-1 items-center justify-center gap-1 text-xs text-slate-600">
                <span>No </span><span className="font-semibold">event &amp; severity distribution</span><span> data</span>
              </div>
            ) : (
              <div className="flex flex-row flex-wrap gap-3 md:gap-4 flex-1 items-center justify-center min-h-0">
                <div className="flex min-w-[124px] flex-1 flex-col items-center justify-center">
                  <Donut items={derived.eventItems} size={donutSize} stroke={donutStroke} centerLabelTop={derived.total} centerLabelBottom="events" compact={isMobile} activeLabel={selectedEventType} onSelect={handleSelectEventType} />
                  <div className="w-full text-xs mt-3"><Legend items={derived.eventItems} activeLabel={selectedEventType} onSelect={handleSelectEventType} compact={isMobile} /></div>
                </div>
                <div className="flex min-w-[124px] flex-1 flex-col items-center justify-center">
                  <Donut items={derived.severityItems} size={donutSize} stroke={donutStroke} centerLabelTop={derived.total} centerLabelBottom="severity" compact={isMobile} activeLabel={selectedSeverity} onSelect={handleSelectSeverity} />
                  <div className="w-full text-xs mt-3"><Legend items={derived.severityItems} activeLabel={selectedSeverity} onSelect={handleSelectSeverity} compact={isMobile} /></div>
                </div>
              </div>
            )}
          </div>
          {/* Kotak 2: Payload Pattern Cloud */}
          <div className="soc-payload-distribution-card bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 shadow-lg flex flex-col">
            <div className="w-full text-[11px] md:text-xs font-semibold text-slate-300 mb-4">Payload Pattern Cloud</div>
            <div className="command-keywords-distribution-box w-full h-0 flex-1 min-h-0 rounded-xl overflow-hidden">
              <PayloadWordCloud words={derived.payloadWords} activeWord={selectedPayloadPattern} onWordClick={handleSelectPayload} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg overflow-hidden">
        <div ref={logsTableRef} className="p-3 md:p-4 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
          {selectedTimelinePoint && (
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="text-xs text-emerald-300">
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
                className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20"
              >
                Reset Time Filter
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agent, user, path, event, rule..."
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="appearance-none rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-8 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              >
                <option value="all" className="bg-white text-black">All agents</option>
                {filterOptions.agents.map((agent) => (
                  <option key={agent} value={agent} className="bg-white text-black">{agent}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="relative">
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="appearance-none rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-8 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              >
                <option value="all" className="bg-white text-black">All users</option>
                {filterOptions.users.map((user) => (
                  <option key={user} value={user} className="bg-white text-black">{user}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="relative">
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="appearance-none rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-8 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              >
                <option value="all" className="bg-white text-black">All events</option>
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-white text-black">{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="relative">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="appearance-none rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-8 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              >
                <option value="all" className="bg-white text-black">All severities</option>
                {SEVERITY_LABELS.map((sev) => (
                  <option key={sev} value={sev} className="bg-white text-black">{sev}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>
          </div>
        </div>

        {vizFiltersActive && (
          <div className="px-2 md:px-3 py-2 border-b border-[var(--soc-border)] bg-slate-900/40 flex flex-wrap items-center gap-1.5 md:gap-2">
            <span className="text-[10px] md:text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Active Filters:</span>
            {selectedEventType && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] md:text-[11px] text-sky-300">
                Event: {String(selectedEventType).charAt(0).toUpperCase() + String(selectedEventType).slice(1)}
                <button onClick={() => handleSelectEventType(selectedEventType)} className="hover:text-white" aria-label="Remove event type filter"><X className="h-3 w-3" /></button>
              </span>
            )}
            {selectedSeverity && (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] md:text-[11px] text-orange-300">
                Severity: {selectedSeverity}
                <button onClick={() => handleSelectSeverity(selectedSeverity)} className="hover:text-white" aria-label="Remove severity filter"><X className="h-3 w-3" /></button>
              </span>
            )}
            {selectedPayloadPattern && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] md:text-[11px] text-emerald-300">
                Payload: {selectedPayloadPattern}
                <button onClick={() => handleSelectPayload(selectedPayloadPattern)} className="hover:text-white" aria-label="Remove payload filter"><X className="h-3 w-3" /></button>
              </span>
            )}
            <span className="text-[10px] md:text-[11px] font-mono text-slate-400">
              <span className="font-bold text-sky-300">{(crossFilteredEvents || []).length.toLocaleString()}</span>
              <span className="hidden sm:inline"> matching events</span>
            </span>
            <button
              onClick={clearVizFilters}
              className="ml-auto text-[10px] md:text-[11px] font-semibold text-slate-300 hover:text-sky-300 border border-slate-700 rounded-full px-2 py-0.5 hover:border-sky-500/50 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="overflow-x-auto soc-table-scroll">
          <table className="w-full min-w-[720px] text-[10px] md:text-[11px] text-left soc-responsive-table">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/70">
                {["↓ time", "agent", "user", "path", "event", "payload", "severity"].map(h => (
                  <th key={h} className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">
                    {vizFiltersActive ? (
                      <div className="flex flex-col items-center gap-2">
                        <span>No logs match the selected filters.</span>
                        <button onClick={clearVizFilters} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-semibold text-slate-300 hover:border-sky-500/50 hover:text-sky-300 transition-colors">Clear filters</button>
                      </div>
                    ) : (
                      "No FIM events found for the selected filter."
                    )}
                  </td>
                </tr>
              ) : visibleEvents.map((evt, idx) => (
                <tr
                  key={evt.id}
                  className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${idx % 2 !== 0 ? "bg-slate-900/60" : ""
                    }`}
                >
                  <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-500 text-[10px] md:text-[11px]">{formatTime(evt.timestamp)}</td>
                  <td className="px-2 md:px-4 py-1.5 md:py-3 text-sky-400 font-medium text-[10px] md:text-[11px]">{evt.agentName}</td>
                  <td className="px-2 md:px-4 py-1.5 md:py-3 text-violet-400 font-medium text-[10px] md:text-[11px]">{evt.username}</td>
                  <td className="px-2 md:px-4 py-1.5 md:py-3 text-emerald-400 font-mono text-[10px] md:text-[11px] truncate">{evt.syscheckPath}</td>
                  <td className="px-2 md:px-4 py-1.5 md:py-3">
                    <span
                      className={`text-[10px] md:text-[11px] px-1 md:px-2 py-0.5 rounded border ${evt.syscheckEvent === "deleted"
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
                <span className="font-bold text-sky-400">{displayTotal === 0 ? 0 : (safeDisplayPage - 1) * pageSize + 1}</span>
                <span className="hidden md:inline"> - </span>
                <span className="md:hidden">-</span>
                <span className="font-bold text-sky-400">{Math.min(safeDisplayPage * pageSize, displayTotal)}</span>
                <span className="hidden md:inline"> OF </span>
                <span className="md:hidden"> / </span>
                <span className="font-bold text-sky-400">{displayTotal}</span>
                <span className="hidden md:inline"> EVENTS</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={safeDisplayPage === 1 || loading}
                onClick={() => goToDisplayPage(1)}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
              >
                <span className="hidden md:inline">FIRST</span>
                <span className="md:hidden">«</span>
              </button>
              <button
                disabled={safeDisplayPage === 1 || loading}
                onClick={() => goToDisplayPage(Math.max(safeDisplayPage - 1, 1))}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
              >
                <span className="hidden md:inline">← PREV</span>
                <span className="md:hidden">‹</span>
              </button>
              <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400">
                <span className="hidden md:inline">PAGE </span>
                <span className="text-white">{safeDisplayPage}</span> / {displayPages}
              </span>
              <button
                disabled={safeDisplayPage === displayPages || loading}
                onClick={() => goToDisplayPage(Math.min(safeDisplayPage + 1, displayPages))}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
              >
                <span className="hidden md:inline">NEXT →</span>
                <span className="md:hidden">›</span>
              </button>
              <button
                disabled={safeDisplayPage === displayPages || loading}
                onClick={() => goToDisplayPage(displayPages)}
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
