import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, BarChart3, BrainCircuit, ChevronDown, Clock, Globe, LineChart, Search, ShieldAlert, SlidersHorizontal, Users, X } from "lucide-react";
import mlApi from '../services/mlApi';
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
  toDateTimeLocalValue,
} from "../utils/dateRange";
import { adaptiveLeftGutter } from "../utils/chartAxis";
import { InlineEmptyState } from "../components/EmptyState";

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const withAlpha = (hex, alpha) => {
  const safeHex = String(hex || '').replace('#', '');
  if (safeHex.length !== 6) return hex;
  const r = parseInt(safeHex.slice(0, 2), 16);
  const g = parseInt(safeHex.slice(2, 4), 16);
  const b = parseInt(safeHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const TOP_SOURCE_IPS_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
const TOP_DEST_IPS_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
const LABEL_RANK_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a78bfa', '#ec4899', '#14b8a6', '#6366f1'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const PREDICTIONS_FETCH_BATCH_SIZE = 1000;
const DEFAULT_TIME_RANGE = '24h';
const RANGE_TO_MINUTES = { '1h': 60, '24h': 1440, '7d': 10080, '30d': 43200 };

const getValidDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const getTimestampMs = (value) => getValidDate(value)?.getTime() ?? null;
const formatDetailedTimestamp = (timestamp) => {
  const date = getValidDate(timestamp);
  if (!date) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const formatTime = (isoString) => {
  const date = getValidDate(isoString);
  if (!date) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const formatTimeFull = (isoString) => {
  const date = getValidDate(isoString);
  if (!date) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '').replace('AM', '').replace('PM', '').trim();
};
const formatLiveTimestamp = (isoString) => {
  const date = getValidDate(isoString);
  if (!date) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const getTimelineRangeDescription = (value) => {
  const map = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
  return map[String(value)] || String(value);
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
  return { key: start, t: bucketStartMs, time: start, start, end, bucketMs, v: value };
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
  const filteredPredictions = predictions.map((item) => ({ ...item, _ts: getTimestampMs(item.timestamp) })).filter((item) => Number.isFinite(item._ts) && Number.isFinite(startMs) && Number.isFinite(endMs) && item._ts >= startMs && item._ts <= endMs);
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
    if (point) output.push({ timestamp: point.start, total: point.v, start: point.start, end: point.end, bucketMs: point.bucketMs, labels: [] });
  }
  return output;
};

// ── KPI Card (kpi-modern seperti FimEvents / FileSecurityScanner) ────────────────
const KPICard = ({ label, value, icon: Icon, color, desc, loading, index = 0 }) => (
  <div className={`kpi-modern animate-fadeInUp stagger-${index + 1}`} style={{ opacity: 0 }}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">{label}</span>
      <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
    </div>
    <div className={`text-xl font-bold ${color} mb-1`}>
      {loading ? <div className="skeleton h-6 w-16"></div> : value}
    </div>
    {desc && <div className="text-[9px] text-[var(--soc-text-muted)]">{desc}</div>}
  </div>
);

// ── BarList (seperti FileSecurityScanner) ────────────────────────────────────
const BarList = ({ items, emptyLabel = "No data", onSelect = null, activeValue = null }) => {
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
        const inner = (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color }}>{i + 1}</span>
                <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)] font-mono" title={label}>{label}</span>
              </div>
              <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(value)}</span>
            </div>
            <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
              <div className="h-full rounded-full transition-all duration-500" title={`${label}: ${value}`} style={{ width: `${(value / maxValue) * 100}%`, backgroundColor: color }} />
            </div>
          </>
        );
        if (!onSelect) {
          return <div key={label} className="w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg">{inner}</div>;
        }
        return (
          <button key={label} type="button" onClick={() => onSelect(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg text-left ${isActive ? "bg-violet-500/10 ring-1 ring-violet-500/30" : ""}`}>
            {inner}
          </button>
        );
      })}
    </div>
  );
};

const TopAgentsCard = ({ agents, onItemClick = null, activeName = null }) => {
  if (!agents || agents.length === 0) {
    return <InlineEmptyState title="No agent data" description="No agent activity available." />;
  }
  const maxCount = Math.max(...agents.map((a) => Number(a.count) || 0), 1);
  const CHART_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
  return (
    <div className="w-full min-w-0 max-w-full space-y-1.5">
      {agents.map((item, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const label = item.name || "Unknown agent";
        const value = Number(item.count) || 0;
        const isActive = activeName != null && String(label) === String(activeName);
        const inner = (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color }}>{i + 1}</span>
                <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)] font-mono" title={label}>{label}</span>
              </div>
              <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(value)}</span>
            </div>
            <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(value / maxCount) * 100}%`, backgroundColor: color }} />
            </div>
          </>
        );
        if (!onItemClick) {
          return <div key={label} className="w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg">{inner}</div>;
        }
        return (
          <button key={label} type="button" onClick={() => onItemClick(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg text-left ${isActive ? "bg-violet-500/10 ring-1 ring-violet-500/30" : ""}`}>
            {inner}
          </button>
        );
      })}
    </div>
  );
};

// ── ML Combined Filter (mirror FimCombinedFilter, accent violet) ─────────────
const MlCombinedFilter = ({ labelFilter, onLabelChange, labelOptions = [], agentFilter, onAgentChange, agentOptions = [], sourceIpFilter, onSourceIpChange, sourceIpOptions = [], destIpFilter, onDestIpChange, destIpOptions = [], serviceFilter, onServiceChange, serviceOptions = [], dateFilterLabel = "", onResetDateFilter, timelineFilterLabel = "", onClearTimelineFilter }) => {
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
  const normalizeOption = (opt) => {
    const isObject = opt && typeof opt === "object";
    return { value: isObject ? opt.value : opt, label: isObject ? opt.label : opt };
  };
  const activeCount = [labelFilter !== "all", agentFilter !== "all", sourceIpFilter !== "all", destIpFilter !== "all", serviceFilter !== "all", Boolean(dateFilterLabel), Boolean(timelineFilterLabel)].filter(Boolean).length;
  const Section = ({ label, value, allLabel, options, onChange }) => (
    <div className="px-3 py-2">
      <div className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => onChange("all")} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${value === "all" ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{allLabel}</button>
        {options.map((opt) => {
          const { value: optVal, label: optLabel } = normalizeOption(opt);
          return <button key={optVal} onClick={() => onChange(optVal)} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${value === optVal ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{optLabel}</button>;
        })}
      </div>
    </div>
  );
  return (
    <div ref={containerRef} className="relative">
      <button ref={buttonRef} type="button" onClick={() => setOpen((c) => !c)} className="flex items-center gap-2 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-2.5 text-[11px] text-[var(--soc-text-primary)] focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors hover:bg-[var(--soc-elevated)]">
        <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--soc-text-muted)]" />
        <span className="font-medium">Filters</span>
        {activeCount > 0 && <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-violet-500/20 text-violet-300 text-[9px] font-bold">{activeCount}</span>}
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--soc-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="fixed z-[9999] w-[280px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] shadow-2xl" style={{ top: coords.top, left: coords.left }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--soc-border)]">
            <span className="text-[10px] font-semibold text-[var(--soc-text-primary)]">Filter Options</span>
            {activeCount > 0 && <button onClick={() => { onLabelChange("all"); onAgentChange("all"); onSourceIpChange("all"); onDestIpChange("all"); onServiceChange("all"); if (dateFilterLabel && onResetDateFilter) onResetDateFilter(); if (onClearTimelineFilter) onClearTimelineFilter(); }} className="text-[9px] font-semibold text-violet-400 hover:text-violet-300 transition-colors">Clear all</button>}
          </div>
          {timelineFilterLabel && (
            <div className="border-b border-[var(--soc-border)] px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">Timeline filter</div>
              <div className="mt-1.5 flex items-center gap-1.5 rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-medium text-violet-300">
                <Clock className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                <span className="min-w-0 flex-1 truncate" title={timelineFilterLabel}>{timelineFilterLabel}</span>
                <button onClick={onClearTimelineFilter} className="shrink-0 hover:text-white" aria-label="Clear timeline filter"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}
          {dateFilterLabel && <div className="border-b border-[var(--soc-border)] px-3 py-2"><div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">Timeline date filter</div><div className="mt-1"><span className="block min-w-0 truncate rounded border border-violet-500/30 bg-violet-500/20 px-2 py-1 text-[10px] font-medium text-violet-300" title={dateFilterLabel}>{dateFilterLabel}</span></div></div>}
          <div className="divide-y divide-[var(--soc-border)] max-h-[360px] overflow-y-auto">
            <Section label="Label" value={labelFilter} allLabel="All labels" options={labelOptions} onChange={onLabelChange} />
            <Section label="Agent" value={agentFilter} allLabel="All agents" options={agentOptions} onChange={onAgentChange} />
            <Section label="Source IP" value={sourceIpFilter} allLabel="All source IPs" options={sourceIpOptions} onChange={onSourceIpChange} />
            <Section label="Destination IP" value={destIpFilter} allLabel="All destination IPs" options={destIpOptions} onChange={onDestIpChange} />
            <Section label="Service" value={serviceFilter} allLabel="All services" options={serviceOptions} onChange={onServiceChange} />
          </div>
        </div>
      )}
    </div>
  );
};

const CategoryLineChart = ({ items, color = "#a78bfa", totalLabel = "items", onPointClick = null, activeLabel = null }) => {
  const [selected, setSelected] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 1000, height: 210 });
  const basePadding = { l: 56, r: 56, t: 12, b: 42 };
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const width = size.width;
  const height = size.height;
  if (!items || items.length === 0) {
    return <InlineEmptyState title="No data available" />;
  }
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, it) => s + it.value, 0) || 1;
  const maxV = Math.max(1, ...sorted.map((d) => d.value));
  const gridVals = [0, 1, 2, 3].map((i) => Math.round(((i / 3) * maxV * 10)) / 10);
  const padding = { ...basePadding, l: adaptiveLeftGutter(gridVals, basePadding.l, 12, "600 10px sans-serif") };
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
  const points = sorted.map((it, i) => ({ x: xFor(i), y: yFor(it.value), label: it.label, value: it.value, color: it.color || color, index: i }));
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]; const b = points[i + 1];
    const controlX = (a.x + b.x) / 2;
    segments.push({ d: `M ${a.x} ${a.y} C ${controlX} ${a.y}, ${controlX} ${b.y}, ${b.x} ${b.y}`, color: b.color, key: `${a.label}-${b.label}` });
  }
  return (
    <div className="relative w-full flex flex-col h-full min-h-0" onMouseLeave={() => setSelected(null)}>
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[11px] text-slate-600 uppercase font-semibold">Total</span>
        <span className="text-sm font-bold text-slate-300">{total} <span className="text-xs font-normal text-slate-500">{totalLabel}</span></span>
      </div>
      <div ref={rootRef} className="flex-1 min-h-0 w-full">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
          {gridLines.map((grid, idx) => (
            <g key={`grid-${idx}`}>
              <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1" opacity={grid.y === padding.t || grid.y === padding.t + innerH ? "1" : "0.5"} />
              <text x={padding.l - 6} y={grid.y + 3} textAnchor="end" fontSize="10" fill="var(--soc-text-muted)" fontWeight="600">{grid.value}</text>
            </g>
          ))}
          <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />
          <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />
          {segments.map((seg) => (<path key={seg.key} d={seg.d} stroke={seg.color} strokeWidth="2.5" fill="none" opacity="0.85" />))}
          {points.map((p) => {
            const isSel = selected?.index === p.index;
            const isActive = activeLabel != null && String(p.label) === String(activeLabel);
            return (
              <g key={`${p.label}-${p.index}`}>
                <circle cx={p.x} cy={p.y} r={isSel ? "6" : "9"} fill="transparent" className="cursor-pointer" onMouseEnter={() => setSelected(p)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(p)} onBlur={() => setSelected(null)} onClick={() => { setSelected(p); if (onPointClick) onPointClick(p); }} />
                <circle cx={p.x} cy={p.y} r={isSel || isActive ? "5" : "3.5"} fill={p.color} stroke={isActive ? "#0f172a" : "var(--soc-bg)"} strokeWidth={isActive ? "2" : "1.5"} opacity="0.95" className="pointer-events-none" />
                <text x={p.x} y={padding.t + innerH + 18} textAnchor="middle" fontSize="9" fill={isActive ? "var(--soc-text-primary)" : "var(--soc-text-muted)"} fontWeight={isActive ? "700" : "400"}>{p.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 justify-center px-1 mt-1">
        {points.map((p) => (
          <div key={`${p.label}-${p.index}`} className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="whitespace-nowrap" title={p.label}>{p.label}</span>
            <span className="text-slate-500 font-mono text-[10px]">{p.value}</span>
          </div>
        ))}
      </div>
      {selected && (
        <div className="pointer-events-none absolute z-10 min-w-[110px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-xl" style={{ left: `${Math.min(Math.max((selected.x / width) * 100, 10), 84)}%`, top: `${Math.max(((selected.y - 46) / height) * 100, 2)}%`, transform: "translate(-50%, -100%)" }}>
          <div className="font-semibold text-[var(--soc-text-primary)]">{selected.label}</div>
          <div className="mt-1 text-[var(--soc-text-muted)]">{selected.value} {totalLabel}</div>
        </div>
      )}
    </div>
  );
};

const WaveChart = ({ data, color = "#a78bfa", rangeKey = "24h", height = 220, compact = false, activePointKey = null, onPointSelect = null }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const rootRef = useRef(null);
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
  height = size.height;
  if (!width || !height) return <div ref={rootRef} className="relative h-full w-full" />;
  if (!data || data.length === 0) {
    return (
      <div ref={rootRef} className="relative h-full w-full">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
          <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="12" fill="#64748b">No data</text>
        </svg>
      </div>
    );
  }
  const maxV = Math.max(1, ...data.map((d) => d.v));
  // Left gutter adapts to the measured width of the y-axis labels
  // (same 10px/500-weight font as rendered), so any digit count fits.
  const gridSteps = 5;
  const gridVals = [];
  for (let i = 0; i < gridSteps; i += 1) gridVals.push(Math.round((i / (gridSteps - 1)) * maxV));
  const measureLabelWidth = (() => {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = canvas ? canvas.getContext("2d") : null;
    return (text) => {
      if (!ctx) return String(text).length * 6;
      ctx.font = "500 10px sans-serif";
      return Math.ceil(ctx.measureText(String(text)).width);
    };
  })();
  const maxLabelW = Math.max(...gridVals.map(measureLabelWidth), 0);
  const padding = { l: Math.max(28, maxLabelW + 12), r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const defaultBucketMs = getTimelineBucketMs(RANGE_TO_MINUTES[rangeKey] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE]);
  const isDense = data.length > 30;
  const denseVisualR = isDense ? 2.6 : 3.5;
  const denseHitR = isDense ? 5 : 10;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i += 1) gridLines.push({ value: gridVals[i], y: padding.t + innerH - (i / (gridSteps - 1)) * innerH, ratio: i / (gridSteps - 1) });
  let pathD = "";
  for (let i = 0; i < data.length; i += 1) {
    const x = padding.l + i * pointSpacing;
    const y = padding.t + innerH - (data[i].v / maxV) * innerH;
    if (i === 0) pathD += `M ${x} ${y}`;
    else {
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
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        {gridLines.map((grid) => (
          <g key={`grid-${grid.ratio}`}>
            <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeDasharray="2,2" opacity="0.5" />
            <text x={padding.l - 5} y={grid.y + 3} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="500">{grid.value}</text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--soc-border)" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--soc-border)" />
        <path d={pathD} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <defs><linearGradient id="waveGradientMl" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor={color} stopOpacity="0.24" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill="url(#waveGradientMl)" />
        {data.map((d, i) => {
          const x = padding.l + i * pointSpacing;
          const y = padding.t + innerH - (d.v / maxV) * innerH;
          const pointKey = String(d.key ?? d.t);
          const bucketMsForPoint = d.bucketMs || defaultBucketMs;
          const pointData = { index: i, x, y, key: pointKey, value: d.v, time: d.t, start: new Date(Number(d.t)).toISOString(), end: new Date(Number(d.t) + bucketMsForPoint - 1).toISOString(), bucketMs: bucketMsForPoint };
          const isHovered = selectedPoint?.index === i;
          const isActive = activePointKey !== null && typeof activePointKey !== "undefined" ? String(activePointKey) === pointKey : false;
          const isHighlighted = isHovered || isActive;
          const visualR = `${denseVisualR}`;
          const hitR = isHighlighted || isHovered ? (isDense ? "7" : "10") : `${denseHitR}`;
          return (
            <g key={`point-${pointKey}`}>
              <circle cx={x} cy={y} r={hitR} fill="transparent" className="cursor-pointer focus:outline-none" style={{ outline: "none" }} role="button" tabIndex={0} aria-label={`Filter predictions for ${formatDetailedTimestamp(pointData.start)}`} onClick={() => onPointSelect?.(pointData)} onMouseEnter={() => setSelectedPoint(pointData)} onMouseLeave={() => setSelectedPoint(null)} onFocus={() => setSelectedPoint(pointData)} onBlur={() => setSelectedPoint(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPointSelect?.(pointData); } }} />
              <circle cx={x} cy={y} r={visualR} fill={isActive ? "#a78bfa" : color} stroke={isActive ? "#0f172a" : "none"} strokeWidth="2.5" opacity="0.95" className="pointer-events-none" />
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % tickEvery !== 0) return null;
          const x = padding.l + i * pointSpacing;
          return (<g key={`tick-${d.t}`}><line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="var(--soc-border)" /><text x={x} y={padding.t + innerH + 14} textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"} fontSize="10" fill="#64748b" fontWeight="500">{formatBucketLabel(d.t, rangeKey)}</text></g>);
        })}
      </svg>
      {selectedPoint && (
        <div className="pointer-events-none absolute z-10 min-w-[120px] max-w-[220px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-lg" style={{ left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`, top: `${Math.max(((selectedPoint.y - 40) / height) * 100, 6)}%`, transform: "translate(-50%, -100%)" }}>
          <div className="font-semibold text-[var(--soc-text-primary)]">{selectedPoint.value} predictions</div>
          <div className="mt-1 text-[var(--soc-text-secondary)]">{formatDetailedTimestamp(selectedPoint.start || selectedPoint.time)}</div>
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
  const pct = Math.round(Math.min(Math.max(raw > 1 ? raw : raw * 100, 0), 100));
  const lowerLabel = String(label || '').toLowerCase();
  const isBenign = lowerLabel.includes('benign') || lowerLabel.includes('normal');
  let bg = 'bg-slate-800/60'; let text = 'text-slate-400'; let border = 'border-slate-700/50';
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
  return (<span className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded border font-semibold inline-block ${bg} ${text} ${border}`} title={isBenign ? `Model ${pct}% yakin ini benign` : `Model ${pct}% yakin ini ancaman`}>{pct}%</span>);
};
const PredictionBadge = ({ label }) => {
  const isBenign = String(label).toLowerCase().includes('benign');
  return (<span className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${isBenign ? 'bg-green-900/30 text-green-400 border-green-700/50' : 'bg-red-900/30 text-red-400 border-red-700/50'}`}>{label || 'unknown'}</span>);
};

