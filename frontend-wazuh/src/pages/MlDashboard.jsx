import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BrainCircuit, BarChart3, LineChart, Globe, CalendarRange, ChevronDown, Search, X } from "lucide-react";
import mlApi from '../services/mlApi';
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import {
  createDefaultDateRange,
  normalizeDateRange,
  getIsoDateRange,
  getDateRangeMinutes,
  toDateTimeLocalValue,
} from "../utils/dateRange";

// ========================================
// SVG Chart Components
// ========================================

// Horizontal bar chart untuk Source IPs dengan gradient color, dashed pattern, dan UI yang lebih bagus
const HorizontalBarChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-slate-500">No data</div>;
  }
  
  const maxCount = Math.max(1, ...data.map(d => d.count));
  const rowHeight = 42;
  const barHeight = 28;
  const chartHeight = data.length * rowHeight + 12;
  const labelWidth = 180;
  const barStartX = 205;
  const barMaxWidth = 710;
  const rankX = 1040;
  
  const getGradientColor = (index) => {
    // Red (rank 1) → Orange → Yellow → Green → Cyan → Blue (rank 10)
    const ratio = index / Math.max(1, data.length - 1);
    if (ratio < 0.14) return `rgb(255, 50, 50)`; // Vivid Red
    if (ratio < 0.28) return `rgb(255, 140, 0)`; // Vivid Orange
    if (ratio < 0.42) return `rgb(255, 215, 0)`; // Vivid Yellow
    if (ratio < 0.57) return `rgb(50, 205, 50)`; // Vivid Lime Green
    if (ratio < 0.71) return `rgb(0, 206, 209)`; // Vivid Cyan
    if (ratio < 0.85) return `rgb(30, 144, 255)`; // Vivid Blue
    return `rgb(75, 0, 130)`; // Indigo
  };
  
  return (
    <div className="space-y-1">
      <svg width="100%" height={chartHeight} viewBox={`0 0 1100 ${chartHeight}`} className="block w-full">
        <defs>
          {/* Glow effect untuk bar */}
          <filter id="barGlow">
            <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {data.map((item, i) => {
          const ratio = item.count / maxCount;
          const barWidth = ratio * barMaxWidth;
          const y = i * rowHeight + 12;
          const color = getGradientColor(i);
          
          return (
            <g key={`bar-${i}`}>
              {/* Subtle shadow/glow background */}
              <rect x={barStartX} y={y + 2} width={barMaxWidth} height={barHeight} fill="#0f172a" rx="8" opacity="0.3" />
              
              {/* Background bar container */}
              <rect x={barStartX} y={y} width={barMaxWidth} height={barHeight} fill="var(--soc-border)" rx="8" strokeWidth="0.5" stroke="var(--soc-border)" />
              
              {/* Solid bar with smooth edges */}
              <rect 
                x={barStartX} y={y} width={barWidth} height={barHeight} 
                fill={color}
                rx="8"
                filter="url(#barGlow)"
              />
              
              {/* Bar border - outline untuk edge yang lebih tajam */}
              <rect 
                x={barStartX} y={y} width={barWidth} height={barHeight} 
                fill="none" 
                stroke={color} 
                strokeWidth="1" 
                rx="8"
                opacity="0.6"
              />
              
              {/* Highlight bar - top edge glow */}
              <line 
                x1={barStartX} y1={y + 1} x2={barStartX + barWidth} y2={y + 1} 
                stroke="white" 
                strokeWidth="0.75" 
                opacity="0.2" 
                rx="6"
              />
              
              {/* Count label - dalam atau luar bar */}
              {ratio > 0.12 ? (
                <text 
                  x={barStartX + barWidth - 10} y={y + 19} 
                  textAnchor="end" 
                  fontSize="12" 
                  fill="white" 
                  fontWeight="700"
                  fontFamily="'Courier New', monospace"
                >
                  {item.count}
                </text>
              ) : (
                <text 
                  x={barStartX + barWidth + 10} y={y + 19} 
                  textAnchor="start" 
                  fontSize="12" 
                  fill={color} 
                  fontWeight="700"
                  fontFamily="'Courier New', monospace"
                >
                  {item.count}
                </text>
              )}
              
              {/* IP Label */}
              <text 
                x={labelWidth / 2 + 8} y={y + 18} 
                textAnchor="middle"
                fontSize="13" 
                fill="white" 
                fontWeight="700" 
                fontFamily="'Courier New', monospace"
              >
                {item.label}
              </text>
              
              {/* Rank - dengan styling yang lebih baik */}
              <circle cx={rankX} cy={y + 14} r="10" fill="var(--soc-border)" stroke="var(--soc-border)" strokeWidth="1.2" />
              <text 
                x={rankX} y={y + 18} 
                textAnchor="middle" 
                fontSize="11" 
                fill="white" 
                fontWeight="700"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
        
        {/* Separator line */}
        <line x1="0" y1={chartHeight - 8} x2="1100" y2={chartHeight - 8} stroke="var(--soc-border)" strokeWidth="0.5" opacity="0.5" />
      </svg>
    </div>
  );
};

const withAlpha = (hex, alpha) => {
  const safeHex = String(hex || '').replace('#', '');
  if (safeHex.length !== 6) return hex;

  const r = parseInt(safeHex.slice(0, 2), 16);
  const g = parseInt(safeHex.slice(2, 4), 16);
  const b = parseInt(safeHex.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const TOP_SOURCE_IPS_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];
const TOP_DEST_IPS_COLORS = ["#a78bfa", "#818cf8", "#60a5fa", "#22d3ee", "#f472b6"];

const getValidDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getTimestampMs = (value) => getValidDate(value)?.getTime() ?? null;

const formatDetailedTimestamp = (timestamp) => {
  const date = getValidDate(timestamp);
  if (!date) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const TopSourceIpsCard = ({ sourceIps, colors = TOP_SOURCE_IPS_COLORS }) => {
  if (!sourceIps || sourceIps.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-600">No source IP data</div>;
  }

  const peakCount = Math.max(...sourceIps.map((ip) => ip.count), 1);

  return (
    <div className="space-y-3">
      {sourceIps.map((ip, idx) => {
        const accent = colors[idx % colors.length];
        return (
          <div key={ip.label} className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="w-5 text-[13px] font-bold text-slate-500 shrink-0">{idx + 1}.</span>
              <span className="flex-1 min-w-0 text-[13px] font-mono text-slate-300 truncate" title={ip.label}>
                {ip.label}
              </span>
              <span className="text-[13px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
                {new Intl.NumberFormat("en-US").format(ip.count)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-5 shrink-0" />
              <div
                className="flex-1 bg-[var(--soc-bg)] rounded h-4 overflow-hidden"
                title={ip.lastSeen ? `Last seen ${formatDetailedTimestamp(ip.lastSeen)}` : `${ip.label}: ${ip.count} events`}
              >
                <div
                  className="h-full rounded transition-all"
                  style={{ width: `${Math.max((ip.count / peakCount) * 100, 3)}%`, backgroundColor: accent }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SourceIpRankingPanel = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-slate-500">No data</div>;
  }

  const maxCount = Math.max(1, ...data.map((item) => item.count));
  const palette = ['#f97316', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#ef4444', '#6366f1'];

  return (
    <div className="w-full space-y-3">
      <div className="space-y-2.5">
        {data.map((item, i) => {
          const color = palette[i % palette.length];
          const ratio = item.count / maxCount;

          return (
            <div
              key={`${item.label}-${i}`}
              className="group rounded-xl border border-slate-800 px-3 py-3 transition-all hover:border-slate-700"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black"
                  style={{
                    color,
                    borderColor: withAlpha(color, 0.45),
                    background: withAlpha(color, 0.22),
                    boxShadow: `0 0 16px ${withAlpha(color, 0.16)}`,
                  }}
                >
                  {i + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-semibold text-slate-100">{item.label}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-slate-100">{item.count}</div>
                    </div>
                  </div>

                  <div className="mt-2.5">
                    <div className="relative h-2.5 overflow-hidden rounded-full border border-slate-800 bg-slate-900">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(ratio * 100, 6)}%`,
                          background: `linear-gradient(90deg, ${color} 0%, ${withAlpha(color, 0.62)} 100%)`,
                          boxShadow: `0 0 18px ${withAlpha(color, 0.28)}`,
                        }}
                      />
                      <div
                        className="absolute inset-y-0 rounded-full opacity-60"
                        style={{
                          width: `${Math.max(ratio * 100, 6)}%`,
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.26), rgba(255,255,255,0))',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const WORD_COLORS = ['#f472b6', '#38bdf8', '#4ade80', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#facc15', '#60a5fa', '#e879f9'];
const COLORS = ['#10b981', '#ef4444', '#f97316', '#3b82f6', '#a78bfa', '#ec4899', '#14b8a6', '#8b5cf6'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const PREDICTIONS_FETCH_BATCH_SIZE = 1000;
const TIME_RANGE_OPTIONS = [
  { label: '1h', value: '1h', description: '1 hour' },
  { label: '24h', value: '24h', description: '24 hours' },
  { label: '7d', value: '7d', description: '7 days' },
  { label: '30d', value: '30d', description: '30 days' },
];
const DEFAULT_TIME_RANGE = '24h';
const RANGE_TO_MINUTES = {
  '1h': 60,
  '24h': 1440,
  '7d': 10080,
  '30d': 43200,
};

const formatTime = (isoString) => {
  const date = getValidDate(isoString);
  if (!date) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(',', '').replace('AM', '').replace('PM', '').trim();
};

const formatLiveTimestamp = (isoString) => {
  const date = getValidDate(isoString);
  if (!date) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const getTimelineRangeDescription = (value) =>
  TIME_RANGE_OPTIONS.find((option) => option.value === String(value))?.description || String(value);


const getRangeWindow = (rangeKey) => {
  const end = new Date();
  const start = new Date(end);

  switch (rangeKey) {
    case '1h':
      start.setHours(start.getHours() - 1);
      break;
    case '24h':
      start.setDate(start.getDate() - 1);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
    default:
      start.setDate(start.getDate() - 30);
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const formatBucketLabel = (timestamp, rangeKey) => {
  const date = getValidDate(timestamp);
  if (!date) return '-';

  if (rangeKey === '1h') {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (rangeKey === '24h' || rangeKey === '7d') {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
  });
};

const getTimelineBucketMs = (minutes) => {
  if (minutes <= 60) return 5 * 60 * 1000;
  if (minutes <= 1440) return 30 * 60 * 1000;
  if (minutes <= 10080) return 3 * 60 * 60 * 1000;
  if (minutes <= 525600) return 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
};

const createTimelineBucketPoint = (bucketStartMs, value, bucketMs) => {
  const startDate = new Date(bucketStartMs);
  if (Number.isNaN(startDate.getTime())) return null;

  const start = startDate.toISOString();
  const end = new Date(bucketStartMs + bucketMs - 1).toISOString();

  return {
    key: start,
    t: bucketStartMs,
    time: start,
    start,
    end,
    bucketMs,
    v: value,
  };
};

const formatTimelineBucketLabel = (point, rangeKey) => {
  if (!point?.start) return '-';

  if ((point.bucketMs || getTimelineBucketMs(RANGE_TO_MINUTES[rangeKey] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE])) <= 60 * 60 * 1000) {
    return formatDetailedTimestamp(point.start);
  }

  return `${formatDetailedTimestamp(point.start)} - ${formatDetailedTimestamp(point.end)}`;
};

const buildTimelineFromPredictions = (predictions, minutes, start, end) => {
  const safeMinutes = Math.max(parseInt(minutes || '60', 10), 1);
  const rangeMs = safeMinutes * 60 * 1000;
  const stepMs = getTimelineBucketMs(safeMinutes);
  const now = Date.now();
  const startMs = start ? getTimestampMs(start) : now - rangeMs;
  const endMs = end ? getTimestampMs(end) : now;
  const bucketStart = (ts) => Math.floor(ts / stepMs) * stepMs;

  const filteredPredictions = predictions
    .map((item) => ({
      ...item,
      _ts: getTimestampMs(item.timestamp),
    }))
    .filter((item) => Number.isFinite(item._ts) && Number.isFinite(startMs) && Number.isFinite(endMs) && item._ts >= startMs && item._ts <= endMs);

  if (!filteredPredictions.length) {
    return [];
  }

  const buckets = new Map();
  let minBucket = Infinity;
  let maxBucket = -Infinity;

  filteredPredictions.forEach((item) => {
    const bucket = bucketStart(item._ts);
    minBucket = Math.min(minBucket, bucket);
    maxBucket = Math.max(maxBucket, bucket);
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  });

  const output = [];
  for (let ts = minBucket; ts <= maxBucket; ts += stepMs) {
    const point = createTimelineBucketPoint(ts, buckets.get(ts) || 0, stepMs);
    if (point) {
      output.push({
        timestamp: point.start,
        total: point.v,
        start: point.start,
        end: point.end,
        bucketMs: point.bucketMs,
        labels: [],
      });
    }
  }

  return output;
};

const buildStatsFromPredictions = (predictions) => {
  const labelMap = new Map();
  let confidenceTotal = 0;
  let confidenceCount = 0;

  predictions.forEach((prediction) => {
    const label = prediction.predictedLabel || 'unknown';
    const current = labelMap.get(label) || { label, count: 0, confidenceTotal: 0, confidenceCount: 0 };
    current.count += 1;

    const confidence = typeof prediction.confidence === 'number'
      ? prediction.confidence
      : parseFloat(prediction.confidence);

    if (!Number.isNaN(confidence)) {
      current.confidenceTotal += confidence;
      current.confidenceCount += 1;
      confidenceTotal += confidence;
      confidenceCount += 1;
    }

    labelMap.set(label, current);
  });

  return {
    totalPredictions: predictions.length,
    overallAvgConfidence: confidenceCount ? confidenceTotal / confidenceCount : null,
    labels: Array.from(labelMap.values()).map((item) => ({
      label: item.label,
      count: item.count,
      avgConfidence: item.confidenceCount ? item.confidenceTotal / item.confidenceCount : null,
    })),
  };
};

const getConfidenceMeaning = (label, score) => {
  const value = typeof score === 'number' ? score : parseFloat(score);
  if (Number.isNaN(value)) return '-';

  const lowerLabel = String(label || '').toLowerCase();
  const subject = lowerLabel.includes('benign') || lowerLabel.includes('normal')
    ? 'benign prediction'
    : 'attack prediction';

  if (value >= 0.8) return `High confidence in ${subject}`;
  if (value >= 0.6) return `Moderate confidence in ${subject}`;
  return `Low confidence in ${subject}`;
};

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
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="text-sm font-medium text-[var(--soc-text-secondary)]">No data available</p>
        <p className="mt-0.5 text-xs text-[var(--soc-text-muted)]">No data for the selected time range.</p>
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
    color: it.color || color,
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
          <div key={`${p.label}-${p.index}`} className="flex items-center gap-1.5 text-[13px] text-slate-400">
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
          <div className="font-semibold text-[var(--soc-text-primary)]">{selected.label}</div>
          <div className="mt-1 text-[var(--soc-text-muted)]">{selected.value} {totalLabel}</div>
        </div>
      )}
    </div>
  );
};

const WaveChart = ({ data, width = 1000, height = 320, rangeKey, onPointSelect, activePointKey }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const maxV = Math.max(1, ...data.map((d) => d.v));
  const padding = { l: 28, r: 10, t: 8, b: 36 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : 0;

  const gridLines = [];
  const seenValues = new Set();

  const gridSteps = 5;
  for (let i = 0; i < gridSteps; i++) {
    const ratio = i / (gridSteps - 1);
    let value = Math.round(ratio * maxV);

    if (seenValues.has(value)) {
      let offset = 1;
      while (seenValues.has(value + offset) && offset <= maxV) offset++;
      if (offset <= maxV) {
        value = value + offset;
      } else {
        continue;
      }
    }

    seenValues.add(value);
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
      const controlY1 = prevY;
      const controlY2 = y;
      pathD += ` C ${controlX} ${controlY1}, ${controlX} ${controlY2}, ${x} ${y}`;
    }
  }

  const tickCount = clamp(Math.floor(innerW / 160), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div className="relative h-full w-full overflow-visible" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full overflow-visible">
        {gridLines.map((grid, idx) => (
          <g key={`grid-${idx}`}>
            <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1" opacity={grid.ratio === 0 || grid.ratio === 1 ? "1" : "0.5"} />
            <text x={padding.l - 5} y={grid.y + 4} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="600">{grid.value}</text>
          </g>
        ))}

        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />

        <path d={pathD} stroke="#a78bfa" strokeWidth="2.5" fill="none" opacity="0.8" />

        <defs>
          <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill="url(#waveGradient)" />

        {data.map((d, i) => {
          const x = padding.l + i * pointSpacing;
          const y = padding.t + innerH - (d.v / maxV) * innerH;
          const pointKey = d.key || d.start || d.time || d.t || `point-${i}`;
          const isSelected = selectedPoint?.index === i;
          const isActive = activePointKey === pointKey;
          const pointData = {
            index: i,
            key: pointKey,
            x,
            y,
            value: d.v,
            t: d.t,
            time: d.time || d.start || d.t,
            start: d.start || d.time || d.t,
            end: d.end || d.time || d.t,
            bucketMs: d.bucketMs,
          };
          return (
            <g key={pointKey}>
              {isActive && (
                <circle
                  cx={x}
                  cy={y}
                  r="7.5"
                  fill="transparent"
                  stroke="#a78bfa"
                  strokeWidth="1.5"
                  opacity="0.85"
                  className="pointer-events-none"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r="10"
                fill="transparent"
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Select prediction data`}
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
                r={isActive ? "5" : isSelected ? "5" : "3.5"}
                fill={isActive ? "#a78bfa" : "#a78bfa"}
                stroke="#0f172a"
                strokeWidth="1.5"
                opacity="0.95"
                className="pointer-events-none"
              />
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i !== data.length - 1 && i % tickEvery !== 0) return null;
          const x = padding.l + i * pointSpacing;
          const tickKey = d.key || d.start || d.time || d.t || i;
          return (
            <g key={`tick-${tickKey}`}>
              <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 4} stroke="var(--soc-border)" />
              <text
                x={x}
                y={padding.t + innerH + 16}
                textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
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
          className="pointer-events-none absolute z-10 min-w-[160px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`,
            top: `${Math.max(((selectedPoint.y - 48) / height) * 100, 4)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-white">{selectedPoint.value} predictions</div>
          <div className="mt-1 text-slate-400">{formatTimelineBucketLabel(selectedPoint, rangeKey)}</div>
        </div>
      )}
    </div>
  );
};
const ConfidenceBadge = ({ score }) => {
  if (score === undefined || score === null || score === '') return <span className="text-slate-400">-</span>;
  const val = typeof score === 'number' ? score : parseFloat(score);
  if (isNaN(val)) return <span className="text-slate-400">-</span>;
  const pct = Math.round(val * 100);
  
  let bg = 'bg-red-900/30';
  let text = 'text-red-400';
  if (pct >= 80) { bg = 'bg-green-900/30'; text = 'text-green-400'; }
  else if (pct >= 60) { bg = 'bg-yellow-900/30'; text = 'text-yellow-400'; }
  else if (pct >= 40) { bg = 'bg-orange-900/30'; text = 'text-orange-400'; }
  
  return (
    <span className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded border font-semibold inline-block ${bg} ${text}`}>
      {pct}%
    </span>
  );
};

const PredictionBadge = ({ label }) => {
  const isBenign = String(label).toLowerCase().includes('benign');
  return (
    <span className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${
      isBenign
        ? 'bg-green-900/30 text-green-400 border-green-700/50'
        : 'bg-red-900/30 text-red-400 border-red-700/50'
    }`}>
      {label || 'unknown'}
    </span>
  );
};

export default function MlDashboard() {
  const [searchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingMockData, setUsingMockData] = useState(false);
  const [dataNotice, setDataNotice] = useState('');

  const [predictions, setPredictions] = useState([]);
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [totalPredictionsCount, setTotalPredictionsCount] = useState(0);

  const [filters, setFilters] = useState({ label: '' });
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState(() =>
    urlRange && ["1h", "24h", "7d", "30d"].includes(urlRange) ? urlRange : DEFAULT_TIME_RANGE
  );
  const [filterMode, setFilterMode] = useState(() => (urlStart && urlEnd ? "custom" : "range"));
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
  const [pageSize, setPageSize] = useState(25);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(() =>
    urlStart && urlEnd
      ? { key: "custom", start: urlStart, end: urlEnd, time: new Date(urlStart).getTime() }
      : null
  );
  const predictionsTableRef = React.useRef(null);
  const scrollPredictionsTableIntoView = React.useCallback(() => {
    if (predictionsTableRef.current?.scrollIntoView) {
      try {
        predictionsTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        // Ignore browsers that reject smooth scrolling in this context.
      }
    }
  }, []);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setDataNotice('');
    try {
      let minutes = RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE];
      let start;
      let end;
      if (filterMode === "custom") {
        const iso = getIsoDateRange(normalizeDateRange(customDateRange));
        start = iso.start;
        end = iso.end;
        minutes = getDateRangeMinutes(iso);
      } else {
        const range = getRangeWindow(timeRange);
        start = range.start;
        end = range.end;
      }
      const [predictionsResult, timelineResult] = await Promise.allSettled([
        mlApi.getPredictions({ start, end, page: 1, limit: PREDICTIONS_FETCH_BATCH_SIZE }),
        mlApi.getTimeline(minutes, { start, end }),
      ]);

      const notices = [];
      let preds =
        predictionsResult.status === 'fulfilled' && Array.isArray(predictionsResult.value?.data)
          ? predictionsResult.value.data
          : [];
      let responseTotalPredictions =
        predictionsResult.status === 'fulfilled'
          ? Number(predictionsResult.value?.pagination?.total ?? preds.length)
          : 0;

      if (predictionsResult.status !== 'fulfilled') {
        notices.push('Predictions list gagal dimuat dari endpoint utama.');
      } else {
        const firstPagePagination = predictionsResult.value?.pagination || {};
        const totalPages = Math.max(
          Number(firstPagePagination.totalPages || Math.ceil(responseTotalPredictions / PREDICTIONS_FETCH_BATCH_SIZE) || 1),
          1,
        );

        if (totalPages > 1) {
          const remainingPageResults = await Promise.allSettled(
            Array.from({ length: totalPages - 1 }, (_, index) =>
              mlApi.getPredictions({
                start,
                end,
                page: index + 2,
                limit: PREDICTIONS_FETCH_BATCH_SIZE,
              })
            )
          );

          const failedPages = [];
          for (let i = 0; i < remainingPageResults.length; i += 1) {
            const result = remainingPageResults[i];
            const pageNumber = i + 2;

            if (result.status === 'fulfilled' && Array.isArray(result.value?.data)) {
              preds = preds.concat(result.value.data);
            } else {
              failedPages.push(pageNumber);
            }
          }

          if (failedPages.length > 0) {
            responseTotalPredictions = preds.length;
            notices.push(`Sebagian data predictions gagal dimuat pada page ${failedPages.join(', ')}.`);
          }
        }
      }

      const nextStats = buildStatsFromPredictions(preds);

      let nextTimeline = [];

      if (timelineResult.status === 'fulfilled' && Array.isArray(timelineResult.value?.data) && timelineResult.value.data.length) {
        nextTimeline = timelineResult.value.data;
      } else {
        nextTimeline = buildTimelineFromPredictions(preds, minutes, start, end);

        if (nextTimeline.length > 0) {
          if (timelineResult.status === 'fulfilled') {
            notices.push('Timeline dibentuk dari data prediksi real karena endpoint timeline tidak mengembalikan bucket.');
          } else {
            notices.push('Timeline dibentuk dari data prediksi real karena endpoint timeline gagal.');
          }
        } else if (timelineResult.status === 'fulfilled') {
          notices.push('Tidak ada data ML real pada range waktu yang dipilih.');
        }
      }

      if (predictionsResult.status === 'fulfilled' || timelineResult.status === 'fulfilled') {
        setPredictions(Array.isArray(preds) ? preds : []);
        setTotalPredictionsCount(responseTotalPredictions);
        setStats(nextStats);
        setTimeline(nextTimeline);
        setUsingMockData(false);
        setLastUpdated(new Date().toISOString());
        if (!preds.length && !nextTimeline.length) {
          notices.push('Tidak ada data ML pada range yang dipilih.');
        }
        setDataNotice(notices.join(' '));
        return;
      }

      throw new Error('Real ML data is unavailable, using mock fallback.');
    } catch (err) {
      console.error('ML API error:', err);
      setUsingMockData(true);
      setError(null);
      setDataNotice('ML dashboard sementara memakai fallback mock karena data real tidak tersedia.');

      const genMockPredictions = (limit = 120) => {
        const labels = ['benign', 'malicious', 'suspicious'];
        const services = ['HTTP', 'HTTPS', 'DNS', 'SSH', 'FTP'];
        const ips = ['192.168.1.100', '192.168.1.101', '10.0.0.5', '172.16.0.1', '10.1.2.3'];
        const now = Date.now();
        const out = [];
        for (let i = 0; i < limit; i++) {
          out.push({
            id: `mock-${i}`,
            timestamp: new Date(now - i * 60000).toISOString(),
            predictedLabel: labels[i % labels.length],
            confidence: Number((0.6 + Math.random() * 0.4).toFixed(2)),
            sourceIp: ips[i % ips.length],
            destinationIp: ips[(i + 1) % ips.length],
            service: services[i % services.length],
            zeekUid: `uid-mock-${i}`,
          });
        }
        return out;
      };

      const genMockStats = () => ({
        totalPredictions: 1200,
        overallAvgConfidence: 0.78,
        labels: [
          { label: 'benign', count: 800, avgConfidence: 0.81 },
          { label: 'malicious', count: 300, avgConfidence: 0.74 },
          { label: 'suspicious', count: 100, avgConfidence: 0.65 },
        ]
      });

      const genMockTimeline = (minutes = 60) => {
        const data = [];
        const now = Date.now();
        const step = minutes <= 60 ? 5 * 60 * 1000 : 30 * 60 * 1000;
        const range = minutes * 60 * 1000;
        for (let t = now - range; t <= now; t += step) {
          const v = Math.max(0, Math.floor(Math.random() * 8 + (Math.floor(t / step) % 5)));
          data.push({ timestamp: new Date(t).toISOString(), total: v, labels: [ { label: 'benign', count: Math.floor(v * 0.6) }, { label: 'malicious', count: Math.ceil(v * 0.4) } ] });
        }
        return data;
      };

      const mockPreds = genMockPredictions(200);
      setPredictions(mockPreds);
      setTotalPredictionsCount(mockPreds.length);
      setStats(genMockStats());
      setTimeline(genMockTimeline(RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE]));
      setLastUpdated(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, [timeRange, filterMode, customDateRange]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => loadAll(), 60_000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const uniqueOptions = useMemo(() => {
    const labels = new Set();
    const srcs = new Set();
    const dests = new Set();
    const services = new Set();
    for (const p of predictions) {
      if (p.predictedLabel) labels.add(p.predictedLabel);
      if (p.sourceIp) srcs.add(p.sourceIp);
      if (p.destinationIp) dests.add(p.destinationIp);
      if (p.service) services.add(p.service);
    }
    return {
      labels: Array.from(labels).sort(),
      srcs: Array.from(srcs).sort(),
      dests: Array.from(dests).sort(),
      services: Array.from(services).sort(),
    };
  }, [predictions]);

  const filtered = useMemo(() => {
    let result = predictions.filter((p) => {
      if (filters.label && String(p.predictedLabel) !== String(filters.label)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const source = String(p.sourceIp || '').toLowerCase();
        const dest = String(p.destinationIp || '').toLowerCase();
        const service = String(p.service || '').toLowerCase();
        if (!source.includes(q) && !dest.includes(q) && !service.includes(q)) return false;
      }
      return true;
    });

    // Apply timeline filter if selected
    if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
      const startMs = getTimestampMs(selectedTimelinePoint.start);
      const endMs = getTimestampMs(selectedTimelinePoint.end);
      result = result.filter((p) => {
        const pMs = getTimestampMs(p.timestamp);
        return Number.isFinite(pMs) && Number.isFinite(startMs) && Number.isFinite(endMs) && pMs >= startMs && pMs <= endMs;
      });
    }

    return result;
  }, [predictions, filters, searchQuery, selectedTimelinePoint]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const distribution = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.predictedLabel || 'unknown';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value], i) => ({
      name,
      label: name,
      value,
      color: COLORS[i % COLORS.length],
    }));
  }, [filtered]);

  const suspiciousCount = useMemo(
    () =>
      filtered.filter((p) => {
        const l = String(p.predictedLabel || '').toLowerCase();
        return !(l.includes('benign') || l.includes('normal'));
      }).length,
    [filtered]
  );
  const suspiciousPercentage = filtered.length
    ? Math.round((suspiciousCount / filtered.length) * 100)
    : 0;

  const avgConfidence = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const p of filtered) {
      const c = typeof p.confidence === 'number' ? p.confidence : parseFloat(p.confidence);
      if (!Number.isNaN(c)) {
        total += c;
        count += 1;
      }
    }
    return count ? (total / count) * 100 : 0;
  }, [filtered]);

  const topSourceIps = useMemo(() => {
    const map = new Map();
    for (const p of predictions) { // Use ALL predictions, not filtered
      const ip = p.sourceIp || 'unknown';
      const existing = map.get(ip) || { label: ip, count: 0, lastSeen: 0 };
      existing.count += 1;
      existing.lastSeen = Math.max(existing.lastSeen, getTimestampMs(p.timestamp) || 0);
      map.set(ip, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 source IPs
  }, [predictions]);

  const topDestIps = useMemo(() => {
    const map = new Map();
    for (const p of predictions) {
      const ip = p.destinationIp || 'unknown';
      const existing = map.get(ip) || { label: ip, count: 0, lastSeen: 0 };
      existing.count += 1;
      existing.lastSeen = Math.max(existing.lastSeen, getTimestampMs(p.timestamp) || 0);
      map.set(ip, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 destination IPs
  }, [predictions]);

  const waveData = useMemo(() => {
    if (!timeline || timeline.length === 0) {
      return [];
    }

    const minutes = filterMode === "custom"
      ? getDateRangeMinutes(getIsoDateRange(normalizeDateRange(customDateRange)))
      : (RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE]);
    const bucketMs = getTimelineBucketMs(minutes);
    const map = new Map();

    for (const t of timeline) {
      if (!t) continue;
      const ts = getTimestampMs(t.timestamp || t.ts || t.start || t.time);
      if (!Number.isFinite(ts)) continue;

      const bucketStartMs = Math.floor(ts / bucketMs) * bucketMs;
      const count = Number(t.total ?? t.count ?? t.v ?? 0);
      map.set(bucketStartMs, (map.get(bucketStartMs) || 0) + (Number.isFinite(count) ? count : 0));
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([bucketStartMs, count]) => createTimelineBucketPoint(bucketStartMs, count, bucketMs))
      .filter(Boolean);
  }, [timeline, timeRange, filterMode, customDateRange]);

  const handleTimelinePointSelect = (pointData) => {
    if (selectedTimelinePoint?.key === pointData.key) {
      setSelectedTimelinePoint(null);
      setPage(1);
    } else {
      setSelectedTimelinePoint({
        key: pointData.key,
        time: pointData.time,
        start: pointData.start,
        end: pointData.end,
        bucketMs: pointData.bucketMs,
        t: pointData.t,
      });
      setPage(1);
    }

    scrollPredictionsTableIntoView();
  };

  const handleRangeChange = (nextRange) => {
    setPage(1);
    setSelectedTimelinePoint(null);
    setFilterMode("range");
    setTimeRange(nextRange);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-sky-400 gap-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400"></div>
        <div className="text-sm font-medium">Loading ML Dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-6 py-4 text-red-300 text-sm max-w-md">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 flex flex-col gap-4 w-full">
        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-3 md:p-4 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-violet-400" />
                ML Predictions Dashboard
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time machine learning traffic prediction and threat classification
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-2 md:p-4 shadow-lg flex flex-col gap-3 md:gap-4">
          <div className="flex flex-col items-start gap-1 md:flex-row md:items-center md:justify-between md:gap-2">
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-slate-400 whitespace-nowrap sm:block">Rows</span>
              <div className="relative flex items-center bg-[var(--soc-card)] rounded border border-[var(--soc-border)]">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPage(1);
                    setPageSize(Number(e.target.value));
                  }}
                  className="appearance-none bg-transparent py-1.5 pl-2 pr-5 text-left text-[11px] font-medium leading-tight text-slate-100 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size} className="bg-white text-black">{size}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <RangeFilter
                rangeKey={timeRange}
                onRangeChange={handleRangeChange}
                dimmed={filterMode === "custom"}
                options={TIME_RANGE_OPTIONS}
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
                  : timeRange}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className="bg-sky-500/10 border border-sky-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-sky-400 uppercase font-semibold">Predictions</div>
              <div className="text-sm md:text-lg font-black text-sky-300 mt-0.5 md:mt-1">{totalPredictionsCount || predictions.length}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">total in range</div>
            </div>
            <div className="bg-violet-500/10 border border-violet-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-violet-400 uppercase font-semibold">Filtered</div>
              <div className="text-sm md:text-lg font-black text-violet-300 mt-0.5 md:mt-1">{filtered.length}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">matching current filters</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-red-400 uppercase font-semibold">Suspicious / Attacks</div>
              <div className="text-sm md:text-lg font-black text-red-300 mt-0.5 md:mt-1">{suspiciousCount}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">{suspiciousPercentage}% of filtered</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-amber-400 uppercase font-semibold">Avg Confidence</div>
              <div className="text-sm md:text-lg font-black text-amber-300 mt-0.5 md:mt-1">{avgConfidence.toFixed(0)}%</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">overall model confidence</div>
            </div>
          </div>
          {dataNotice && (
            <div className={`rounded-lg border px-2.5 md:px-3 py-2 text-[10px] md:text-[11px] ${
              usingMockData
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-sky-500/20 bg-sky-500/10 text-sky-100'
            }`}>
              {dataNotice}
            </div>
          )}

        {/* Timeline Wave Chart + Top Source IPs */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 items-stretch">
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-6 flex flex-col h-full overflow-visible">
            <div className="flex justify-between items-center mb-4 md:mb-6 gap-2">
              <div>
                <div className="text-[11px] md:text-xs font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                  <BarChart3 className="h-3 md:h-4 w-3 md:w-4 text-violet-400" />
                  ML Predictions Timeline
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Click a point to filter predictions by time bucket</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Last {getTimelineRangeDescription(timeRange)}</div>
                <div className="text-[11px] text-slate-600">Updated {formatLiveTimestamp(lastUpdated)}</div>
              </div>
            </div>
            <div className="flex-1 min-h-[240px] md:min-h-[280px] min-w-0 p-2 md:p-4 overflow-visible">
              <div className="min-w-0 h-full overflow-visible">
              {waveData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-500">No timeline data</div>
              ) : (
                <WaveChart 
                  data={waveData} 
                  rangeKey={timeRange} 
                  onPointSelect={handleTimelinePointSelect}
                  activePointKey={selectedTimelinePoint?.key ?? null}
                />
              )}
              </div>
            </div>
          </div>

          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-6 h-full">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] md:text-xs font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                  <Globe className="h-3 md:h-4 w-3 md:w-4 text-emerald-400" />
                  Top 5 Source IPs
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Ranked traffic sources within the selected ML range</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Unique sources</div>
                <div className="text-sm font-black text-emerald-300">{uniqueOptions.srcs.length}</div>
              </div>
            </div>
            {topSourceIps.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500">No data</div>
            ) : (
              <TopSourceIpsCard sourceIps={topSourceIps} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <LineChart className="h-4 w-4 text-sky-400" />
                <span className="text-xs font-semibold text-slate-300">Label Distribution</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-stretch gap-3 py-1 w-full min-h-0">
              <CategoryLineChart items={distribution} totalLabel="predictions" />
            </div>
          </div>

          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 flex flex-col">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] md:text-xs font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                  <Globe className="h-3 md:h-4 w-3 md:w-4 text-violet-400" />
                  Top 5 Destination IPs
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Ranked traffic destinations within the selected ML range</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Unique destinations</div>
                <div className="text-sm font-black text-violet-300">{uniqueOptions.dests.length}</div>
              </div>
            </div>
            {topDestIps.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500">No data</div>
            ) : (
              <TopSourceIpsCard sourceIps={topDestIps} colors={TOP_DEST_IPS_COLORS} />
            )}
          </div>
        </div>



        {/* Filter & Table Section */}
        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg overflow-hidden">
          {selectedTimelinePoint && (
            <div className="p-3 border-b border-[var(--soc-border)] bg-slate-800/60 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-xs text-orange-300">
                Timeline filter: {formatTimelineBucketLabel(selectedTimelinePoint, timeRange)}
              </div>
              <button
                onClick={() => {
                  setSelectedTimelinePoint(null);
                  setPage(1);
                }}
                className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
              >
                Reset Time Filter
              </button>
            </div>
          )}
          {/* Filter Bar */}
          <div className="border-b border-[var(--soc-border)] p-2 md:p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by source IP, destination IP, or service..."
                className="w-full rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-8 pr-8 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
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
                value={filters.label}
                onChange={(e) => {
                  setFilters((s) => ({ ...s, label: e.target.value }));
                  setPage(1);
                }}
                className="appearance-none rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-8 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
              >
                <option value="" className="bg-white text-black">All labels</option>
                {uniqueOptions.labels.map((l) => (
                  <option key={l} value={l} className="bg-white text-black">{l}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto" ref={predictionsTableRef}>
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <div className="text-sm">No predictions match current filters.</div>
              </div>
            ) : (
              <table className="w-full text-[10px] md:text-[11px] text-left whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/70">
                    <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Timestamp</th>
                    <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Label</th>
                    <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Source IP</th>
                    <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Destination IP</th>
                    <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Service</th>
                    <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Confidence</th>
                    <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p, idx) => (
                    <tr
                      key={p.id || p.zeekUid || idx}
                      className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${
                        idx % 2 !== 0 ? 'bg-slate-900/60' : ''
                      }`}
                    >
                      <td className="px-2 md:px-4 py-1.5 md:py-2 text-slate-500 text-[10px] md:text-[11px] whitespace-nowrap">
                        {formatTime(p.timestamp)}
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-2">
                        <PredictionBadge label={p.predictedLabel} />
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-2 text-emerald-400 font-mono text-[10px] md:text-[11px]">
                        {p.sourceIp || '-'}
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-2 text-violet-400 font-mono text-[10px] md:text-[11px]">
                        {p.destinationIp || '-'}
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-2 text-slate-300 text-[10px] md:text-[11px]">
                        {p.service || '-'}
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-2">
                        <ConfidenceBadge score={p.confidence} />
                      </td>
                      <td className="px-2 md:px-4 py-1.5 md:py-2 text-[10px] md:text-[11px] text-slate-400">
                        {getConfidenceMeaning(p.predictedLabel, p.confidence)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="border-t border-slate-800 bg-slate-900/50 px-2 md:px-4 py-3">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0">
                <div className="text-[10px] md:text-[11px] font-mono text-slate-500">
                  <span className="hidden md:inline">SHOWING </span>
                  <span className="font-bold text-sky-400">
                    {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}
                  </span>
                  <span className="hidden md:inline"> - </span>
                  <span className="md:hidden">-</span>
                  <span className="font-bold text-sky-400">
                    {Math.min(page * pageSize, filtered.length)}
                  </span>
                  <span className="hidden md:inline"> OF </span>
                  <span className="md:hidden"> / </span>
                  <span className="font-bold text-sky-400">{filtered.length}</span>
                  <span className="hidden md:inline"> PREDICTIONS</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={page === 1 || loading}
                    onClick={() => {
                      setPage(1);
                      scrollPredictionsTableIntoView();
                    }}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    FIRST
                  </button>

                  <button
                    disabled={page === 1 || loading}
                    onClick={() => {
                      setPage((v) => Math.max(1, v - 1));
                      scrollPredictionsTableIntoView();
                    }}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    PREV
                  </button>

                  <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400">
                    <span className="hidden md:inline">PAGE </span>
                    <span className="text-white">{page}</span> / {totalPages}
                  </span>

                  <button
                    disabled={page >= totalPages || loading}
                    onClick={() => {
                      setPage((v) => Math.min(totalPages, v + 1));
                      scrollPredictionsTableIntoView();
                    }}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    NEXT
                  </button>

                  <button
                    disabled={page >= totalPages || loading}
                    onClick={() => {
                      setPage(totalPages);
                      scrollPredictionsTableIntoView();
                    }}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    LAST
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}






