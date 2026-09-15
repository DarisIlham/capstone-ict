import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BrainCircuit, BarChart3, LineChart, Globe, CalendarRange, ChevronDown, Search, X } from "lucide-react";
import mlApi from '../services/mlApi';
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import PageLoader from "../components/PageLoader";
import FilterSelect from "../components/FilterSelect";
import ExportCsvButton from "../components/ExportCsvButton";
import { exportCsv } from "../utils/exportCsv";
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
  const chartWrapRef = useRef(null);
  const [wrapWidth, setWrapWidth] = useState(1100);

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

  if (!data || data.length === 0) {
    return <div className="flex h-auto min-h-16 items-center justify-center px-3 py-6 text-center text-slate-500 text-xs">No data</div>;
  }

  const width = Math.max(wrapWidth || 0, 280);
  const maxCount = Math.max(1, ...data.map(d => d.count));
  const isNarrow = width < 420;
  const rowHeight = isNarrow ? 36 : 42;
  const barHeight = isNarrow ? 22 : 28;
  const chartHeight = data.length * rowHeight + 12;
  const labelWidth = Math.round(width * (isNarrow ? 0.24 : 0.18));
  const barStartX = labelWidth + (isNarrow ? 12 : 25);
  const rankX = width - (isNarrow ? 16 : 32);
  const barMaxWidth = Math.max(40, rankX - barStartX - (isNarrow ? 20 : 40));

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
    <div ref={chartWrapRef} className="space-y-1 w-full">
      <svg width="100%" height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`} className="block w-full">
        <defs>
          {/* Glow effect untuk bar */}
          <filter id="barGlow">
            <feGaussianBlur stdDeviation="0.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
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
        <line x1="0" y1={chartHeight - 8} x2={width} y2={chartHeight - 8} stroke="var(--soc-border)" strokeWidth="0.5" opacity="0.5" />
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
const TOP_AGENT_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];

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

const TopAgentsCard = ({ agents }) => {
  if (!agents || agents.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-600">No agent data</div>;
  }

  const maxValue = Math.max(...agents.map((a) => Number(a.count) || 0), 1);

  return (
    <div className="flex flex-col gap-3">
      {agents.map((item, i) => {
        const count = Number(item.count) || 0;
        const color = TOP_AGENT_COLORS[i % TOP_AGENT_COLORS.length];
        return (
          <div key={`${item.name}-${i}`} className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 text-[13px] font-bold text-slate-500 shrink-0">
                {i + 1}.
              </span>
              <span className="flex-1 min-w-0 text-[13px] font-mono text-slate-300 truncate" title={item.name}>
                {item.name}
              </span>
              <span className="text-[13px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
                {new Intl.NumberFormat("en-US").format(count)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 shrink-0" />
              <div
                className="flex-1 bg-[var(--soc-bg)] rounded h-4 overflow-hidden"
                title={item.lastSeen ? `Last seen ${formatDetailedTimestamp(item.lastSeen)}` : `${item.name}: ${count} events`}
              >
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(count / maxValue) * 100}%`,
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
const TopIpRankedList = ({ ips, colors, emptyLabel }) => {
  if (!ips || ips.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-600">{emptyLabel || 'No data'}</div>;
  }
  const peakCount = Math.max(1, ...ips.map((d) => Number(d.count) || 0));
  return (
    <div className="space-y-3">
      {ips.map((item, idx) => {
        const accent = (colors || TOP_SOURCE_IPS_COLORS)[idx % (colors || TOP_SOURCE_IPS_COLORS).length];
        const count = Number(item.count) || 0;
        const label = String(item.label ?? '');
        const tip = `${label} • ${new Intl.NumberFormat('en-US').format(count)} events`;
        return (
          <div key={`${label}-${idx}`} className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="w-5 text-[13px] font-bold text-slate-500 shrink-0">{idx + 1}.</span>
              <span className="flex-1 min-w-0 text-[13px] font-mono text-slate-300 truncate" title={tip}>
                {label}
              </span>
              <span className="text-[13px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
                {new Intl.NumberFormat("en-US").format(count)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-5 shrink-0" />
              <div
                className="flex-1 bg-[var(--soc-bg)] rounded h-4 overflow-hidden"
                title={tip}
              >
                <div
                  className="h-full rounded transition-all"
                  style={{ width: `${Math.max((count / peakCount) * 100, 3)}%`, backgroundColor: accent }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TopIpsTabbedCard = ({ sourceIps = [], destIps = [] }) => {
  const [activeTab, setActiveTab] = useState('source');
  const isSrc = activeTab === 'source';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 mt-1.5 flex flex-wrap items-center gap-1 sm:mb-3">
        {[
          { key: 'source', label: 'Source' },
          { key: 'dest', label: 'Destination' },
        ].map((option) => (
          <button
            key={option.key}
            onClick={() => setActiveTab(option.key)}
            className={`rounded-md px-1.5 py-1 text-[9px] sm:px-2 sm:py-1.5 sm:text-[11px] font-medium transition-colors ${activeTab === option.key
              ? 'border border-sky-600/30 bg-sky-600/20 text-sky-400'
              : 'border border-transparent text-slate-500 hover:text-slate-300'
              }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {isSrc ? (
          <TopIpRankedList ips={sourceIps} colors={TOP_SOURCE_IPS_COLORS} emptyLabel="No source IP data" />
        ) : (
          <TopIpRankedList ips={destIps} colors={TOP_DEST_IPS_COLORS} emptyLabel="No destination IP data" />
        )}
      </div>
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
// Warna ranking untuk Label Distribution: rank 1 = merah (paling banyak), dst.
const LABEL_RANK_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a78bfa', '#ec4899', '#14b8a6', '#6366f1'];
const COLORS = LABEL_RANK_COLORS;
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
  // Samakan dengan format Time di halaman Host Monitoring (AttackDashboard):
  // "Sep 14, 2026, 08:00:49 AM"
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatTimeFull = (isoString) => {
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

  if (rangeKey === '24h') {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
    });
  }

  if (rangeKey === '7d') {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
  });
};

const getTimelineBucketMs = (minutes) => {
  if (minutes <= 60) return 5 * 60 * 1000;
  if (minutes <= 1440) return 60 * 60 * 1000;
  if (minutes <= 10080) return 6 * 60 * 60 * 1000;
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
  const preferredStepMs = getTimelineBucketMs(safeMinutes);
  const now = Date.now();
  const startMs = start ? getTimestampMs(start) : now - rangeMs;
  const endMs = end ? getTimestampMs(end) : now;

  const filteredPredictions = predictions
    .map((item) => ({
      ...item,
      _ts: getTimestampMs(item.timestamp),
    }))
    .filter((item) => Number.isFinite(item._ts) && Number.isFinite(startMs) && Number.isFinite(endMs) && item._ts >= startMs && item._ts <= endMs);

  // Keep empty ML timelines readable by placing zero-value points one hour apart.
  const stepMs = filteredPredictions.length ? preferredStepMs : 60 * 60 * 1000;
  const bucketStart = (ts) => Math.floor(ts / stepMs) * stepMs;

  const buckets = new Map();
  let minBucket = Number.isFinite(startMs) ? bucketStart(startMs) : Infinity;
  let maxBucket = Number.isFinite(endMs) ? bucketStart(endMs) : -Infinity;

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
      <div className="flex h-full min-h-24 w-full flex-col items-center justify-center text-center text-xs text-slate-600">
        <p>No data available</p>
        <p className="mt-0.5">No data for the selected time range.</p>
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
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width, height });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: Math.max(rect.width, 200), height: Math.max(rect.height, 100) });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  width = size.width;
  height = size.height;
  const maxV = Math.max(1, ...data.map((d) => d.v));
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : 0;

  const gridLines = [];

  const gridSteps = 5;
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
      const controlY1 = prevY;
      const controlY2 = y;
      pathD += ` C ${controlX} ${controlY1}, ${controlX} ${controlY2}, ${x} ${y}`;
    }
  }

  const tickCount = clamp(Math.floor(innerW / 160), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-visible" onMouseLeave={() => setSelectedPoint(null)}>
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
              <circle
                cx={x}
                cy={y}
                r="10"
                fill="transparent"
                className="cursor-pointer focus:outline-none"
                style={{ outline: "none" }}
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
                r="3.5"
                fill={isActive ? "#a78bfa" : "#a78bfa"}
                stroke={isActive ? "#0f172a" : "none"}
                strokeWidth="2.5"
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
                fontSize="10"
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
const getConfidenceScore = (p) => {
  const raw = typeof p.confidence === 'number' ? p.confidence : parseFloat(p.confidence);
  if (Number.isNaN(raw)) return null;
  return Math.min(Math.max(raw > 1 ? raw : raw * 100, 0), 100);
};

const ConfidenceBadge = ({ score, label }) => {
  if (score === undefined || score === null || score === '') return <span className="text-slate-400">-</span>;
  const raw = typeof score === 'number' ? score : parseFloat(score);
  if (isNaN(raw)) return <span className="text-slate-400">-</span>;
  // Normalisasi: backend bisa mengirim 0-1 atau 0-100
  const pct = Math.round(Math.min(Math.max(raw > 1 ? raw : raw * 100, 0), 100));

  const lowerLabel = String(label || '').toLowerCase();
  const isBenign = lowerLabel.includes('benign') || lowerLabel.includes('normal');

  // Attack/suspicious: makin yakin model = makin bahaya (merah paling tinggi).
  // Benign: makin yakin model = makin aman (hijau paling tinggi).
  let bg = 'bg-slate-800/60';
  let text = 'text-slate-400';
  let border = 'border-slate-700/50';
  if (isBenign) {
    if (pct >= 80) { bg = 'bg-green-900/30'; text = 'text-green-400'; border = 'border-green-700/50'; }
    else if (pct >= 60) { bg = 'bg-lime-900/30'; text = 'text-lime-400'; border = 'border-lime-700/50'; }
    else if (pct >= 40) { bg = 'bg-yellow-900/30'; text = 'text-yellow-400'; border = 'border-yellow-700/50'; }
    else { bg = 'bg-orange-900/30'; text = 'text-orange-400'; border = 'border-orange-700/50'; }
  } else {
    if (pct >= 80) { bg = 'bg-red-900/30'; text = 'text-red-400'; border = 'border-red-700/50'; }
    else if (pct >= 60) { bg = 'bg-orange-900/30'; text = 'text-orange-400'; border = 'border-orange-700/50'; }
    else if (pct >= 40) { bg = 'bg-yellow-900/30'; text = 'text-yellow-400'; border = 'border-yellow-700/50'; }
    else { bg = 'bg-slate-800/60'; text = 'text-slate-300'; border = 'border-slate-700/50'; }
  }

  return (
    <span
      className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded border font-semibold inline-block ${bg} ${text} ${border}`}
      title={isBenign ? `Model ${pct}% yakin ini benign` : `Model ${pct}% yakin ini ancaman`}
    >
      {pct}%
    </span>
  );
};

const PredictionBadge = ({ label }) => {
  const isBenign = String(label).toLowerCase().includes('benign');
  return (
    <span className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${isBenign
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
  const [dataNotice, setDataNotice] = useState('');

  const [predictions, setPredictions] = useState([]);
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [totalPredictionsCount, setTotalPredictionsCount] = useState(0);

  const [filters, setFilters] = useState({
    label: 'all',
    agent: 'all',
    sourceIp: 'all',
    destinationIp: 'all',
    service: 'all',
    confidenceRange: 'all',
  });
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
        notices.push('Predictions list failed to load from the primary endpoint.');
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
            notices.push(`Some predictions data failed to load on page ${failedPages.join(', ')}.`);
          }
        }
      }

      const nextStats = buildStatsFromPredictions(preds);

      let nextTimeline = [];

      if (timelineResult.status === 'fulfilled' && Array.isArray(timelineResult.value?.data) && timelineResult.value.data.length) {
        nextTimeline = timelineResult.value.data;
      } else {
        nextTimeline = buildTimelineFromPredictions(preds, minutes, start, end);

        if (nextTimeline.length > 0 && preds.length > 0) {
          if (timelineResult.status === 'fulfilled') {
            notices.push('Timeline built from real prediction data because the timeline endpoint did not return buckets.');
          } else {
            notices.push('Timeline built from real prediction data because the timeline endpoint failed.');
          }
        }
      }

      if (predictionsResult.status === 'fulfilled' || timelineResult.status === 'fulfilled') {
        setPredictions(Array.isArray(preds) ? preds : []);
        setTotalPredictionsCount(responseTotalPredictions);
        setStats(nextStats);
        setTimeline(nextTimeline);
        setLastUpdated(new Date().toISOString());
        if (!preds.length && !nextTimeline.length) {
          notices.push('No ML data exists for the selected range.');
        }
        setDataNotice(notices.join(' '));
        return;
      }

      setPredictions([]);
      setTotalPredictionsCount(0);
      setStats(null);
      setTimeline([]);
      setError(new Error('Real ML data is not available.'));
      setDataNotice('Real ML data is not available. Check the connection to the backend.');
    } catch (err) {
      console.error('ML API error:', err);
      setPredictions([]);
      setTotalPredictionsCount(0);
      setStats(null);
      setTimeline([]);
      setError(err);
      setDataNotice(`An error occurred while loading ML data: ${err?.message || 'unknown error'}`);
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
    const agents = new Set();
    const labels = new Set();
    const srcs = new Set();
    const dests = new Set();
    const services = new Set();
    for (const p of predictions) {
      if (p.agent) agents.add(p.agent);
      if (p.predictedLabel) labels.add(p.predictedLabel);
      if (p.sourceIp) srcs.add(p.sourceIp);
      if (p.destinationIp) dests.add(p.destinationIp);
      if (p.service) services.add(p.service);
    }
    return {
      agents: Array.from(agents).sort(),
      labels: Array.from(labels).sort(),
      srcs: Array.from(srcs).sort(),
      dests: Array.from(dests).sort(),
      services: Array.from(services).sort(),
    };
  }, [predictions]);

  const filtered = useMemo(() => {
    let result = predictions.filter((p) => {
      if (filters.label && filters.label !== "all" && String(p.predictedLabel) !== String(filters.label)) return false;
      if (filters.agent !== "all" && String(p.agent || "-") !== String(filters.agent)) return false;
      if (filters.sourceIp !== "all" && String(p.sourceIp || "-") !== String(filters.sourceIp)) return false;
      if (filters.destinationIp !== "all" && String(p.destinationIp || "-") !== String(filters.destinationIp)) return false;
      if (filters.service !== "all" && String(p.service || "-") !== String(filters.service)) return false;
      if (filters.confidenceRange && filters.confidenceRange !== "all") {
        const confidence = getConfidenceScore(p);
        if (confidence === null) return false;
        const [minC, maxC] = filters.confidenceRange.split("-").map(Number);
        if (confidence < minC || confidence > maxC) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const source = String(p.sourceIp || '').toLowerCase();
        const dest = String(p.destinationIp || '').toLowerCase();
        const service = String(p.service || '').toLowerCase();
        const agent = String(p.agent || '').toLowerCase();
        if (!source.includes(q) && !dest.includes(q) && !service.includes(q) && !agent.includes(q)) return false;
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

  const handleExportCsv = async () => {
    const rows = predictions.map((p) => {
      const conf = getConfidenceScore(p);
      return [
        formatTime(p.timestamp),
        p.agent || "-",
        p.predictedLabel || "-",
        p.sourceIp || "-",
        p.destinationIp || "-",
        p.service || "-",
        conf == null ? "-" : `${conf}%`,
      ];
    });
    exportCsv({
      filename: `ml-predictions-${new Date().toISOString().slice(0, 10)}.csv`,
      header: ["Timestamp", "Agent", "Label", "Source IP", "Destination IP", "Service", "Confidence (%)"],
      rows,
    });
  };

  const distribution = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.predictedLabel || 'unknown';
      map.set(key, (map.get(key) || 0) + 1);
    }
    // Urutkan dari yang paling banyak dulu supaya rank 1 (merah) = jumlah terbesar.
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, label: name, value }))
      .sort((a, b) => b.value - a.value)
      .map((entry, i) => ({
        ...entry,
        color: LABEL_RANK_COLORS[i % LABEL_RANK_COLORS.length],
      }));
  }, [filtered]);

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

  const uniqueSourceIpCount = useMemo(() => {
    const set = new Set();
    for (const p of filtered) set.add(p.sourceIp || "unknown");
    return set.size;
  }, [filtered]);

  const uniqueDestIpCount = useMemo(() => {
    const set = new Set();
    for (const p of filtered) set.add(p.destinationIp || "unknown");
    return set.size;
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

  const topAgents = useMemo(() => {
    const map = new Map();
    for (const p of predictions) { // Use ALL predictions, not filtered
      const name = String(p.agent || 'unknown');
      const existing = map.get(name) || { name, count: 0, lastSeen: 0 };
      existing.count += 1;
      existing.lastSeen = Math.max(existing.lastSeen, getTimestampMs(p.timestamp) || 0);
      map.set(name, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 agents
  }, [predictions]);

  const uniqueAgents = useMemo(() => {
    const set = new Set();
    for (const p of predictions) {
      set.add(String(p.agent || 'unknown'));
    }
    return set.size;
  }, [predictions]);

  const waveData = useMemo(() => {
    const minutes = filterMode === "custom"
      ? getDateRangeMinutes(getIsoDateRange(normalizeDateRange(customDateRange)))
      : (RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE]);
    const range = filterMode === "custom"
      ? getIsoDateRange(normalizeDateRange(customDateRange))
      : getRangeWindow(timeRange);
    const bucketMs = getTimelineBucketMs(minutes);

    const buildEmptySeries = () => buildTimelineFromPredictions([], minutes, range.start, range.end)
      .map((point) => createTimelineBucketPoint(getTimestampMs(point.timestamp), 0, point.bucketMs))
      .filter(Boolean);

    if (!timeline || timeline.length === 0) {
      return buildEmptySeries();
    }

    const map = new Map();

    for (const t of timeline) {
      if (!t) continue;
      const ts = getTimestampMs(t.timestamp || t.ts || t.start || t.time);
      if (!Number.isFinite(ts)) continue;

      const bucketStartMs = Math.floor(ts / bucketMs) * bucketMs;
      const count = Number(t.total ?? t.count ?? t.v ?? 0);
      map.set(bucketStartMs, (map.get(bucketStartMs) || 0) + (Number.isFinite(count) ? count : 0));
    }

    const result = Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([bucketStartMs, count]) => createTimelineBucketPoint(bucketStartMs, count, bucketMs))
      .filter(Boolean);

    if (result.length === 0) return buildEmptySeries();

    const rangeStartMs = range.start ? getTimestampMs(range.start) : Date.now() - minutes * 60000;
    const rangeEndMs = range.end ? getTimestampMs(range.end) : Date.now();
    if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs) || rangeEndMs < rangeStartMs) {
      return result;
    }
    const firstBucket = Math.floor(rangeStartMs / bucketMs) * bucketMs;
    const lastBucket = Math.floor(rangeEndMs / bucketMs) * bucketMs;
    const countByBucket = new Map(result.map((p) => [p.t, p.v]));
    const full = [];
    for (let t = firstBucket; t <= lastBucket; t += bucketMs) {
      const existing = countByBucket.get(t);
      full.push(createTimelineBucketPoint(t, Number.isFinite(existing) ? existing : 0, bucketMs));
    }
    return full.length > 0 ? full.filter(Boolean) : result;
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
    return <PageLoader message="Loading ML Dashboard..." size="lg" />;
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
    <div className="soc-page-shell soc-fluid-page flex flex-col gap-3 sm:gap-4 w-full min-w-0">
      <div className="soc-page-heading bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-3 md:p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
          <div>
            <h1 className="soc-page-title flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 sm:h-5 sm:w-5 text-violet-400" />
              ML Predictions Dashboard
            </h1>
            <p className="soc-page-subtitle">
              Real-time machine learning traffic prediction and threat classification
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-2 md:p-4 flex flex-col gap-3 md:gap-4">
        <div className="soc-data-toolbar flex flex-row flex-wrap items-center justify-between gap-2">
            <div className="rows-selector flex items-center gap-2 min-w-0 flex-shrink-0">
              <label className="hidden items-center gap-1 text-[10px] text-slate-400 sm:flex whitespace-nowrap">
                <span>Rows</span>
              </label>
            <div className="relative flex items-center bg-[var(--soc-card)] rounded-lg border border-[var(--soc-border)]">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
                className="appearance-none bg-transparent py-2 pl-2.5 pr-5 text-left text-[11px] font-medium leading-tight text-slate-100 focus:outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size} className="bg-white text-black">{size}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>
            <ExportCsvButton accent="violet" onClick={handleExportCsv} />
          </div>

          <div className="soc-filter-toolbar ml-auto flex flex-wrap items-center gap-2">
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

        <div className="soc-kpi-grid">
          <div className="bg-violet-500/10 border border-violet-500/30 rounded p-2 md:p-3">
            <div className="text-[8px] md:text-[10px] text-violet-400 uppercase font-semibold">Predictions</div>
            <div className="text-sm md:text-lg font-black text-violet-300 mt-0.5 md:mt-1">{totalPredictionsCount || predictions.length}</div>
            <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">total in range</div>
          </div>
          <div className="bg-sky-500/10 border border-sky-500/30 rounded p-2 md:p-3">
            <div className="text-[8px] md:text-[10px] text-sky-400 uppercase font-semibold">Unique Source IPs</div>
            <div className="text-sm md:text-lg font-black text-sky-300 mt-0.5 md:mt-1">{uniqueSourceIpCount}</div>
            <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">from filtered predictions</div>
          </div>
          <div className="bg-teal-500/10 border border-teal-500/30 rounded p-2 md:p-3">
            <div className="text-[8px] md:text-[10px] text-teal-400 uppercase font-semibold">Unique Dest IPs</div>
            <div className="text-sm md:text-lg font-black text-teal-300 mt-0.5 md:mt-1">{uniqueDestIpCount}</div>
            <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">from filtered predictions</div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 md:p-3">
            <div className="text-[8px] md:text-[10px] text-amber-400 uppercase font-semibold">Avg Confidence</div>
            <div className="text-sm md:text-lg font-black text-amber-300 mt-0.5 md:mt-1">{avgConfidence.toFixed(0)}%</div>
            <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">overall model confidence</div>
          </div>
        </div>
        {dataNotice && (
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 md:px-3 py-2 text-[10px] md:text-[11px] text-sky-100">
            {dataNotice}
          </div>
        )}

        {/* Timeline + Top 5 Agents (1 row, 2 kolom) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 items-stretch">
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-5 flex flex-col h-full overflow-visible soc-fluid-card">
            <div className="soc-chart-header flex flex-wrap justify-between items-start gap-x-3 gap-y-1.5 mb-4 md:mb-4">
              <div className="min-w-0">
                <div className="text-[11px] md:text-xs font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                  <BarChart3 className="h-3 md:h-4 w-3 md:w-4 text-violet-400 shrink-0" />
                  <span className="truncate">ML Predictions Timeline</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Click a point to filter predictions by time bucket</div>
              </div>
              <div className="soc-chart-meta text-right min-w-0">
                <div className="text-xs text-slate-500 whitespace-nowrap">Last {getTimelineRangeDescription(timeRange)}</div>
                <div className="text-[11px] text-slate-600 break-words">Updated {formatLiveTimestamp(lastUpdated)}</div>
              </div>
            </div>
            <div className="flex-1 min-h-0 min-w-0 soc-chart--ml p-2 md:p-4 overflow-visible">
              <div className="min-w-0 h-full overflow-visible">
                <WaveChart
                  data={waveData}
                  rangeKey={timeRange}
                  onPointSelect={handleTimelinePointSelect}
                  activePointKey={selectedTimelinePoint?.key ?? null}
                />
              </div>
            </div>
          </div>
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-5 h-full flex flex-col min-w-0">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] md:text-xs font-semibold text-slate-300">Top 5 Agents</div>
                <div className="mt-1 text-[11px] text-slate-500">Most active agents from ML predictions</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Unique agents</div>
                <div className="text-xs font-black text-emerald-300">{uniqueAgents}</div>
              </div>
            </div>
            <TopAgentsCard agents={topAgents} />
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
            <div className="flex flex-1 flex-col items-stretch gap-3 py-1 w-full min-h-0 soc-chart">
              <CategoryLineChart items={distribution} totalLabel="predictions" />
            </div>
          </div>

          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center gap-1 min-[600px]:gap-1.5 min-[1200px]:gap-2">
                <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400" />
                <span className="text-[11px] sm:text-xs font-semibold text-slate-300">Top 5 Source &amp; Destination IPs</span>
              </div>
            </div>
            <div className="mb-1 text-[11px] text-slate-500">Ranked traffic endpoints within the selected ML range</div>
            <TopIpsTabbedCard sourceIps={topSourceIps} destIps={topDestIps} />
          </div>
        </div>



        {/* Filter & Table Section */}
        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg overflow-hidden">
          <div className="p-3 md:p-4 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
            {selectedTimelinePoint && (
              <div className="mb-4 flex items-start justify-between gap-3">
              <div className="text-xs text-violet-300">
                Timeline filter: {formatTimelineBucketLabel(selectedTimelinePoint, timeRange)}
              </div>
              <button
                onClick={() => {
                  setSelectedTimelinePoint(null);
                  setPage(1);
                }}
                className="shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-200 transition-colors hover:bg-violet-500/20"
              >
                Reset Time Filter
              </button>
              </div>
            )}
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                value={filters.label}
                allLabel="All labels"
                options={uniqueOptions.labels}
                accent="violet"
                onChange={(nextValue) => {
                  setFilters((s) => ({ ...s, label: nextValue }));
                  setPage(1);
                }}
              />
              <FilterSelect
                value={filters.agent}
                allLabel="All agents"
                options={uniqueOptions.agents}
                accent="violet"
                onChange={(nextValue) => {
                  setFilters((s) => ({ ...s, agent: nextValue }));
                  setPage(1);
                }}
              />
              <FilterSelect
                value={filters.sourceIp}
                allLabel="All source IPs"
                options={uniqueOptions.srcs}
                accent="violet"
                onChange={(nextValue) => {
                  setFilters((s) => ({ ...s, sourceIp: nextValue }));
                  setPage(1);
                }}
              />
              <FilterSelect
                value={filters.destinationIp}
                allLabel="All destination IPs"
                options={uniqueOptions.dests}
                accent="violet"
                onChange={(nextValue) => {
                  setFilters((s) => ({ ...s, destinationIp: nextValue }));
                  setPage(1);
                }}
              />
              <FilterSelect
                value={filters.service}
                allLabel="All services"
                options={uniqueOptions.services}
                accent="violet"
                onChange={(nextValue) => {
                  setFilters((s) => ({ ...s, service: nextValue }));
                  setPage(1);
                }}
              />
<FilterSelect
                value={filters.confidenceRange}
                allLabel="All confidences"
                options={[
                  { value: "80-100", label: "\u2265 80%" },
                  { value: "60-79", label: "60 \u2013 79%" },
                  { value: "40-59", label: "40 \u2013 59%" },
                  { value: "0-39", label: "< 40%" },
                ]}
                accent="violet"
                onChange={(nextValue) => {
                  setFilters((s) => ({ ...s, confidenceRange: nextValue }));
                  setPage(1);
                }}
              />
            </div>
            </div>
            </div>

          {/* Table */}
          <div className="overflow-x-auto soc-table-scroll" ref={predictionsTableRef}>
            <table
              className="ml-table-compact w-max min-w-full mx-auto text-[10px] md:text-[11px] text-left soc-responsive-table"
              style={{ borderCollapse: "collapse", borderSpacing: 0, tableLayout: "auto" }}
            >
              <colgroup>
                <col className="ml-col-timestamp" style={{ width: "270px" }} />
                <col className="ml-col-agent" style={{ width: "250px", minWidth: "230px" }} />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  <th style={{ padding: "8px 14px", width: "270px", minWidth: "260px", maxWidth: "300px" }} className="text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase whitespace-nowrap">Timestamp</th>
                  <th style={{ padding: "8px 14px", minWidth: "230px", width: "250px", whiteSpace: "normal", overflowWrap: "break-word" }} className="text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Agent</th>
                  <th style={{ padding: "8px 4px" }} className="text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase whitespace-nowrap">Label</th>
                  <th style={{ padding: "8px 4px" }} className="text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase whitespace-nowrap">Source IP</th>
                  <th style={{ padding: "8px 4px" }} className="text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase whitespace-nowrap">Destination IP</th>
                  <th style={{ padding: "8px 4px" }} className="text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase whitespace-nowrap">Service</th>
                  <th style={{ padding: "8px 4px" }} className="text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase whitespace-nowrap">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">
                      No predictions match current filters.
                    </td>
                  </tr>
                ) : pageItems.map((p, idx) => (
                  <tr
                    key={p.id || p.zeekUid || idx}
                    className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${idx % 2 !== 0 ? 'bg-slate-900/60' : ''
                      }`}
                  >
                    <td style={{ padding: "6px 14px", width: "270px", minWidth: "260px", maxWidth: "300px" }} className="text-slate-500 text-[10px] md:text-[11px] whitespace-nowrap" title={formatTimeFull(p.timestamp)}>
                      {formatTime(p.timestamp)}
                    </td>
                    <td style={{ padding: "6px 14px", minWidth: "230px", width: "250px" }} className="text-sky-300 text-[10px] md:text-[11px] whitespace-nowrap">
                      {p.agent || '-'}
                    </td>
                    <td style={{ padding: "6px 4px" }} className="whitespace-nowrap">
                      <PredictionBadge label={p.predictedLabel} />
                    </td>
                    <td style={{ padding: "6px 4px" }} className="text-emerald-400 font-mono text-[10px] md:text-[11px] whitespace-nowrap">
                      {p.sourceIp || '-'}
                    </td>
                    <td style={{ padding: "6px 4px" }} className="text-violet-400 font-mono text-[10px] md:text-[11px] whitespace-nowrap">
                      {p.destinationIp || '-'}
                    </td>
                    <td style={{ padding: "6px 4px" }} className="text-slate-300 text-[10px] md:text-[11px] whitespace-nowrap">
                      {p.service || '-'}
                    </td>
                    <td style={{ padding: "6px 4px" }} className="whitespace-nowrap">
                      <ConfidenceBadge score={p.confidence} label={p.predictedLabel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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