export default function MlDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const urlAgent = searchParams.get("agent");
  const urlFocus = searchParams.get("focus");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataNotice, setDataNotice] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [totalPredictionsCount, setTotalPredictionsCount] = useState(0);
  const [filters, setFilters] = useState({ label: 'all', agent: urlAgent || 'all', sourceIp: 'all', destinationIp: 'all', service: 'all', confidenceRange: 'all' });
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState(() => urlRange && ["1h", "24h", "7d", "30d"].includes(urlRange) ? urlRange : DEFAULT_TIME_RANGE);
  const [filterMode, setFilterMode] = useState(() => (urlStart && urlEnd ? "custom" : "range"));
  const [customDateRange, setCustomDateRange] = useState(() => {
    const base = createDefaultDateRange(1);
    if (urlStart && urlEnd) return { start: toDateTimeLocalValue(new Date(urlStart)), end: toDateTimeLocalValue(new Date(urlEnd)) };
    return base;
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(null);
  const [ipTab, setIpTab] = useState("source");
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  const predictionsTableRef = useRef(null);
  const topAgentsPanelRef = useRef(null);
  const isMobile = viewportWidth < 768;

  const scrollPredictionsTableIntoView = useCallback(() => {
    if (predictionsTableRef.current?.scrollIntoView) {
      try { predictionsTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!urlAgent && urlFocus !== "logs") return undefined;
    const id = setTimeout(scrollPredictionsTableIntoView, 300);
    return () => clearTimeout(id);
  }, [urlAgent, urlFocus, loading, scrollPredictionsTableIntoView]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDataNotice('');
    try {
      let minutes = RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE];
      let start; let end;
      if (filterMode === "custom") {
        const iso = getIsoDateRange(normalizeDateRange(customDateRange));
        start = iso.start; end = iso.end; minutes = getDateRangeMinutes(iso);
      } else {
        const range = getRangeWindow(timeRange);
        start = range.start; end = range.end;
      }
      const [predictionsResult, timelineResult] = await Promise.allSettled([
        mlApi.getPredictions({ start, end, page: 1, limit: PREDICTIONS_FETCH_BATCH_SIZE }),
        mlApi.getTimeline(minutes, { start, end }),
      ]);
      const notices = [];
      let preds = predictionsResult.status === 'fulfilled' && Array.isArray(predictionsResult.value?.data) ? predictionsResult.value.data : [];
      let responseTotalPredictions = predictionsResult.status === 'fulfilled' ? Number(predictionsResult.value?.pagination?.total ?? preds.length) : 0;
      if (predictionsResult.status !== 'fulfilled') {
        notices.push('Predictions list failed to load from the primary endpoint.');
      } else {
        const firstPagePagination = predictionsResult.value?.pagination || {};
        const totalPages = Math.max(Number(firstPagePagination.totalPages || Math.ceil(responseTotalPredictions / PREDICTIONS_FETCH_BATCH_SIZE) || 1), 1);
        if (totalPages > 1) {
          const remainingPageResults = await Promise.allSettled(Array.from({ length: totalPages - 1 }, (_, index) => mlApi.getPredictions({ start, end, page: index + 2, limit: PREDICTIONS_FETCH_BATCH_SIZE })));
          const failedPages = [];
          for (let i = 0; i < remainingPageResults.length; i += 1) {
            const result = remainingPageResults[i];
            const pageNumber = i + 2;
            if (result.status === 'fulfilled' && Array.isArray(result.value?.data)) preds = preds.concat(result.value.data);
            else failedPages.push(pageNumber);
          }
          if (failedPages.length > 0) {
            responseTotalPredictions = preds.length;
            notices.push(`Some predictions data failed to load on page ${failedPages.join(', ')}.`);
          }
        }
      }
      let nextTimeline = [];
      if (timelineResult.status === 'fulfilled' && Array.isArray(timelineResult.value?.data) && timelineResult.value.data.length) {
        nextTimeline = timelineResult.value.data;
      } else {
        nextTimeline = buildTimelineFromPredictions(preds, minutes, start, end);
        if (nextTimeline.length > 0 && preds.length > 0) {
          if (timelineResult.status === 'fulfilled') notices.push('Timeline built from real prediction data because the timeline endpoint did not return buckets.');
          else notices.push('Timeline built from real prediction data because the timeline endpoint failed.');
        }
      }
      if (predictionsResult.status === 'fulfilled' || timelineResult.status === 'fulfilled') {
        setPredictions(Array.isArray(preds) ? preds : []);
        setTotalPredictionsCount(responseTotalPredictions);
        setTimeline(nextTimeline);
        setLastUpdated(new Date().toISOString());
        if (!preds.length && !nextTimeline.length) notices.push('No ML data exists for the selected range.');
        setDataNotice(notices.join(' '));
        return;
      }
      setPredictions([]); setTotalPredictionsCount(0); setTimeline([]); setError(new Error('Real ML data is not available.')); setDataNotice('Real ML data is not available. Check the connection to the backend.');
    } catch (err) {
      console.error('ML API error:', err);
      setPredictions([]); setTotalPredictionsCount(0); setTimeline([]); setError(err); setDataNotice(`An error occurred while loading ML data: ${err?.message || 'unknown error'}`);
    } finally { setLoading(false); }
  }, [timeRange, filterMode, customDateRange]);

  useEffect(() => {
    const run = () => { void loadAll(); };
    const timer = setTimeout(run, 0);
    const interval = setInterval(run, 60_000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [loadAll]);

  const uniqueOptions = useMemo(() => {
    const agents = new Set(); const labels = new Set(); const srcs = new Set(); const dests = new Set(); const services = new Set();
    for (const p of predictions) {
      if (p.agent) agents.add(p.agent);
      if (p.predictedLabel) labels.add(p.predictedLabel);
      if (p.sourceIp) srcs.add(p.sourceIp);
      if (p.destinationIp) dests.add(p.destinationIp);
      if (p.service) services.add(p.service);
    }
    return { agents: Array.from(agents).sort(), labels: Array.from(labels).sort(), srcs: Array.from(srcs).sort(), dests: Array.from(dests).sort(), services: Array.from(services).sort() };
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
  const activePage = page > totalPages ? 1 : page;
  const pageItems = useMemo(() => {
    const start = (activePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, activePage, pageSize]);

  const handleExportCsv = async () => {
    const rows = predictions.map((p) => {
      const conf = getConfidenceScore(p);
      return [formatTime(p.timestamp), p.agent || "-", p.predictedLabel || "-", p.sourceIp || "-", p.destinationIp || "-", p.service || "-", conf == null ? "-" : `${conf}%`];
    });
    exportCsv({ filename: `ml-predictions-${new Date().toISOString().slice(0, 10)}.csv`, header: ["Timestamp", "Agent", "Label", "Source IP", "Destination IP", "Service", "Confidence (%)"], rows });
  };

  const distribution = useMemo(() => {
    const map = new Map();
    for (const p of predictions) { const key = p.predictedLabel || 'unknown'; map.set(key, (map.get(key) || 0) + 1); }
    return Array.from(map.entries()).map(([name, value]) => ({ name, label: name, value })).sort((a, b) => b.value - a.value).map((entry, i) => ({ ...entry, color: LABEL_RANK_COLORS[i % LABEL_RANK_COLORS.length] }));
  }, [predictions]);

  const avgConfidence = useMemo(() => {
    let total = 0; let count = 0;
    for (const p of filtered) {
      const c = typeof p.confidence === 'number' ? p.confidence : parseFloat(p.confidence);
      if (!Number.isNaN(c)) { total += c; count += 1; }
    }
    return count ? (total / count) * 100 : 0;
  }, [filtered]);

  const uniqueSourceIpCount = useMemo(() => { const set = new Set(); for (const p of filtered) set.add(p.sourceIp || "unknown"); return set.size; }, [filtered]);
  const uniqueDestIpCount = useMemo(() => { const set = new Set(); for (const p of filtered) set.add(p.destinationIp || "unknown"); return set.size; }, [filtered]);

  const topSourceIps = useMemo(() => {
    const map = new Map();
    for (const p of predictions) { const ip = p.sourceIp || 'unknown'; const existing = map.get(ip) || { label: ip, count: 0, lastSeen: 0 }; existing.count += 1; existing.lastSeen = Math.max(existing.lastSeen, getTimestampMs(p.timestamp) || 0); map.set(ip, existing); }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [predictions]);

  const topDestIps = useMemo(() => {
    const map = new Map();
    for (const p of predictions) { const ip = p.destinationIp || 'unknown'; const existing = map.get(ip) || { label: ip, count: 0, lastSeen: 0 }; existing.count += 1; existing.lastSeen = Math.max(existing.lastSeen, getTimestampMs(p.timestamp) || 0); map.set(ip, existing); }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [predictions]);

  const topAgents = useMemo(() => {
    const map = new Map();
    for (const p of predictions) { const name = String(p.agent || 'unknown'); const existing = map.get(name) || { name, count: 0, lastSeen: 0 }; existing.count += 1; existing.lastSeen = Math.max(existing.lastSeen, getTimestampMs(p.timestamp) || 0); map.set(name, existing); }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [predictions]);

  const uniqueAgents = useMemo(() => { const set = new Set(); for (const p of predictions) set.add(String(p.agent || 'unknown')); return set.size; }, [predictions]);

  const waveData = useMemo(() => {
    const minutes = filterMode === "custom" ? getDateRangeMinutes(getIsoDateRange(normalizeDateRange(customDateRange))) : (RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE]);
    const range = filterMode === "custom" ? getIsoDateRange(normalizeDateRange(customDateRange)) : getRangeWindow(timeRange);
    const bucketMs = getTimelineBucketMs(minutes);
    const buildEmptySeries = () => buildTimelineFromPredictions([], minutes, range.start, range.end).map((point) => createTimelineBucketPoint(getTimestampMs(point.timestamp), 0, point.bucketMs)).filter(Boolean);
    if (!timeline || timeline.length === 0) return buildEmptySeries();
    const map = new Map();
    for (const t of timeline) {
      if (!t) continue;
      const ts = getTimestampMs(t.timestamp || t.ts || t.start || t.time);
      if (!Number.isFinite(ts)) continue;
      const bucketStartMs = Math.floor(ts / bucketMs) * bucketMs;
      const count = Number(t.total ?? t.count ?? t.v ?? 0);
      map.set(bucketStartMs, (map.get(bucketStartMs) || 0) + (Number.isFinite(count) ? count : 0));
    }
    const result = Array.from(map.entries()).sort(([a], [b]) => a - b).map(([bucketStartMs, count]) => createTimelineBucketPoint(bucketStartMs, count, bucketMs)).filter(Boolean);
    if (result.length === 0) return buildEmptySeries();
    const firstBucketMs = result[0].t;
    const lastBucketEndMs = result[result.length - 1].t + bucketMs - 1;
    const rangeStartMs = range.start ? getTimestampMs(range.start) : firstBucketMs;
    const rangeEndMs = range.end ? getTimestampMs(range.end) : lastBucketEndMs;
    if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs) || rangeEndMs < rangeStartMs) return result;
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

  const handleTimelinePointSelect = useCallback((pointData) => {
    if (!pointData) return;
    const pointKey = String(pointData.key ?? pointData.t ?? pointData.start ?? pointData.time);
    const bucketMs = pointData.bucketMs || getTimelineBucketMs(RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE]);
    const startIso = pointData.start || new Date(Number(pointData.t)).toISOString();
    const endIso = pointData.end || new Date(Number(pointData.t) + bucketMs - 1).toISOString();
    setPage(1);
    if (selectedTimelinePoint?.key === pointKey) setSelectedTimelinePoint(null);
    else {
      setSelectedTimelinePoint({ key: pointKey, start: startIso, end: endIso, bucketMs, time: pointData.t, t: pointData.t });
      scrollPredictionsTableIntoView();
    }
  }, [timeRange, selectedTimelinePoint, scrollPredictionsTableIntoView]);

  const handleLabelSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const next = filters.label === value ? "all" : value;
    setFilters((s) => ({ ...s, label: next }));
    setPage(1);
    if (next !== "all") scrollPredictionsTableIntoView();
  }, [filters.label, scrollPredictionsTableIntoView]);

  const handleMLAgentSummaryClick = useCallback((item) => {
    const value = String(item?.name || "all");
    const next = filters.agent === value ? "all" : value;
    setFilters((s) => ({ ...s, agent: next }));
    setPage(1);
    if (next !== "all") scrollPredictionsTableIntoView();
  }, [filters.agent, scrollPredictionsTableIntoView]);

  const handleIPSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const isSource = ipTab === "source";
    const current = isSource ? filters.sourceIp : filters.destinationIp;
    const next = current === value ? "all" : value;
    setFilters((s) => (isSource ? { ...s, sourceIp: next } : { ...s, destinationIp: next }));
    setPage(1);
    if (next !== "all") scrollPredictionsTableIntoView();
  }, [ipTab, filters.sourceIp, filters.destinationIp, scrollPredictionsTableIntoView]);

  const handleRangeChange = (nextRange) => { setPage(1); setSelectedTimelinePoint(null); setFilterMode("range"); setTimeRange(nextRange); };

  if (loading && predictions.length === 0 && !error) {
    return <PageLoader message="Loading..." fullScreen />;
  }

  if (error && predictions.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[11px] text-red-300">{error?.message || String(error)}</div>
      </div>
    );
  }

  // Top Source/Dest as BarList items
  const topSourceBarItems = topSourceIps.map((ip, i) => ({ label: String(ip.label), value: Number(ip.count) || 0, color: TOP_SOURCE_IPS_COLORS[i % TOP_SOURCE_IPS_COLORS.length] }));
  const topDestBarItems = topDestIps.map((ip, i) => ({ label: String(ip.label), value: Number(ip.count) || 0, color: TOP_DEST_IPS_COLORS[i % TOP_DEST_IPS_COLORS.length] }));

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      {/* Header — ML Predictions (tanpa icon, sejajar File Security / FimEvents) */}
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">ML Predictions</h1>
          <p className="text-[11px] text-[var(--soc-text-muted)] mt-0.5">Real-time machine learning traffic prediction and threat classification</p>
        </div>
        <div className="flex items-center gap-2">
          <RangeFilter
            rangeKey={timeRange}
            onRangeChange={(nextRange) => {
              if (timeRange !== nextRange) { setPage(1); setSelectedTimelinePoint(null); setTimeRange(nextRange); setFilterMode("range"); }
            }}
          />
          <DateRangeFilter
            value={customDateRange}
            onChange={(range) => { setPage(1); setSelectedTimelinePoint(null); setCustomDateRange(range); setFilterMode("custom"); }}
          />
          <div className="relative flex items-center bg-[var(--soc-card)] rounded-lg border border-[var(--soc-border)]">
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
                setTimeout(() => { if (predictionsTableRef.current && typeof predictionsTableRef.current.scrollIntoView === "function") { try { predictionsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {} } }, 100);
              }}
              className="appearance-none bg-transparent py-2 pl-2.5 pr-5 text-[11px] font-medium leading-tight text-[var(--soc-text-primary)] focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (<option key={size} value={size} className="bg-[var(--soc-card)] text-[var(--soc-text-primary)]">{size}</option>))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--soc-text-muted)]" />
          </div>
        </div>
      </div>

      {error && predictions.length > 0 && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-2 text-[11px] text-red-300">Failed to load ML data: {error?.message || String(error)}<button onClick={() => loadAll()} className="ml-3 underline hover:text-red-200">Retry</button></div>
      )}
      {dataNotice && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 md:px-3 py-2 text-[10px] md:text-[11px] text-sky-100">{dataNotice}</div>
      )}

      {/* KPI Cards — kpi-modern 4 kolom */}
      <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-3">
        <KPICard label="Total Predictions" value={new Intl.NumberFormat("en-US").format(totalPredictionsCount || predictions.length)} icon={BrainCircuit} color="text-purple-400" desc="predictions in range" loading={loading} index={0} />
        <KPICard label="Unique Source IPs" value={new Intl.NumberFormat("en-US").format(uniqueSourceIpCount)} icon={Globe} color="text-pink-400" desc="source IPs in range" loading={loading} index={1} />
        <KPICard label="Avg Confidence" value={`${avgConfidence.toFixed(0)}%`} icon={Activity} color="text-cyan-400" desc="overall model confidence" loading={loading} index={2} />
        <KPICard label="Unique Agents" value={new Intl.NumberFormat("en-US").format(uniqueAgents)} icon={Users} color="text-emerald-400" desc="agents in range" loading={loading} index={3} />
      </div>

      {/* Timeline + Top Agents — xl:grid-cols-3 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 chart-card animate-fadeInUp stagger-1 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10"><BarChart3 className="h-3.5 w-3.5 text-violet-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">ML Predictions Timeline</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Predictions over time. Click a point to filter.</p>
              </div>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[9px] text-[var(--soc-text-muted)]">Last {timeRange}</div>
              <div className="text-[10px] font-semibold text-[var(--soc-text-muted)]">Updated {formatLiveTimestamp(lastUpdated)}</div>
            </div>
          </div>
          <div className="h-[220px]" style={{ background: "transparent" }}>
            <WaveChart data={waveData} color="#a78bfa" rangeKey={timeRange} height={220} compact={isMobile} activePointKey={selectedTimelinePoint?.key ?? null} onPointSelect={handleTimelinePointSelect} />
          </div>
        </div>
        <div ref={topAgentsPanelRef} className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10"><Users className="h-3.5 w-3.5 text-purple-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Agents</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Most active agents from ML predictions</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[9px] text-[var(--soc-text-muted)]">Unique agents</span>
            <span className="text-[11px] font-bold text-[var(--soc-text-primary)]">{uniqueAgents}</span>
          </div>
          <TopAgentsCard agents={topAgents} onItemClick={handleMLAgentSummaryClick} activeName={filters.agent !== "all" ? filters.agent : null} />
        </div>
      </div>

      {/* Label Distribution + Top IPs (Source/Destination tabs) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="chart-card animate-fadeInUp stagger-1 flex flex-col xl:col-span-2" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10"><LineChart className="h-3.5 w-3.5 text-violet-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Label Distribution</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Distribution of prediction labels</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-[var(--soc-text-primary)]">{filtered.length} predictions</span>
          </div>
          <div className="flex-1 min-h-[160px] flex flex-col">
            <CategoryLineChart items={distribution} totalLabel="predictions" onPointClick={handleLabelSummaryClick} activeLabel={filters.label && filters.label !== "all" ? filters.label : null} />
          </div>
        </div>
        <div className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10"><Globe className={`h-3.5 w-3.5 ${ipTab === "source" ? "text-emerald-400" : "text-sky-400"}`} /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 IPs</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Most frequent source / destination IPs</p>
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
            activeValue={(ipTab === "source" ? filters.sourceIp : filters.destinationIp) !== "all" ? (ipTab === "source" ? filters.sourceIp : filters.destinationIp) : null}
          />
        </div>
      </div>

      {/* Logs Table — search/filter disamakan dengan FileSecurityScanner / FimEvents */}
      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg h-auto overflow-hidden">
        <div ref={predictionsTableRef} className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
          <div className="flex gap-2 flex-wrap attack-logs-search soc-filter-row items-center">
            <div className="flex-1 min-w-0 basis-full sm:basis-0 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input type="text" value={searchQuery} onChange={(e) => { setPage(1); setSearchQuery(e.target.value); }} placeholder="Search by source IP, destination IP, service, or agent..." className="w-full pl-10 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500" />
            </div>
            <MlCombinedFilter
              labelFilter={filters.label} onLabelChange={(v) => { setPage(1); setFilters((s) => ({ ...s, label: v })); }} labelOptions={uniqueOptions.labels}
              agentFilter={filters.agent} onAgentChange={(v) => { setPage(1); setFilters((s) => ({ ...s, agent: v })); }} agentOptions={uniqueOptions.agents}
              sourceIpFilter={filters.sourceIp} onSourceIpChange={(v) => { setPage(1); setFilters((s) => ({ ...s, sourceIp: v })); }} sourceIpOptions={uniqueOptions.srcs}
              destIpFilter={filters.destinationIp} onDestIpChange={(v) => { setPage(1); setFilters((s) => ({ ...s, destinationIp: v })); }} destIpOptions={uniqueOptions.dests}
              serviceFilter={filters.service} onServiceChange={(v) => { setPage(1); setFilters((s) => ({ ...s, service: v })); }} serviceOptions={uniqueOptions.services}
              dateFilterLabel={urlStart && urlEnd ? `${formatDetailedTimestamp(urlStart)} - ${formatDetailedTimestamp(urlEnd)}` : ""}
              onResetDateFilter={() => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.delete("start");
                nextParams.delete("end");
                setSearchParams(nextParams);
                setSelectedTimelinePoint(null);
                setFilterMode("range");
                setTimeRange(DEFAULT_TIME_RANGE);
                setCustomDateRange(createDefaultDateRange(1));
              }}
              timelineFilterLabel={selectedTimelinePoint ? formatTimelineBucketLabel(selectedTimelinePoint, timeRange) : ""}
              onClearTimelineFilter={() => { setSelectedTimelinePoint(null); setPage(1); }}
            />
            <ExportCsvButton accent="violet" onClick={handleExportCsv} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[10px] md:text-[11px] text-left">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/70">
                {["time", "agent", "label", "source ip", "destination ip", "service", "confidence"].map((h) => (
                  <th key={h} className="px-2 md:px-4 lg:px-3 py-2 md:py-3 lg:py-2 text-[9px] md:text-[11px] lg:text-[10px] font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">Loading predictions...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <p className="text-[10px] font-semibold text-[var(--soc-text-secondary)]">No predictions match current filters</p>
                    <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">Try adjusting the selected filters or time range.</p>
                  </td>
                </tr>
              ) : pageItems.map((p, idx) => (
                <tr key={p.id || p.zeekUid || idx} className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${idx % 2 !== 0 ? 'bg-slate-900/60' : ''}`}>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-slate-500 text-[10px] md:text-[11px] lg:text-[10px] whitespace-nowrap" title={formatTimeFull(p.timestamp)}>{formatTime(p.timestamp)}</td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-sky-400 font-medium text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={p.agent || "-"}>{p.agent || '-'}</div></td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 whitespace-nowrap"><PredictionBadge label={p.predictedLabel} /></td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-emerald-400 font-mono text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={p.sourceIp || "-"}>{p.sourceIp || '-'}</div></td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-violet-400 font-mono text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={p.destinationIp || "-"}>{p.destinationIp || '-'}</div></td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-slate-300 text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={p.service || "-"}>{p.service || '-'}</div></td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 whitespace-nowrap"><ConfidenceBadge score={p.confidence} label={p.predictedLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-slate-800 bg-slate-900/50 px-2 md:px-4 py-3">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0">
              <div className="text-[10px] md:text-[11px] font-mono text-slate-500">
                <span className="hidden md:inline">SHOWING </span>
                <span className="font-bold text-sky-400">{filtered.length === 0 ? 0 : (activePage - 1) * pageSize + 1}</span>
                <span className="hidden md:inline"> - </span><span className="md:hidden">-</span>
                <span className="font-bold text-sky-400">{Math.min(activePage * pageSize, filtered.length)}</span>
                <span className="hidden md:inline"> OF </span><span className="md:hidden"> / </span>
                <span className="font-bold text-sky-400">{filtered.length}</span>
                <span className="hidden md:inline"> PREDICTIONS</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={activePage === 1 || loading} onClick={() => { setPage(1); scrollPredictionsTableIntoView(); }} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">FIRST</button>
                <button disabled={activePage === 1 || loading} onClick={() => { setPage(Math.max(1, activePage - 1)); scrollPredictionsTableIntoView(); }} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">PREV</button>
                <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400"><span className="hidden md:inline">PAGE </span><span className="text-white">{activePage}</span> / {totalPages}</span>
                <button disabled={activePage >= totalPages || loading} onClick={() => { setPage(Math.min(totalPages, activePage + 1)); scrollPredictionsTableIntoView(); }} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">NEXT</button>
                <button disabled={activePage >= totalPages || loading} onClick={() => { setPage(totalPages); scrollPredictionsTableIntoView(); }} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">LAST</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
