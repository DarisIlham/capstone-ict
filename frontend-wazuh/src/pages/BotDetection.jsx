import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BrainCircuit,
  ChevronDown,
  Clock,
  Flame,
  Gauge,
  Globe,
  Network,
  Radio,
  Radar,
  Search,
  Server,
  ShieldAlert,
  SlidersHorizontal,
  Terminal,
  Users,
  Waves,
  X,
} from "lucide-react";
import botDetectionApi from '../services/botDetectionApi';
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import PageLoader from "../components/PageLoader";
import ExportCsvButton from "../components/ExportCsvButton";
import { exportCsv } from "../utils/exportCsv";
import {
  createDefaultDateRange,
  normalizeDateRange,
  getIsoDateRange,
  getDateRangeMinutes,
} from "../utils/dateRange";
import { adaptiveLeftGutter } from "../utils/chartAxis";
import { InlineEmptyState } from "../components/EmptyState";

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_TIME_RANGE = '24h';
const RANGE_TO_MINUTES = { '1h': 60, '24h': 1440, '7d': 10080, '30d': 43200 };

// Canonical behavior detector metadata: label, filter value, trend/legend
// color, badge tone, icon, and primary metric unit.
const BEHAVIOR_TYPES = [
  { key: "HTTP_BRUTE_FORCE", value: "http", label: "HTTP Brute Force", short: "HTTP BRUTE FORCE", color: "#f97316", badge: "bg-orange-900/30 text-orange-400 border-orange-700/50", icon: Flame, primaryUnit: "attempts" },
  { key: "SSH_BRUTE_FORCE", value: "ssh", label: "SSH Brute Force", short: "SSH BRUTE FORCE", color: "#f59e0b", badge: "bg-amber-900/30 text-amber-400 border-amber-700/50", icon: Terminal, primaryUnit: "attempts" },
  { key: "PORT_SCAN", value: "port", label: "Port Scan", short: "PORT SCAN", color: "#2dd4bf", badge: "bg-teal-900/30 text-teal-400 border-teal-700/50", icon: Radar, primaryUnit: "ports" },
  { key: "HOST_SCAN", value: "host", label: "Host Scan", short: "HOST SCAN", color: "#a78bfa", badge: "bg-violet-900/30 text-violet-400 border-violet-700/50", icon: Network, primaryUnit: "hosts" },
  { key: "CONNECTION_FLOOD", value: "flood", label: "Connection Flood", short: "CONNECTION FLOOD", color: "#fb7185", badge: "bg-rose-900/30 text-rose-400 border-rose-700/50", icon: Waves, primaryUnit: "conns" },
  { key: "BEACONING", value: "beacon", label: "Beaconing", short: "BEACONING", color: "#818cf8", badge: "bg-indigo-900/30 text-indigo-400 border-indigo-700/50", icon: Radio, primaryUnit: "conns" },
];

const SERIES = [
  { key: 'mlBotnet', label: 'ML Botnet', color: '#38bdf8' },
  ...BEHAVIOR_TYPES.map((t) => ({ key: t.key, label: t.label, color: t.color })),
];

const behaviorMeta = (key) => BEHAVIOR_TYPES.find((t) => t.key === key) || null;
const behaviorLabel = (key) => {
  const meta = behaviorMeta(key);
  if (meta) return meta.label;
  return String(key || "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ") || "Behavior";
};

const getValidDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDetailedTimestamp = (timestamp) => {
  const date = getValidDate(timestamp);
  if (!date) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const formatLiveTimestamp = (isoString) => {
  const date = getValidDate(isoString);
  if (!date) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const getRangeWindow = (rangeKey) => {
  const end = new Date();
  const start = new Date(end);
  switch (rangeKey) {
    case '1h': start.setHours(start.getHours() - 1); break;
    case '24h': start.setDate(start.getDate() - 1); break;
    case '7d': start.setDate(start.getDate() - 7); break;
    case '30d': default: start.setDate(start.getDate() - 30); break;
  }
  return { start: start.toISOString(), end: end.toISOString() };
};
const formatBucketLabel = (timestamp, rangeKey) => {
  const date = getValidDate(timestamp);
  if (!date) return '-';
  if (rangeKey === '1h') return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (rangeKey === '24h') return date.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit' });
  if (rangeKey === '7d') return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: '2-digit' });
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};
const minutesToRangeKey = (minutes) => {
  if (minutes <= 60) return '1h';
  if (minutes <= 1440) return '24h';
  if (minutes <= 10080) return '7d';
  return '30d';
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));
const formatBytes = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return '-';
  if (num === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  const scaled = num / Math.pow(1024, idx);
  return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1)} ${units[idx]}`;
};
// Compact axis labels for byte charts (e.g. 1200 -> 1.2K).
const formatBytesCompact = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return '-';
  if (num < 1000) return `${Math.round(num)}`;
  const units = ["", "K", "M", "G", "T"];
  const idx = Math.min(Math.floor(Math.log(num) / Math.log(1000)), units.length - 1);
  const scaled = num / Math.pow(1000, idx);
  return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1)}${units[idx]}`;
};
const formatPercent = (value, digits = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${(num * 100).toFixed(digits)}%`;
};

// ── KPI Card (kpi-modern seperti MlDashboard / FimEvents) ─────────────────────
const KPICard = ({ label, value, icon: Icon, color, desc, loading, index = 0, title }) => (
  <div className={`kpi-modern animate-fadeInUp stagger-${index + 1}`} style={{ opacity: 0 }} title={title}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">{label}</span>
      <div className="p-2 rounded-lg bg-opacity-10">
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
    </div>
    <div className={`text-xl font-bold ${color} mb-1`}>
      {loading ? <div className="skeleton h-6 w-16"></div> : value}
    </div>
    {desc && <div className="text-[9px] text-[var(--soc-text-muted)]">{desc}</div>}
  </div>
);

// ── BarList (seperti MlDashboard) ────────────────────────────────────────────
const BarList = ({ items, emptyLabel = "No data", onSelect = null, activeValue = null, formatValue = null }) => {
  if (!items || items.length === 0) {
    return <InlineEmptyState title={emptyLabel} />;
  }
  const fmt = typeof formatValue === "function" ? formatValue : formatNumber;
  const maxValue = Math.max(...items.map((d) => d.value), 1);
  const CHART_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
  return (
    <div className="w-full min-w-0 max-w-full space-y-1.5">
      {items.map((item, i) => {
        const color = item.color || CHART_COLORS[i % CHART_COLORS.length];
        const label = item.label;
        const value = item.value;
        const isActive = activeValue != null && String(label) === String(activeValue);
        const inner = (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold shrink-0" style={{ color }}>{i + 1}</span>
                <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)] font-mono" title={item.title || label}>{label}</span>
              </div>
              <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{fmt(value)}</span>
            </div>
            <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
              <div className="h-full rounded-full transition-all duration-500" title={`${label}: ${fmt(value)}`} style={{ width: `${(value / maxValue) * 100}%`, backgroundColor: color }} />
            </div>
          </>
        );
        if (!onSelect) {
          return <div key={`${label}-${i}`} className="w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg">{inner}</div>;
        }
        return (
          <button key={`${label}-${i}`} type="button" onClick={() => onSelect(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg text-left ${isActive ? "bg-violet-500/10 ring-1 ring-violet-500/30" : ""}`}>
            {inner}
          </button>
        );
      })}
    </div>
  );
};

// ── Multi-series WaveChart (idiom WaveChart MlDashboard, 3 seri) ─────────────
  const MultiWaveChart = ({ data, series, rangeKey = "24h", height = 220, formatValue = null, formatAxis = null, logScale = false, axisColor = "var(--soc-border)", onPointSelect = null, activePointKey = null, pointHint = null }) => {
  const [hovered, setHovered] = useState(null);
  const rootRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ width: Math.max(rect.width, 200), height: Math.max(rect.height, 40) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const width = size.width;
  const plotH = size.height;
  if (!width || !plotH) return <div ref={rootRef} className="relative h-full w-full" />;
  if (!data || data.length === 0 || !series || series.length === 0) {
    return (
      <div ref={rootRef} className="relative h-full w-full">
        <InlineEmptyState title="No detection alerts found for the selected period." description="" />
      </div>
    );
  }

  const maxV = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  // Log scale reveals low-volume series (e.g. behavior counts in the
  // hundreds) next to a dominant series (ML in the tens of thousands).
  const useLog = logScale === true && maxV > 1;
  // Ceiling the scale to a full decade keeps grid labels on exact powers
  // of 10, so the top two labels can never collide (e.g. 10000 vs 13619).
  const logMax = useLog ? Math.max(Math.ceil(Math.log10(maxV + 1)), 1) : 1;
  const gridVals = [];
  if (useLog) {
    let powers = [];
    for (let p = 0; p <= logMax; p += 1) powers.push(Math.pow(10, p));
    while (powers.length > 6) powers = powers.filter((_, idx) => idx % 2 === 0);
    gridVals.push(...powers);
  } else {
    const gridSteps = 5;
    for (let i = 0; i < gridSteps; i += 1) gridVals.push(Math.round((i / (gridSteps - 1)) * maxV));
  }
  const axisLabel = (value) => (typeof formatAxis === "function" ? formatAxis(value) : value);
  const valueLabel = (value) => (typeof formatValue === "function" ? formatValue(Number(value) || 0) : (Number(value) || 0));
  const padding = { l: adaptiveLeftGutter(gridVals, 28), r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = plotH - padding.t - padding.b;
  const xFor = (i) => padding.l + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
  const yFor = (v) => {
    const num = Number(v) || 0;
    if (useLog) return padding.t + innerH - (Math.log10(num + 1) / logMax) * innerH;
    return padding.t + innerH - (num / maxV) * innerH;
  };

  const paths = series.map((s) => {
    let d = "";
    data.forEach((point, i) => {
      const x = xFor(i);
      const y = yFor(Number(point[s.key]) || 0);
      if (i === 0) d += `M ${x} ${y}`;
      else {
        const prevX = xFor(i - 1);
        const prevY = yFor(Number(data[i - 1][s.key]) || 0);
        const controlX = (prevX + x) / 2;
        d += ` C ${controlX} ${prevY}, ${controlX} ${y}, ${x} ${y}`;
      }
    });
    return { ...s, d };
  });

  const tickCount = clamp(Math.floor(innerW / 160), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));
  const stepW = data.length > 1 ? innerW / (data.length - 1) : innerW;
  // Bucket width inferred from consecutive points (date_histogram buckets
  // are uniform); used to build the click-to-filter time window.
  const bucketMs = (() => {
    if (data.length > 1) {
      const a = new Date(data[0].timestamp).getTime();
      const b = new Date(data[1].timestamp).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) return b - a;
    }
    return 60 * 60 * 1000;
  })();
  const pointWindow = (point) => {
    const startMs = new Date(point.timestamp).getTime();
    if (!Number.isFinite(startMs)) return null;
    return {
      key: String(point.timestamp),
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + bucketMs - 1).toISOString(),
    };
  };
  const activeIdx = activePointKey != null ? data.findIndex((p) => String(p.timestamp) === String(activePointKey)) : -1;

  // Klik pada kolom transparan di atas tidak tahu seri mana yang dituju, jadi
  // seri terdekat secara vertikal dari posisi kursor yang dipakai. Tanpa ini
  // user mengklik garis "Beaconing" tapi tabel tetap menampilkan semua detektor
  // (default ML botnet) sehingga kelihatan seperti filter tidak bekerja.
  const nearestSeriesAt = (point, clientY) => {
    if (!series.length) return null;
    const box = svgRef.current?.getBoundingClientRect();
    // viewBox == pixel size, tapi CSS bisa menskalakan svg; normalisasi dulu.
    const scaleY = box && box.height ? plotH / box.height : 1;
    const y = (clientY - (box?.top || 0)) * scaleY;
    let best = null;
    let bestDist = Infinity;
    for (const s of series) {
      const value = Number(point[s.key]) || 0;
      if (value <= 0) continue;
      const dist = Math.abs(yFor(value) - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    return best;
  };

  return (
    <div ref={rootRef} className="relative h-full w-full" onMouseLeave={() => setHovered(null)}>
      <svg ref={svgRef} width={width} height={plotH} viewBox={`0 0 ${width} ${plotH}`} className="block">
        {gridVals.map((value, i) => {
          const y = yFor(value);
          return (
            <g key={`grid-${i}`}>
              <line x1={padding.l} y1={y} x2={padding.l + innerW} y2={y} stroke="var(--soc-border)" strokeDasharray="2,2" opacity="0.5" />
              <text x={padding.l - 5} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="500">{axisLabel(value)}</text>
            </g>
          );
        })}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke={axisColor} />
        {paths.map((s, si) => (
          <g key={s.key}>
            <defs>
              <linearGradient id={`botWave-${s.key}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.24" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {si === 0 && (
              <path d={`${s.d} L ${xFor(data.length - 1)} ${padding.t + innerH} L ${xFor(0)} ${padding.t + innerH} Z`} fill={`url(#botWave-${s.key})`} />
            )}
            <path d={s.d} stroke={s.color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          </g>
        ))}
        {data.map((point, i) => {
          const total = series.reduce((sum, s) => sum + (Number(point[s.key]) || 0), 0);
          const colX = Math.max(xFor(i) - stepW / 2, padding.l);
          const colRight = Math.min(xFor(i) + stepW / 2, padding.l + innerW);
          const colW = Math.max(colRight - colX, 8);
          return (
            <g key={`tick-${point.timestamp}-${i}`}>
              <rect x={colX} y={padding.t} width={colW} height={innerH} fill="transparent"
                style={{ cursor: onPointSelect ? "pointer" : "default" }}
                onMouseEnter={() => {
                  const top = Math.min(...series.map((s) => yFor(Number(point[s.key]) || 0)));
                  setHovered({ index: i, x: xFor(i), y: top, point, total });
                }}
                onFocus={() => {
                  const top = Math.min(...series.map((s) => yFor(Number(point[s.key]) || 0)));
                  setHovered({ index: i, x: xFor(i), y: top, point, total });
                }}
                onClick={(e) => {
                  if (!onPointSelect) return;
                  const range = pointWindow(point);
                  if (!range) return;
                  const near = nearestSeriesAt(point, e.clientY);
                  onPointSelect({ ...range, seriesKey: near?.key || null });
                }}>
                {onPointSelect && (
                  <title>{pointHint ? pointHint(point) : `Filter table: ${formatDetailedTimestamp(point.timestamp)}`}</title>
                )}
              </rect>
              {i === activeIdx && (
                <line x1={xFor(i)} y1={padding.t} x2={xFor(i)} y2={padding.t + innerH} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.8" className="pointer-events-none" />
              )}
              {i % tickEvery === 0 && (
                <>
                  <line x1={xFor(i)} y1={padding.t + innerH} x2={xFor(i)} y2={padding.t + innerH + 3} stroke={axisColor} />
                  <text x={xFor(i)} y={padding.t + innerH + 14} textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"} fontSize="10" fill="#64748b" fontWeight="500">
                    {formatBucketLabel(point.timestamp, rangeKey)}
                  </text>
                </>
              )}
            </g>
          );
        })}
        {paths.map((s) => data.map((point, i) => (
          <circle key={`${s.key}-${i}`} cx={xFor(i)} cy={yFor(Number(point[s.key]) || 0)} r="2.5" fill={s.color} opacity="0.95" className="pointer-events-none" />
        )))}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute z-10 min-w-[140px] max-w-[230px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-lg"
          style={(() => {
            // Float beside/above the point — never glued to the cursor.
            // Flips to the roomier side near the chart edges.
            const estW = 210;
            const estH = 64 + series.length * 20;
            const gap = 14;
            let left = hovered.x + gap;
            if (left + estW > width - 4) left = hovered.x - estW - gap;
            left = clamp(left, 4, Math.max(4, width - estW - 4));
            const anchorY = Number.isFinite(hovered.y) ? hovered.y : plotH / 2;
            let top = anchorY - estH - 10;
            if (top < 4) top = anchorY + 16;
            top = clamp(top, 4, Math.max(4, plotH - estH - 4));
            return { left: `${left}px`, top: `${top}px` };
          })()}>
          <div className="font-semibold text-[var(--soc-text-primary)]">{formatValue ? valueLabel(hovered.total) : `${hovered.total} alerts`}</div>
          <div className="mt-1 space-y-0.5">
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-[var(--soc-text-secondary)]">
                <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="flex-1">{s.label}</span>
                <span className="font-mono font-semibold">{valueLabel(hovered.point[s.key])}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 text-[var(--soc-text-muted)]">{formatDetailedTimestamp(hovered.point.timestamp)}</div>
        </div>
      )}
    </div>
  );
};

// ── Badges ───────────────────────────────────────────────────────────────────
const DetectionBadge = ({ alert }) => {
  if (alert.detectorType === "ml") {
    return <span className="text-[9px] md:text-[10px] px-1.5 py-0.5 rounded-full border font-semibold bg-red-900/30 text-red-400 border-red-700/50">BOTNET</span>;
  }
  const meta = behaviorMeta(alert.detectionType);
  return (
    <span className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${meta?.badge || "bg-slate-800/60 text-slate-300 border-slate-700/50"}`}>
      {meta?.short || String(alert.detectionType || alert.alertType || "BEHAVIOR")}
    </span>
  );
};

// ── Level Badge: highlight confidence/activity — makin tinggi makin panas ────
// ML (botnet probability): ≥80% merah, ≥65% oranye, ≥50% kuning.
// Behavior (attempts/ports vs threshold): ≥2x merah, ≥1.5x oranye, ≥1x kuning.
const levelTone = (tier) => {
  if (tier === 3) return "bg-red-900/30 text-red-400 border-red-700/50";
  if (tier === 2) return "bg-orange-900/30 text-orange-400 border-orange-700/50";
  if (tier === 1) return "bg-yellow-900/30 text-yellow-400 border-yellow-700/50";
  return "bg-slate-800/60 text-slate-300 border-slate-700/50";
};

const LevelBadge = ({ alert, label }) => {
  let tier = 0;
  let title = String(label ?? "-");
  if (alert.detectorType === "ml") {
    const p = Number(alert.probability);
    if (!Number.isFinite(p)) return <span className="text-slate-400">-</span>;
    const pct = p * 100;
    if (pct >= 80) tier = 3;
    else if (pct >= 65) tier = 2;
    else if (pct >= 50) tier = 1;
    title = `Botnet probability ${pct.toFixed(2)}% — higher means more botnet-like (threshold 0.50)`;
  } else {
    const value = Number(alert.primaryValue);
    if (!Number.isFinite(value)) return <span className="text-slate-400">-</span>;
    const unit = alert.primaryLabel || "events";
    const threshold = Number(alert.threshold);
    if (Number.isFinite(threshold) && threshold > 0) {
      const ratio = value / threshold;
      if (ratio >= 2) tier = 3;
      else if (ratio >= 1.5) tier = 2;
      else if (ratio >= 1) tier = 1;
      title = `${value} ${unit} vs threshold ${threshold} (${ratio.toFixed(1)}x) within ${alert.windowSeconds || 60}s — higher means more intense`;
    } else {
      title = `${value} ${unit} observed within ${alert.windowSeconds || 60}s`;
    }
  }
  return (
    <span title={title} className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded border font-semibold inline-block whitespace-nowrap ${levelTone(tier)}`}>
      {label}
    </span>
  );
};

// ── Bot Combined Filter (konsep MlCombinedFilter: satu tombol Filters + panel) ─
const BotCombinedFilter = ({
  behaviorType, onBehaviorTypeChange,
  protocol, onProtocolChange,
  minProbability, onMinProbabilityChange,
  agentFilter, onAgentChange, agentOptions = [],
  srcIpFilter, onSrcIpChange, srcIpOptions = [],
  dstIpFilter, onDstIpChange, dstIpOptions = [],
  timelineFilterLabel = "",
  onClearTimelineFilter = null,
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const calcPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 280;
    const dropdownHeight = 380;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    let top = spaceBelow < dropdownHeight + gap ? rect.top - dropdownHeight - gap : rect.bottom + gap;
    let left = spaceRight < dropdownWidth ? rect.right - dropdownWidth : rect.left;
    if (left < 8) left = 8;
    if (left + dropdownWidth > window.innerWidth - 8) left = window.innerWidth - dropdownWidth - 8;
    setCoords({ top, left });
  }, []);
  useEffect(() => {
    if (!open) return;
    calcPosition();
    const handleClick = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    const handleKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const handleReposition = () => { if (open) calcPosition(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, calcPosition]);
  const clearAll = () => {
    onBehaviorTypeChange("all");
    onProtocolChange("all");
    onMinProbabilityChange("all");
    onAgentChange("all");
    onSrcIpChange("all");
    onDstIpChange("all");
    if (onClearTimelineFilter) onClearTimelineFilter();
  };
  const activeCount = [behaviorType !== "all", protocol !== "all", minProbability !== "all", agentFilter !== "all", srcIpFilter !== "all", dstIpFilter !== "all", Boolean(timelineFilterLabel)].filter(Boolean).length;
  const Section = ({ label, value, allLabel, options, onChange }) => (
    <div className="px-3 py-2">
      <div className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => onChange("all")} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${value === "all" ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{allLabel}</button>
        {options.map((opt) => (
          <button key={opt.value} onClick={() => onChange(opt.value)} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${value === opt.value ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{opt.label}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div ref={containerRef} className="relative">
      <button ref={buttonRef} type="button" onClick={() => setOpen((c) => !c)} className="flex items-center gap-2 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-2.5 text-[11px] text-[var(--soc-text-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-colors hover:bg-[var(--soc-elevated)]">
        <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--soc-text-muted)]" />
        <span className="font-medium">Filters</span>
        {activeCount > 0 && <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-sky-500/20 text-sky-300 text-[9px] font-bold">{activeCount}</span>}
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--soc-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="fixed z-[9999] w-[280px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] shadow-2xl" style={{ top: coords.top, left: coords.left }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--soc-border)]">
            <span className="text-[10px] font-semibold text-[var(--soc-text-primary)]">Filter Options</span>
            {activeCount > 0 && <button onClick={clearAll} className="text-[9px] font-semibold text-sky-400 hover:text-sky-300 transition-colors">Clear all</button>}
          </div>
          {timelineFilterLabel && (
            <div className="border-b border-[var(--soc-border)] px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">Timeline filter</div>
              <div className="mt-1.5 flex items-center gap-1.5 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-300">
                <Clock className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                <span className="min-w-0 flex-1 truncate" title={timelineFilterLabel}>{timelineFilterLabel}</span>
                <button onClick={onClearTimelineFilter} className="shrink-0 hover:text-white" aria-label="Clear timeline filter"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}
          <div className="divide-y divide-[var(--soc-border)] max-h-[360px] overflow-y-auto">
            <Section label="Behavior Type" value={behaviorType} allLabel="All behavior" options={BEHAVIOR_TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={onBehaviorTypeChange} />
            <Section label="Agent" value={agentFilter} allLabel="All agents" options={agentOptions} onChange={onAgentChange} />
            <Section label="Source IP" value={srcIpFilter} allLabel="All source IPs" options={srcIpOptions} onChange={onSrcIpChange} />
            <Section label="Destination IP" value={dstIpFilter} allLabel="All destination IPs" options={dstIpOptions} onChange={onDstIpChange} />
            <Section label="Protocol" value={protocol} allLabel="All protocols" options={[{ value: "tcp", label: "TCP" }, { value: "udp", label: "UDP" }, { value: "icmp", label: "ICMP" }]} onChange={onProtocolChange} />
            <Section label="Min Probability" value={minProbability} allLabel="Any probability" options={[{ value: "0.5", label: "≥ 0.50" }, { value: "0.6", label: "≥ 0.60" }, { value: "0.7", label: "≥ 0.70" }, { value: "0.8", label: "≥ 0.80" }, { value: "0.9", label: "≥ 0.90" }]} onChange={onMinProbabilityChange} />
          </div>
        </div>
      )}
    </div>
  );
};

export default function BotDetection() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [dataNotice, setDataNotice] = useState('');

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [topSources, setTopSources] = useState([]);
  const [topDestinations, setTopDestinations] = useState({ destinations: [], topPorts: [] });
  const [traffic, setTraffic] = useState(null);
  const [trafficTimeline, setTrafficTimeline] = useState({ agents: [], points: [] });
  const [ipTab, setIpTab] = useState("source");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [isolatedTrend, setIsolatedTrend] = useState(null);
  const [isolatedVMs, setIsolatedVMs] = useState(null);
  const [topAgents, setTopAgents] = useState({ agents: [], uniqueAgents: 0 });
  const [alerts, setAlerts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [detectorTab] = useState("all");
  const [behaviorType, setBehaviorType] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [srcIpFilter, setSrcIpFilter] = useState("all");
  const [dstIpFilter, setDstIpFilter] = useState("all");
  const [protocol, setProtocol] = useState("all");
  const [minProbability, setMinProbability] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState(DEFAULT_TIME_RANGE);
  const [filterMode, setFilterMode] = useState("range");
  const [customDateRange, setCustomDateRange] = useState(() => createDefaultDateRange(1));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const alertsTableRef = useRef(null);

  const scrollTableIntoView = useCallback(() => {
    if (alertsTableRef.current?.scrollIntoView) {
      try { alertsTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* abaikan */ }
    }
  }, []);

  // Klik titik grafik ikut memfilter detektor yang di-point. Tanpa ini tabel
  // tetap menampilkan semua seri sehingga user menekan "Beaconing" tapi log
  // yang muncul malah didominasi ML botnet (klik pada kolom kosong di area
  // tempat seri bernilai 0 sengaja dibiarkan tanpa filter seri).
  const handlePointSelect = useCallback((point, source) => {
    setPage(1);
    const samePoint = selectedPoint && selectedPoint.key === point.key && selectedPoint.source === source;
    if (samePoint) {
      // Klik ulang titik yang sama = toggle off. Filter detektor WAJIB ikut
      // dilepas di sini; kalau hanya CHIP waktu yang dihapus, tabel tetap
      // terkunci ke satu seri dan user mengira kliknya tidak berefek.
      setSelectedPoint(null);
      if (selectedPoint.seriesKey && selectedPoint.seriesKey !== "mlBotnet") {
        setBehaviorType("all");
      }
      return;
    }
    if (point.seriesKey) {
      if (point.seriesKey === "mlBotnet") {
        setBehaviorType("all");
        setAgentFilter("all");
        setSrcIpFilter("all");
        setDstIpFilter("all");
      } else {
        const meta = behaviorMeta(point.seriesKey);
        if (meta) setBehaviorType(meta.value);
      }
    }
    setSelectedPoint({ ...point, source });
  }, [selectedPoint]);

  const buildParams = useCallback((extra = {}) => {
    let start;
    let end;
    if (filterMode === "custom") {
      const iso = getIsoDateRange(normalizeDateRange(customDateRange));
      start = iso.start;
      end = iso.end;
    } else {
      const range = getRangeWindow(timeRange);
      start = range.start;
      end = range.end;
    }
    const params = { start, end, ...extra };
    if (detectorTab !== "all") params.detector = detectorTab;
    if (behaviorType !== "all") params.behaviorType = behaviorType;
    if (protocol !== "all") params.protocol = protocol;
    if (minProbability !== "all") params.minProbability = minProbability;
    if (searchQuery.trim()) params.search = searchQuery.trim();
    return params;
  }, [filterMode, customDateRange, timeRange, detectorTab, behaviorType, protocol, minProbability, searchQuery]);

  const loadAll = useCallback(async (isRefresh = false, signal = null) => {
    if (signal?.aborted) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setDataNotice('');
    try {
      const common = buildParams();
      // A specific behavior type implies behavior-only scope for the mixed
      // ML+behavior lists (table, top IPs, top agents): ML rows cannot be
      // narrowed by behavior type, so they are excluded instead of being
      // shown unfiltered. Cards/trend/traffic keep their own scoping.
      const behaviorScope = behaviorType !== "all" ? { detector: "behavior" } : {};
      const scoped = { ...common, ...behaviorScope };
      // Click filters (agent / source IP / destination IP) scope ONLY the
      // alert table — cards, charts, and top lists keep showing all data.
      const alertParams = {
        ...buildParams({ page, limit: pageSize }),
        ...behaviorScope,
        ...(agentFilter !== "all" ? { agent: agentFilter } : {}),
        ...(srcIpFilter !== "all" ? { srcIp: srcIpFilter } : {}),
        ...(dstIpFilter !== "all" ? { dstIp: dstIpFilter } : {}),
      };
      // A clicked chart point narrows the alert table to that bucket window.
      if (selectedPoint) {
        alertParams.start = selectedPoint.start;
        alertParams.end = selectedPoint.end;
      }
      const opts = signal ? { signal } : {};
      const [
        summaryRes, trendRes, sourcesRes, destsRes, trafficRes, trafficTimelineRes, agentsRes, alertsRes,
      ] = await Promise.allSettled([
        botDetectionApi.getSummary(common, opts),
        botDetectionApi.getTrend(common, opts),
        botDetectionApi.getTopSources({ ...scoped, size: 5 }, opts),
        botDetectionApi.getTopDestinations(scoped, opts),
        botDetectionApi.getTraffic(common, opts),
        botDetectionApi.getTrafficTimeline(common, opts),
        botDetectionApi.getTopAgents(scoped, opts),
        botDetectionApi.getAlerts(alertParams, opts),
      ]);

      if (signal?.aborted) return;

      const notices = [];
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value?.data || null);
      else notices.push('Summary failed to load.');
      if (trendRes.status === 'fulfilled') setTrend(Array.isArray(trendRes.value?.data) ? trendRes.value.data : []);
      else notices.push('Alert trend failed to load.');
      if (sourcesRes.status === 'fulfilled') setTopSources(Array.isArray(sourcesRes.value?.data) ? sourcesRes.value.data : []);
      if (destsRes.status === 'fulfilled') setTopDestinations(destsRes.value?.data || { destinations: [], topPorts: [] });
      if (trafficRes.status === 'fulfilled') setTraffic(trafficRes.value?.data || null);
      else notices.push('Traffic volume failed to load.');
      if (trafficTimelineRes.status === 'fulfilled') setTrafficTimeline(trafficTimelineRes.value?.data || { agents: [], points: [] });
      if (agentsRes.status === 'fulfilled') setTopAgents(agentsRes.value?.data || { agents: [], uniqueAgents: 0 });
      else notices.push('Top agents failed to load.');
      if (alertsRes.status === 'fulfilled') {
        setAlerts(Array.isArray(alertsRes.value?.data) ? alertsRes.value.data : []);
        setPagination(alertsRes.value?.pagination || null);
      } else {
        notices.push('Alert list failed to load.');
      }

      const okCount = [summaryRes, trendRes, sourcesRes, destsRes, trafficRes, trafficTimelineRes, agentsRes, alertsRes]
        .filter((r) => r.status === 'fulfilled').length;
      if (okCount === 0) {
        setError(new Error('Bot Detection data is not available. Check the backend connection.'));
      } else {
        const totalAlerts = (summaryRes.status === 'fulfilled' ? Number(summaryRes.value?.data?.totalAlerts || 0) : 0);
        if (totalAlerts === 0) notices.push('No detection alerts found for the selected period.');
        if (summaryRes.status === 'fulfilled' && summaryRes.value?.data && (!summaryRes.value.data.mlAvailable || !summaryRes.value.data.behaviorAvailable)) {
          const missing = [
            !summaryRes.value.data.mlAvailable ? 'ML botnet index' : null,
            !summaryRes.value.data.behaviorAvailable ? 'behavior index' : null,
          ].filter(Boolean).join(' and ');
          notices.push(`Note: ${missing} not found in Elasticsearch — showing available data only.`);
        }
        setDataNotice(notices.join(' '));
        setLastUpdated(new Date().toISOString());
      }
    } catch (err) {
      if (signal?.aborted) return;
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildParams, page, pageSize, selectedPoint, agentFilter, srcIpFilter, dstIpFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const run = () => { void loadAll(false, controller.signal); };
    const timer = setTimeout(run, 0);
    const interval = setInterval(() => { void loadAll(true, controller.signal); }, 60_000);
    return () => { clearTimeout(timer); clearInterval(interval); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildParams, page, pageSize, selectedPoint, agentFilter, srcIpFilter, dstIpFilter]);

  const handleAgentSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const next = agentFilter === value ? "all" : value;
    setPage(1);
    setAgentFilter(next);
    if (next !== "all") scrollTableIntoView();
  }, [agentFilter, scrollTableIntoView]);

  const handleIPSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    if (ipTab === "source") {
      const next = srcIpFilter === value ? "all" : value;
      setPage(1);
      setSrcIpFilter(next);
      if (next !== "all") scrollTableIntoView();
    } else {
      const next = dstIpFilter === value ? "all" : value;
      setPage(1);
      setDstIpFilter(next);
      if (next !== "all") scrollTableIntoView();
    }
  }, [ipTab, srcIpFilter, dstIpFilter, scrollTableIntoView]);

  const handleExportCsv = async () => {
    // Export all rows matching the current filters (date range included),
    // not just the visible page — fetched page by page from the backend.
    const params = {
      ...buildParams({}),
      ...(behaviorType !== "all" ? { detector: "behavior" } : {}),
      ...(agentFilter !== "all" ? { agent: agentFilter } : {}),
      ...(srcIpFilter !== "all" ? { srcIp: srcIpFilter } : {}),
      ...(dstIpFilter !== "all" ? { dstIp: dstIpFilter } : {}),
    };
    if (selectedPoint) {
      params.start = selectedPoint.start;
      params.end = selectedPoint.end;
    }
    const SLICE_LIMIT = 5000;
    const MAX_ROWS = 50000;
    const MAX_DEPTH = 8;
    // One detector scope at a time; each scope is collected through
    // non-overlapping time slices (half-open windows would be ideal, but
    // the backend range is inclusive — duplicates across slice edges are
    // removed by id, so the result stays exact without cursor pagination).
    const scopes = behaviorType !== "all" ? ["behavior"] : ["ml", "behavior"];
    const seen = new Set();
    const all = [];
    const pushItems = (items) => {
      for (const item of items) {
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        delete item.raw;
        all.push(item);
      }
    };
    const collectSlice = async (sStart, sEnd, scope, depth) => {
      if (all.length >= MAX_ROWS) return;
      const res = await botDetectionApi.getAlerts({ ...params, detector: scope, limit: SLICE_LIMIT, start: sStart, end: sEnd });
      const items = Array.isArray(res?.data) ? res.data : [];
      pushItems(items);
      if (items.length >= SLICE_LIMIT && depth < MAX_DEPTH && all.length < MAX_ROWS) {
        const mid = new Date((new Date(sStart).getTime() + new Date(sEnd).getTime()) / 2).toISOString();
        await collectSlice(sStart, mid, scope, depth + 1);
        await collectSlice(mid, sEnd, scope, depth + 1);
      }
    };
    const rangeStart = new Date(params.start).getTime();
    const rangeEnd = new Date(params.end).getTime();
    const span = Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && rangeEnd > rangeStart
      ? rangeEnd - rangeStart
      : 24 * 3600 * 1000;
    const sliceCount = Math.min(48, Math.max(1, Math.round(span / 3600000)));
    for (const scope of scopes) {
      for (let i = 0; i < sliceCount && all.length < MAX_ROWS; i += 1) {
        const sStart = new Date(rangeStart + (span * i) / sliceCount).toISOString();
        const sEnd = new Date(rangeStart + (span * (i + 1)) / sliceCount).toISOString();
        await collectSlice(sStart, sEnd, scope, 0);
      }
      if (all.length >= MAX_ROWS) break;
    }
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const rows = all.slice(0, MAX_ROWS).map((a) => {
      return [
      formatDetailedTimestamp(a.timestamp),
      a.agent || "-",
      a.detectorType === "ml" ? "BOTNET" : behaviorLabel(a.detectionType),
      a.sourceIp || "-",
      a.destinationIp || "-",
      a.protocol || a.method || "-",
      a.detectorType === "ml"
        ? (a.probability != null ? `${(a.probability * 100).toFixed(2)}%` : "-")
        : (a.primaryValue != null ? `${a.primaryValue} ${a.primaryLabel || "events"}` : "-"),
      a.detectorType === "ml" && a.totalBytes != null ? `${a.totalBytes} bytes` : "-",
    ];});
    exportCsv({
      filename: `bot-detection-${new Date().toISOString().slice(0, 10)}.csv`,
      header: ["Time", "Agent", "Detection", "Source IP", "Destination IP", "Protocol", "Confidence", "Traffic (bytes)"],
      rows,
    });
  };

  const visibleSeries = useMemo(() => {
    if (detectorTab === "ml") return SERIES.filter((s) => s.key === "mlBotnet");
    if (detectorTab === "behavior") return SERIES.filter((s) => s.key !== "mlBotnet");
    return SERIES;
  }, [detectorTab]);

  const topSourceBarItems = useMemo(() => (topSources || []).map((s, i) => ({
    label: String(s.ip), value: Number(s.count) || 0, color: ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6"][i % 5],
  })), [topSources]);

  const topAgentBarItems = useMemo(() => (topAgents?.agents || []).map((a, i) => ({
    label: String(a.name), value: Number(a.count) || 0, color: ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6"][i % 5],
  })), [topAgents]);

  const agentFilterOptions = useMemo(() => (topAgents?.agents || []).map((a) => ({ value: String(a.name), label: String(a.name) })), [topAgents]);
  const srcIpFilterOptions = useMemo(() => (topSources || []).map((s) => ({ value: String(s.ip), label: String(s.ip) })), [topSources]);
  const dstIpFilterOptions = useMemo(() => (topDestinations?.destinations || []).map((d) => ({ value: String(d.ip), label: String(d.ip) })), [topDestinations]);

  const VM_SERIES_COLORS = ["#38bdf8", "#f97316", "#f59e0b", "#2dd4bf", "#a78bfa"];
  const vmSeries = useMemo(() => (trafficTimeline?.agents || []).map((name, i) => ({
    key: String(name), label: String(name), color: VM_SERIES_COLORS[i % VM_SERIES_COLORS.length],
  })), [trafficTimeline]);

  // Seri yang totalnya 0 di seluruh rentang waktu tidak digambar sama sekali.
  // Tanpa filter ini setiap seri kosong tetap jadi garis datar menempel di dasar
  // sumbu (yFor(0) selalu mengembalikan baseline), jadi chart penuh garis noise
  // padahal tidak ada data. Pakai some(), bukan reduce sum, supaya nilai
  // sekecil 1 tetap ikut tergambar.
  const hasTrendSignal = (s) => (trend || []).some((p) => (Number(p[s.key]) || 0) > 0);

  // Seri dengan nilai tertinggi pada sebuah bucket - dipakai untuk tooltip
  // native <title> supaya user tahu klik akan memfilter ke detektor mana.
  const nearestTrendSeries = (point) => {
    let best = null;
    for (const s of trendDisplaySeries) {
      const v = Number(point?.[s.key]) || 0;
      if (v > 0 && (!best || v > best.value)) best = { key: s.key, label: s.label, value: v };
    }
    return best;
  };

  // Legend isolation: show only the clicked series (chart rescales to it).
  // Seri yang di-isolate tetap digambar walau nol — user sengaja memintanya.
  const trendDisplaySeries = isolatedTrend
    ? visibleSeries.filter((s) => s.key === isolatedTrend)
    : visibleSeries.filter(hasTrendSignal);
  // Legend mengikuti apa yang digambar, tapi saat isolation aktif semua seri tetap
  // ditampilkan supaya user bisa pindah pilihan atau balik ke "show all".
  const trendLegendSeries = isolatedTrend ? visibleSeries : visibleSeries.filter(hasTrendSignal);
  const vmDisplaySeries = isolatedVMs ? vmSeries.filter((s) => s.key === isolatedVMs) : vmSeries;

  const topDestBarItems = useMemo(() => (topDestinations?.destinations || []).map((d, i) => ({
    label: String(d.ip), value: Number(d.count) || 0, color: ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6"][i % 5],
  })), [topDestinations]);

  const avgProbability = summary?.averageBotnetProbability;
  const totalPages = pagination?.totalPages || 1;
  const activePage = pagination ? page : 1;

  if (loading && !summary && alerts.length === 0 && !error) {
    return <PageLoader message="Loading..." fullScreen />;
  }

  if (error && !summary && alerts.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[11px] text-red-300">
          {error?.message || String(error)}
          <button onClick={() => loadAll()} className="ml-3 underline hover:text-red-200">Retry</button>
        </div>
      </div>
    );
  }

  const rangeLabel = filterMode === "custom"
    ? `${formatDetailedTimestamp(getIsoDateRange(normalizeDateRange(customDateRange)).start)}`
    : `Last ${timeRange}`;

  const trendRangeKey = filterMode === "custom"
    ? minutesToRangeKey(getDateRangeMinutes(getIsoDateRange(normalizeDateRange(customDateRange))))
    : timeRange;

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">Bot Detection</h1>
          <p className="text-[11px] text-[var(--soc-text-muted)] mt-0.5">Monitor machine-learning botnet detections and suspicious network behavior.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RangeFilter
            rangeKey={timeRange}
            onRangeChange={(nextRange) => {
              if (timeRange !== nextRange) { setPage(1); setSelectedPoint(null); setTimeRange(nextRange); setFilterMode("range"); }
            }}
          />
          <DateRangeFilter
            value={customDateRange}
            onChange={(range) => { setPage(1); setSelectedPoint(null); setCustomDateRange(range); setFilterMode("custom"); }}
          />
          <div className="relative flex items-center bg-[var(--soc-card)] rounded-lg border border-[var(--soc-border)]" title="Rows per page">
            <select
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
                setTimeout(() => { scrollTableIntoView(); }, 100);
              }}
              disabled={loading}
              className="appearance-none bg-transparent py-2 pl-2.5 pr-5 text-[11px] font-medium leading-tight text-[var(--soc-text-primary)] focus:outline-none disabled:opacity-40 cursor-pointer"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (<option key={size} value={size} className="bg-[var(--soc-card)] text-[var(--soc-text-primary)]">{size}</option>))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--soc-text-muted)]" />
          </div>
        </div>
      </div>

      {error && (summary || alerts.length > 0) && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-2 text-[11px] text-red-300">
          Failed to load Bot Detection data: {error?.message || String(error)}
          <button onClick={() => loadAll()} className="ml-3 underline hover:text-red-200">Retry</button>
        </div>
      )}
      {dataNotice && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 md:px-3 py-2 text-[10px] md:text-[11px] text-sky-100">{dataNotice}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-3">
        <KPICard label="ML Botnet Alerts" value={formatNumber(summary?.mlBotnetAlerts)} icon={BrainCircuit} color="text-purple-400" desc="ML-based detections" loading={loading} index={0} />
        <KPICard label="Average Botnet Probability" value={avgProbability == null ? "-" : formatPercent(avgProbability)} icon={Gauge} color="text-pink-400"
          desc="Across ML botnet alerts" loading={loading} index={1}
          title="Probability produced by the ML classifier. Current detection threshold: 0.50." />
        <KPICard label="Behavior Alerts" value={formatNumber(summary?.behaviorTotal)} icon={ShieldAlert} color="text-orange-400" desc="Across 6 behavior detectors" loading={loading} index={2}
          title="Rule-based detection based on activity observed within a configured time window." />
        <KPICard label="Unique Sources" value={formatNumber(summary?.uniqueSources)} icon={Globe} color="text-emerald-400" desc="Observed source addresses" loading={loading} index={3}
          title="Observed source address." />
      </div>

      {/* Alert Trend + Top 5 Agents — komposisi seperti halaman lain */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 chart-card animate-fadeInUp stagger-1 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10"><BarChart3 className="h-3.5 w-3.5 text-violet-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Alert Trend</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Detections over time by detector type</p>
              </div>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[9px] text-[var(--soc-text-muted)]">{rangeLabel}</div>
              <div className="text-[10px] font-semibold text-[var(--soc-text-muted)]">Updated {formatLiveTimestamp(lastUpdated)}</div>
            </div>
          </div>
          <div className="h-[220px]" style={{ background: "transparent" }}>
            <MultiWaveChart data={trend} series={trendDisplaySeries} rangeKey={trendRangeKey} height={220} logScale
              onPointSelect={(point) => handlePointSelect(point, "trend")}
              pointHint={(point) => {
                const near = nearestTrendSeries(point);
                return near ? `Filter table: ${near.label} - ${formatDetailedTimestamp(point.timestamp)}` : `Filter table: ${formatDetailedTimestamp(point.timestamp)}`;
              }}
              activePointKey={selectedPoint?.source === "trend" ? selectedPoint.key : null} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-center px-1 mt-2">
            {trendLegendSeries.map((s) => {
              const total = (trend || []).reduce((sum, p) => sum + (Number(p[s.key]) || 0), 0);
              const isActive = isolatedTrend === s.key;
              const dimmed = isolatedTrend && !isActive;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setIsolatedTrend(isActive ? null : s.key)}
                  title={isActive ? "Show all series" : `Show only ${s.label}`}
                  className={`flex items-center gap-1.5 text-[11px] rounded px-1 py-0.5 transition-all ${isActive ? "font-bold text-slate-200 ring-1 ring-sky-500/40 bg-sky-500/10" : dimmed ? "text-slate-500 opacity-50 hover:opacity-80" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <span className="text-slate-500 font-mono">{formatNumber(total)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10"><Users className="h-3.5 w-3.5 text-purple-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Agents</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Most active reporting agents</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[9px] text-[var(--soc-text-muted)]">Unique agents</span>
            <span className="text-[11px] font-bold text-[var(--soc-text-primary)]">{formatNumber(topAgents.uniqueAgents)}</span>
          </div>
          <BarList items={topAgentBarItems} emptyLabel="No agent data" onSelect={handleAgentSummaryClick} activeValue={agentFilter !== "all" ? agentFilter : null} />
        </div>
      </div>

      {/* Top VMs by Traffic — komposisi seperti Alert Trend (grafik + ranking) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 chart-card animate-fadeInUp stagger-4 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-sky-500/10"><Server className="h-3.5 w-3.5 text-sky-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top VMs by Traffic</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Bytes over time per reporting agent</p>
              </div>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[9px] text-[var(--soc-text-muted)]">{rangeLabel}</div>
              <div className="text-[10px] font-semibold text-[var(--soc-text-muted)]">Updated {formatLiveTimestamp(lastUpdated)}</div>
            </div>
          </div>
        <div className="h-[220px]" style={{ background: "transparent" }}>
          <MultiWaveChart data={trafficTimeline.points} series={vmDisplaySeries} rangeKey={trendRangeKey} height={220} formatValue={formatBytes} formatAxis={formatBytesCompact}
            onPointSelect={(point) => handlePointSelect(point, "vms")}
            activePointKey={selectedPoint?.source === "vms" ? selectedPoint.key : null} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-center px-1 mt-2">
          {vmSeries.map((s) => {
            const info = (traffic?.topVMs || []).find((v) => String(v.agent) === String(s.key));
            const isActive = isolatedVMs === s.key;
            const dimmed = isolatedVMs && !isActive;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setIsolatedVMs(isActive ? null : s.key)}
                title={isActive ? "Show all series" : `Show only ${s.label}`}
                className={`flex items-center gap-1.5 text-[11px] rounded px-1 py-0.5 transition-all ${isActive ? "font-bold text-slate-200 ring-1 ring-sky-500/40 bg-sky-500/10" : dimmed ? "text-slate-500 opacity-50 hover:opacity-80" : "text-slate-400 hover:text-slate-200"}`}
              >
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="max-w-[200px] truncate" title={s.label}>{s.label}</span>
                <span className="text-slate-500 font-mono">{formatBytes(info?.bytes || 0)}</span>
              </button>
            );
          })}
        </div>
        </div>
        <div className="chart-card animate-fadeInUp stagger-5 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10"><Globe className={`h-3.5 w-3.5 ${ipTab === "source" ? "text-emerald-400" : "text-sky-400"}`} /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 IPs</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Most frequent addresses</p>
              </div>
            </div>
            <span className={`text-[10px] font-bold ${ipTab === "source" ? "text-emerald-400" : "text-sky-400"}`}>{(ipTab === "source" ? topSourceBarItems : topDestBarItems).length} IPs</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {[
              { key: "source", label: "Source" },
              { key: "dest", label: "Destination" },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => setIpTab(option.key)}
                className={`px-2 py-1 text-[9px] rounded-md font-medium transition-all ${
                  ipTab === option.key
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "text-[var(--soc-text-muted)] hover:text-[var(--soc-text-secondary)] border border-transparent hover:bg-[var(--soc-elevated)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        <BarList
          items={ipTab === "source" ? topSourceBarItems : topDestBarItems}
          emptyLabel={ipTab === "source" ? "No source IP data" : "No destination IP data"}
          onSelect={handleIPSummaryClick}
          activeValue={(ipTab === "source" ? srcIpFilter : dstIpFilter) !== "all" ? (ipTab === "source" ? srcIpFilter : dstIpFilter) : null}
        />
      </div>
      </div>

      {/* Recent Alerts Table */}
      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg h-auto overflow-hidden">
        <div ref={alertsTableRef} className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
          <div className="flex gap-2 flex-wrap attack-logs-search soc-filter-row items-center">
            <div className="flex-1 min-w-0 basis-full sm:basis-0 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input type="text" value={searchQuery} onChange={(e) => { setPage(1); setSearchQuery(e.target.value); }}
                placeholder="Search by agent, detection, source IP, or destination IP..."
                className="w-full pl-10 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500" />
            </div>
            <BotCombinedFilter
              behaviorType={behaviorType} onBehaviorTypeChange={(v) => { setPage(1); setBehaviorType(v); }}
              protocol={protocol} onProtocolChange={(v) => { setPage(1); setProtocol(v); }}
              minProbability={minProbability} onMinProbabilityChange={(v) => { setPage(1); setMinProbability(v); }}
              agentFilter={agentFilter} onAgentChange={(v) => { setPage(1); setAgentFilter(v); }} agentOptions={agentFilterOptions}
              srcIpFilter={srcIpFilter} onSrcIpChange={(v) => { setPage(1); setSrcIpFilter(v); }} srcIpOptions={srcIpFilterOptions}
              dstIpFilter={dstIpFilter} onDstIpChange={(v) => { setPage(1); setDstIpFilter(v); }} dstIpOptions={dstIpFilterOptions}
              timelineFilterLabel={selectedPoint
                ? `${formatDetailedTimestamp(selectedPoint.start)} - ${formatDetailedTimestamp(selectedPoint.end)}`
                : ""}
              onClearTimelineFilter={() => {
                setSelectedPoint(null);
                // Filter detektor ikut dibersihkan: kalau tidak, tabel tetap
                // terkunci ke satu detector meski chip waktu sudah dihapus.
                setBehaviorType("all");
                setPage(1);
              }}
            />
            <ExportCsvButton accent="sky" onClick={handleExportCsv} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[10px] md:text-[11px] text-left">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/70">
                {["time", "agent", "detection", "source", "destination", "protocol", "confidence", "traffic"].map((h) => (
                  <th key={h} className="px-2 md:px-4 lg:px-3 py-2 md:py-3 lg:py-2 text-[9px] md:text-[11px] lg:text-[10px] font-semibold text-slate-400 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">Loading alerts...</td></tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center">
                    <p className="text-[10px] font-semibold text-[var(--soc-text-secondary)]">No detection alerts found for the selected period.</p>
                    <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">Try adjusting the selected filters or time range.</p>
                  </td>
                </tr>
              ) : alerts.map((a, idx) => {
                const source = a.sourcePort ? `${a.sourceIp || "-"}:${a.sourcePort}` : (a.sourceIp || "-");
                const destination = a.destinationPort ? `${a.destinationIp || "-"}:${a.destinationPort}` : (a.destinationIp || "-");
                const protoMethod = a.detectorType === "ml"
                  ? String(a.protocol || "-").toUpperCase()
                  : (a.method || String(a.protocol || "-").toUpperCase());
                let activity = "-";
                if (a.detectorType === "ml") {
                  activity = a.probability != null ? formatPercent(a.probability) : "-";
                } else if (a.primaryValue != null) {
                  activity = `${a.primaryValue} ${a.primaryLabel || "events"} / ${a.windowSeconds || 60}s`;
                }
                return (
                  <tr key={a.id || idx}
                    className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${idx % 2 !== 0 ? 'bg-slate-900/60' : ''}`}>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-slate-500 whitespace-nowrap" title={formatDetailedTimestamp(a.timestamp)}>{formatDetailedTimestamp(a.timestamp)}</td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-sky-400 font-medium" title={a.agent || "-"}><div className="truncate max-w-[140px] md:max-w-[200px]">{a.agent || "-"}</div></td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 whitespace-nowrap"><DetectionBadge alert={a} /></td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-emerald-400 font-mono" title={source}><div className="truncate max-w-[150px] md:max-w-[200px]">{source}</div></td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-violet-400 font-mono" title={destination}><div className="truncate max-w-[150px] md:max-w-[200px]">{destination}</div></td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-slate-300 whitespace-nowrap">{protoMethod}</td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 whitespace-nowrap"><LevelBadge alert={a} label={activity} /></td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-slate-300 whitespace-nowrap font-mono"
                      title={a.detectorType === "ml" && a.totalBytes != null ? `${formatNumber(a.totalBytes)} bytes (${formatNumber(a.origBytes)} orig / ${formatNumber(a.respBytes)} resp)` : undefined}>
                      {a.detectorType === "ml" && a.totalBytes != null ? formatBytes(a.totalBytes) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(pagination?.total || 0) > 0 && (
          <div className="border-t border-slate-800 bg-slate-900/50 px-2 md:px-4 py-3">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0">
              <div className="text-[10px] md:text-[11px] font-mono text-slate-500">
                <span className="hidden md:inline">SHOWING </span>
                <span className="font-bold text-sky-400">{(activePage - 1) * pageSize + 1}</span>
                <span className="hidden md:inline"> - </span><span className="md:hidden">-</span>
                <span className="font-bold text-sky-400">{Math.min(activePage * pageSize, pagination.total)}</span>
                <span className="hidden md:inline"> OF </span><span className="md:hidden"> / </span>
                <span className="font-bold text-sky-400">{formatNumber(pagination.total)}</span>
                <span className="hidden md:inline"> ALERTS</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={activePage === 1 || loading} onClick={() => { setPage(1); scrollTableIntoView(); }} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">FIRST</button>
                <button disabled={activePage === 1 || loading} onClick={() => { setPage(Math.max(1, activePage - 1)); scrollTableIntoView(); }} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">PREV</button>
                <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400"><span className="hidden md:inline">PAGE </span><span className="text-white">{activePage}</span> / {totalPages}</span>
                <button disabled={activePage >= totalPages || loading} onClick={() => { setPage(Math.min(totalPages, activePage + 1)); scrollTableIntoView(); }} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">NEXT</button>
                <button disabled={activePage >= totalPages || loading} onClick={() => { setPage(totalPages); scrollTableIntoView(); }} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">LAST</button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
