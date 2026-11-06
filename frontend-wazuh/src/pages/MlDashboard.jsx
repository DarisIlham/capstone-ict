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
import { useIpGeo } from "../hooks/useIpGeo";
import undipLogo from "../assets/Undip.svg";

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
const SEARCH_DEBOUNCE_MS = 350;
const DEFAULT_TIME_RANGE = '24h';
const RANGE_TO_MINUTES = { '1h': 60, '24h': 1440, '7d': 10080, '30d': 43200 };

const ensureSelectedOption = (options, selected) => {
  if (!selected || selected === "all") return options;
  if (options.some((option) => String(option.value) === String(selected))) return options;
  return [{ value: selected, label: selected }, ...options];
};

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
// Label rentang pendek untuk header grafik ("Oct 01 – Oct 08").
const formatShortRange = (start, end) => {
  const s = getValidDate(start);
  const e = getValidDate(end);
  if (!s || !e) return 'custom';
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  return `${fmt(s)} – ${fmt(e)}`;
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
  if (minutes <= 129600) return 24 * 60 * 60 * 1000;
  if (minutes <= 525600) return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
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
  <div className={`ml-kpi-card kpi-modern p-2.5 min-[400px]:p-4 animate-fadeInUp stagger-${index + 1}`} style={{ opacity: 0 }}>
    <div className="flex items-center justify-between mb-2 min-[400px]:mb-3">
      <span className="ml-kpi-label text-[8px] min-[400px]:text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">{label}</span>
      <div className={`p-1.5 min-[400px]:p-2 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`h-3.5 w-3.5 min-[400px]:h-4 min-[400px]:w-4 ${color}`} />
      </div>
    </div>
    <div className={`ml-kpi-value text-lg min-[400px]:text-xl font-bold ${color} mb-1`}>
      {loading ? <div className="skeleton h-5 min-[400px]:h-6 w-14 min-[400px]:w-16"></div> : value}
    </div>
    {desc && <div className="ml-kpi-description text-[8px] min-[400px]:text-[9px] text-[var(--soc-text-muted)]">{desc}</div>}
  </div>
);

// ── BarList (seperti FileSecurityScanner) ────────────────────────────────────
const BarList = ({ items, emptyLabel = "No data", onSelect = null, activeValue = null, listClassName = "" }) => {
  if (!items || items.length === 0) {
    return (
      <div className="top5-fixed w-full min-w-0 max-w-full flex items-center justify-center">
        <InlineEmptyState title={emptyLabel} />
      </div>
    );
  }
  const maxValue = Math.max(...items.map((d) => d.value), 1);
  const CHART_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
  return (
    <div className={`ml-bar-list top5-fixed w-full min-w-0 max-w-full space-y-1.5 ${listClassName}`}>
      {items.map((item, i) => {
        const color = item.color || CHART_COLORS[i % CHART_COLORS.length];
        const label = item.label;
        const value = item.value;
        const isActive = activeValue != null && String(label) === String(activeValue);
        const inner = (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="ml-bar-list-rank w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color }}>{i + 1}</span>
                <span className="ml-bar-list-label min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)] font-mono" title={label}>{label}</span>
              </div>
              <span className="ml-bar-list-value min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(value)}</span>
            </div>
            <div className="ml-bar-list-progress mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
              <div className="h-full rounded-full transition-all duration-500" title={`${label}: ${value}`} style={{ width: `${(value / maxValue) * 100}%`, backgroundColor: color }} />
            </div>
          </>
        );
        if (!onSelect) {
          return <div key={label} className="ml-bar-list-item w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg">{inner}</div>;
        }
        return (
          <button key={label} type="button" onClick={() => onSelect(item)} className={`ml-bar-list-item w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg text-left ${isActive ? "bg-violet-500/10 ring-1 ring-violet-500/30" : ""}`}>
            {inner}
          </button>
        );
      })}
    </div>
  );
};

const TopAgentsCard = ({ agents, onItemClick = null, activeName = null }) => {
  if (!agents || agents.length === 0) {
    return (
      <div className="top5-fixed w-full min-w-0 max-w-full flex items-center justify-center">
        <InlineEmptyState title="No agent data" description="No agent activity available." />
      </div>
    );
  }
  const maxCount = Math.max(...agents.map((a) => Number(a.count) || 0), 1);
  const CHART_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
  return (
    <div className={`ml-top-agents-list top5-fixed w-full min-w-0 max-w-full space-y-1.5${agents.length === 5 ? " ml-top-agents-list--full" : ""}`}>
      {agents.map((item, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const label = item.name || "Unknown agent";
        const value = Number(item.count) || 0;
        const isActive = activeName != null && String(label) === String(activeName);
        const inner = (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="ml-top-agent-rank w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color }}>{i + 1}</span>
                <span className="ml-top-agent-name min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)] font-mono" title={label}>{label}</span>
              </div>
              <span className="ml-top-agent-count min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(value)}</span>
            </div>
            <div className="ml-top-agent-progress mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(value / maxCount) * 100}%`, backgroundColor: color }} />
            </div>
          </>
        );
        if (!onItemClick) {
          return <div key={label} className="ml-top-agent-item w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg">{inner}</div>;
        }
        return (
          <button key={label} type="button" onClick={() => onItemClick(item)} className={`ml-top-agent-item w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg text-left ${isActive ? "bg-violet-500/10 ring-1 ring-violet-500/30" : ""}`}>
            {inner}
          </button>
        );
      })}
    </div>
  );
};

// ── ML Combined Filter (mirror FimCombinedFilter, accent violet) ─────────────
const MlCombinedFilter = ({ labelFilter, onLabelChange, labelOptions = [], agentFilter, onAgentChange, agentOptions = [], sourceIpFilter, onSourceIpChange, sourceIpOptions = [], destIpFilter, onDestIpChange, destIpOptions = [], serviceFilter, onServiceChange, serviceOptions = [], confidenceRangeFilter, onConfidenceRangeChange, dateFilterLabel = "", onResetDateFilter, timelineFilterLabel = "", onClearTimelineFilter }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const calcPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = window.innerWidth < 640 ? 210 : 280;
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
  const activeCount = [labelFilter !== "all", agentFilter !== "all", sourceIpFilter !== "all", destIpFilter !== "all", serviceFilter !== "all", confidenceRangeFilter !== "all", Boolean(dateFilterLabel), Boolean(timelineFilterLabel)].filter(Boolean).length;
  const Section = ({ label, value, allLabel, options, onChange }) => (
    <div className="ml-filter-section px-2.5 py-1.5 min-[400px]:px-3 min-[400px]:py-2">
      <div className="ml-filter-section-title text-[8px] min-[400px]:text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => onChange("all")} className={`ml-filter-option px-1.5 min-[400px]:px-2 py-0.5 min-[400px]:py-1 rounded text-[9px] min-[400px]:text-[10px] font-medium transition-colors ${value === "all" ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{allLabel}</button>
        {options.map((opt) => {
          const { value: optVal, label: optLabel } = normalizeOption(opt);
          return <button key={optVal} onClick={() => onChange(optVal)} className={`ml-filter-option px-1.5 min-[400px]:px-2 py-0.5 min-[400px]:py-1 rounded text-[9px] min-[400px]:text-[10px] font-medium transition-colors ${value === optVal ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{optLabel}</button>;
        })}
      </div>
    </div>
  );
  return (
    <div ref={containerRef} className="ml-table-filter relative">
      <button ref={buttonRef} type="button" onClick={() => setOpen((c) => !c)}       className="ml-table-filter-button flex items-center gap-1.5 min-[400px]:gap-2 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-1.5 min-[400px]:py-2 pl-2.5 min-[400px]:pl-3 pr-2 min-[400px]:pr-2.5 text-[10px] min-[400px]:text-[11px] text-[var(--soc-text-primary)] focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors hover:bg-[var(--soc-elevated)]">
        <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--soc-text-muted)]" />
        <span className="font-medium">Filters</span>
        {activeCount > 0 && <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-violet-500/20 text-violet-300 text-[9px] font-bold">{activeCount}</span>}
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--soc-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="ml-filter-popup fixed z-[9999] w-[min(280px,calc(100vw-1rem))] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] shadow-2xl" style={{ top: coords.top, left: coords.left }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--soc-border)]">
            <span className="text-[10px] font-semibold text-[var(--soc-text-primary)]">Filter Options</span>
            {activeCount > 0 && <button onClick={() => { onLabelChange("all"); onAgentChange("all"); onSourceIpChange("all"); onDestIpChange("all"); onServiceChange("all"); onConfidenceRangeChange("all"); if (dateFilterLabel && onResetDateFilter) onResetDateFilter(); if (onClearTimelineFilter) onClearTimelineFilter(); }} className="text-[9px] font-semibold text-violet-400 hover:text-violet-300 transition-colors">Clear all</button>}
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
<Section label="Confidence" value={confidenceRangeFilter} allLabel="Any confidence" options={[{ value: "80-100", label: "≥ 80%" }, { value: "60-80", label: "60–80%" }, { value: "40-60", label: "40–60%" }, { value: "0-40", label: "< 40%" }]} onChange={onConfidenceRangeChange} />
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
  const narrow = size.width < 400;
  const basePadding = narrow
    ? { l: 38, r: 38, t: 8, b: 30 }
    : { l: 56, r: 56, t: 12, b: 42 };
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
  const padding = {
    ...basePadding,
    l: adaptiveLeftGutter(gridVals, basePadding.l, narrow ? 6 : 12, narrow ? "600 8px sans-serif" : "600 10px sans-serif"),
  };
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
    <div className="ml-category-line-chart relative w-full flex-1 min-h-0 flex flex-col" onMouseLeave={() => setSelected(null)}>
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[11px] text-slate-600 uppercase font-semibold">Total</span>
        <span className="text-sm font-bold text-slate-300">{total} <span className="text-xs font-normal text-slate-500">{totalLabel}</span></span>
      </div>
      <div ref={rootRef} className="ml-category-plot flex-1 min-h-0 w-full">
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
          {(() => {
            // Garis putus-putus seperti WaveChart, mengikuti warna titik yang
            // ditekan (activeLabel) — sinkron otomatis dengan filter/legend.
            const pinned = activeLabel != null ? points.find((p) => String(p.label) === String(activeLabel)) : null;
            if (!pinned) return null;
            return (
              <line x1={pinned.x} y1={padding.t} x2={pinned.x} y2={padding.t + innerH}
                stroke={pinned.color} strokeWidth="1.5" strokeDasharray="3,3" opacity="0.85" className="pointer-events-none" />
            );
          })()}
          {points.map((p) => {
            const isSel = selected?.index === p.index;
            const isActive = activeLabel != null && String(p.label) === String(activeLabel);
            return (
              <g key={`${p.label}-${p.index}`}>
                <circle cx={p.x} cy={p.y} r={isSel ? "6" : "9"} fill="transparent" className="cursor-pointer" onMouseEnter={() => setSelected(p)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(p)} onBlur={() => setSelected(null)} onClick={() => { setSelected(p); if (onPointClick) onPointClick(p); }} />
                <circle cx={p.x} cy={p.y} r={isSel || isActive ? "5" : "3.5"} fill={p.color} stroke="none" opacity="0.95" className="pointer-events-none" />
                <text x={p.x} y={padding.t + innerH + 18} textAnchor="middle" fontSize="9" fill={isActive ? "var(--soc-text-primary)" : "var(--soc-text-muted)"} fontWeight={isActive ? "700" : "400"}>{p.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="ml-category-legend flex flex-wrap items-center gap-x-2 gap-y-0.5 justify-center px-1 mt-1">
        {points.map((p) => {
          const isActive = activeLabel != null && String(p.label) === String(activeLabel);
          return (
            <button
              key={`${p.label}-${p.index}`}
              type="button"
              onMouseEnter={() => setSelected(p)}
              onMouseLeave={() => setSelected(null)}
              onFocus={() => setSelected(p)}
              onBlur={() => setSelected(null)}
              onClick={() => { setSelected(p); if (onPointClick) onPointClick(p); }}
              title={onPointClick ? `Filter table: ${p.label}` : p.label}
              className={`flex items-center gap-1 text-[10px] rounded px-1 py-0.5 transition-all ${isActive ? "font-bold text-slate-200 ring-1 ring-violet-500/40 bg-violet-500/10" : "text-slate-400 hover:text-slate-200"} ${onPointClick ? "cursor-pointer" : ""}`}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="whitespace-nowrap" title={p.label}>{p.label}</span>
              <span className="text-slate-500 font-mono text-[10px]">{p.value}</span>
            </button>
          );
        })}
      </div>
      {selected && (() => {
        const xPct = (selected.x / width) * 100;
        const flipBelow = selected.y < height * 0.32;
        const anchorX = xPct < 18 ? 6 : xPct > 82 ? 94 : xPct;
        const tx = xPct < 18 ? "-6%" : xPct > 82 ? "-94%" : "-50%";
        return (
          <div className="ml-category-tooltip pointer-events-none absolute z-10 min-w-[110px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-xl" style={{ left: `${anchorX}%`, top: flipBelow ? `${((selected.y + 18) / height) * 100}%` : `${Math.max(((selected.y - 46) / height) * 100, 2)}%`, transform: `translate(${tx}, ${flipBelow ? "0" : "-100%"})` }}>
            <div className="font-semibold text-[var(--soc-text-primary)]">{selected.label}</div>
            <div className="mt-1 text-[var(--soc-text-muted)]">{selected.value} {totalLabel}</div>
          </div>
        );
      })()}
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
    <div ref={rootRef} className="ml-timeline-chart relative h-full w-full" onMouseLeave={() => setSelectedPoint(null)}>
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
        {(() => {
          const ai = (activePointKey !== null && typeof activePointKey !== "undefined")
            ? data.findIndex((d) => String(d.key ?? d.t) === String(activePointKey))
            : -1;
          if (ai < 0) return null;
          return (
            <line x1={padding.l + ai * pointSpacing} y1={padding.t} x2={padding.l + ai * pointSpacing} y2={padding.t + innerH}
              stroke={color} strokeWidth="1.5" strokeDasharray="3,3" opacity="0.85" className="pointer-events-none" />
          );
        })()}
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
              <circle cx={x} cy={y} r={visualR} fill={isActive ? "#a78bfa" : color} stroke="none" opacity="0.95" className="pointer-events-none" />
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % tickEvery !== 0) return null;
          const x = padding.l + i * pointSpacing;
          return (<g key={`tick-${d.t}`}><line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="var(--soc-border)" /><text x={x} y={padding.t + innerH + 14} textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"} fontSize="10" fill="#64748b" fontWeight="500">{formatBucketLabel(d.t, rangeKey)}</text></g>);
        })}
      </svg>
      {selectedPoint && (() => {
        const xPct = (selectedPoint.x / width) * 100;
        const flipBelow = selectedPoint.y < height * 0.32;
        const anchorX = xPct < 18 ? 6 : xPct > 82 ? 94 : xPct;
        const tx = xPct < 18 ? "-6%" : xPct > 82 ? "-94%" : "-50%";
        return (
          <div className="ml-timeline-tooltip pointer-events-none absolute z-10 min-w-[120px] max-w-[220px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-lg" style={{ left: `${anchorX}%`, top: flipBelow ? `${((selectedPoint.y + 18) / height) * 100}%` : `${Math.max(((selectedPoint.y - 40) / height) * 100, 6)}%`, transform: `translate(${tx}, ${flipBelow ? "0" : "-100%"})` }}>
            <div className="font-semibold text-[var(--soc-text-primary)]">{selectedPoint.value} predictions</div>
            <div className="mt-1 text-[var(--soc-text-secondary)]">{formatDetailedTimestamp(selectedPoint.start || selectedPoint.time)}</div>
          </div>
        );
      })()}
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

// Bendera negara asal source IP — sama seperti halaman Bot Detection:
// IP privat menampilkan logo Undip.
const CountryFlag = ({ ip, entry }) => {
  const box = "inline-flex h-11 w-12 items-center justify-center align-middle";
  if (!ip) return <span className="text-slate-600 text-[10px]">-</span>;

  if (entry?.private) {
    return (
      <span className={box}>
        <img
          src={undipLogo}
          alt="UNDIP"
          title={`${ip} — jaringan internal UNDIP`}
          className="h-10 w-10 object-contain"
          loading="lazy"
        />
      </span>
    );
  }

  if (!entry || entry.pending) {
    return (
      <span
        className="inline-block w-3 h-3 rounded-full bg-slate-700 animate-pulse align-middle"
        title={`Mengambil negara untuk ${ip}...`}
      />
    );
  }

  if (entry.failed) {
    return (
      <span className="text-amber-500/80 text-[9px]" title={`Gagal mengambil negara untuk ${ip}`}>
        retry
      </span>
    );
  }

  if (!entry.code) {
    return (
      <span className="text-slate-600 text-[10px]" title={`${ip} — tidak ditemukan di database country.is`}>
        ?
      </span>
    );
  }

  return (
    <span className={box}>
      <img
        src={entry.flag}
        alt={entry.code || ip}
        title={`${entry.name || entry.code || ""} — ${ip}`}
        className="h-5 w-7 rounded-[2px] border border-slate-800/60 shadow-sm object-cover"
        loading="lazy"
        onError={(e) => {
          if (e.currentTarget.src !== "https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.3/flags/4x3/un.svg") {
            e.currentTarget.src = "https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.3/flags/4x3/un.svg";
          }
        }}
      />
    </span>
  );
};

export default function MlDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const urlAgent = searchParams.get("agent");
  const urlSourceIp = searchParams.get("sourceIp");
  const urlFocus = searchParams.get("focus");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataNotice, setDataNotice] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalPredictionsCount, setTotalPredictionsCount] = useState(0);
  const [filters, setFilters] = useState({ label: 'all', agent: urlAgent || 'all', sourceIp: urlSourceIp || 'all', destinationIp: 'all', service: 'all', confidenceRange: 'all' });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [timeRange, setTimeRange] = useState(() => urlRange && ["1h", "24h", "7d", "30d"].includes(urlRange) ? urlRange : DEFAULT_TIME_RANGE);
  const [filterMode, setFilterMode] = useState(() => (urlStart && urlEnd ? "custom" : "range"));
  const [customDateRange, setCustomDateRange] = useState(() => {
    const base = createDefaultDateRange(1);
    if (urlStart && urlEnd) return { start: toDateTimeLocalValue(new Date(urlStart)), end: toDateTimeLocalValue(new Date(urlEnd)) };
    return base;
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [serverTotal, setServerTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([null]);
  const pitIdRef = useRef(null);
  const requestIdRef = useRef(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(null);
  const [ipTab, setIpTab] = useState("source");
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  const predictionsTableRef = useRef(null);
  const topAgentsPanelRef = useRef(null);
  const topIpsCardRef = useRef(null);
  // Tinggi kartu Top 5 IPs (diukur langsung) agar kartu Label Distribution
  // bisa disamakan persis — CSS stretch saja ternyata tidak cukup rapat.
  const [topIpsH, setTopIpsH] = useState(0);
  const isMobile = viewportWidth < 768;

  const scrollPredictionsTableIntoView = useCallback(() => {
    if (predictionsTableRef.current?.scrollIntoView) {
      try { predictionsTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!urlAgent && !urlSourceIp && urlFocus !== "logs") return undefined;
    const id = setTimeout(scrollPredictionsTableIntoView, 300);
    return () => clearTimeout(id);
  }, [urlAgent, urlSourceIp, urlFocus, loading, scrollPredictionsTableIntoView]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Samakan tinggi kartu Label Distribution dengan Top 5 IPs (hanya di
  // layar lebar; di layar kecil kartu menumpuk dan tingginya otomatis).
  // Dijalankan ulang saat loading selesai karena saat loading halaman hanya
  // menampilkan PageLoader (kartu belum ada di DOM).
  useEffect(() => {
    const node = topIpsCardRef.current;
    if (!node || typeof window === "undefined" || typeof ResizeObserver === "undefined") return undefined;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setTopIpsH(mq.matches ? Math.round(node.getBoundingClientRect().height) : 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    const onMq = () => update();
    if (mq.addEventListener) mq.addEventListener("change", onMq);
    return () => {
      ro.disconnect();
      if (mq.removeEventListener) mq.removeEventListener("change", onMq);
    };
  }, [loading]);

  const getBaseRange = useCallback(() => {
    if (filterMode === "custom") {
      const iso = getIsoDateRange(normalizeDateRange(customDateRange));
      return { ...iso, minutes: getDateRangeMinutes(iso) };
    }
    const range = getRangeWindow(timeRange);
    return { ...range, minutes: RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE] };
  }, [filterMode, customDateRange, timeRange]);

  const getEffectiveRange = useCallback(() => {
    if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
      const start = selectedTimelinePoint.start;
      const end = selectedTimelinePoint.end;
      const minutes = Math.max(Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 60000), 1);
      return { start, end, minutes };
    }
    return getBaseRange();
  }, [selectedTimelinePoint, getBaseRange]);

  const filterParams = useMemo(() => ({
    label: filters.label !== "all" ? filters.label : undefined,
    agent: filters.agent !== "all" ? filters.agent : undefined,
    sourceIp: filters.sourceIp !== "all" ? filters.sourceIp : undefined,
    destinationIp: filters.destinationIp !== "all" ? filters.destinationIp : undefined,
    service: filters.service !== "all" ? filters.service : undefined,
    confidenceRange: filters.confidenceRange !== "all" ? filters.confidenceRange : undefined,
    q: debouncedSearch.trim() || undefined,
  }), [filters, debouncedSearch]);

  const loadAll = useCallback(async ({ cursor = null, pageNum = 1, retried = false } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setDataNotice('');
    try {
      const { start, end, minutes } = getEffectiveRange();
      const baseRange = getBaseRange();
      const predictionParams = {
        ...filterParams,
        start,
        end,
        limit: pageSize,
        page: pageNum,
        cursor: "1",
      };
      if (cursor) predictionParams.search_after = cursor;
      if (pitIdRef.current) predictionParams.pit_id = pitIdRef.current;

      const [predictionsResult, statsResult, timelineResult] = await Promise.allSettled([
        mlApi.getPredictions(predictionParams),
        mlApi.getStats({ ...filterParams, start, end }),
        mlApi.getTimeline(baseRange.minutes, {
          ...filterParams,
          start: baseRange.start,
          end: baseRange.end,
        }),
      ]);

      if (requestId !== requestIdRef.current) return;

      const notices = [];
      let preds = [];
      if (predictionsResult.status === "fulfilled") {
        const body = predictionsResult.value || {};
        preds = Array.isArray(body.data) ? body.data : [];
        const total = Number(body.pagination?.total ?? preds.length);
        setPredictions(preds);
        setServerTotal(total);
        setTotalPredictionsCount(total);
        setNextCursor(body.next_search_after || null);
        if (body.pit_id) pitIdRef.current = body.pit_id;
      } else {
        const reason = predictionsResult.reason;
        setPredictions([]);
        setServerTotal(0);
        setNextCursor(null);
        if (reason?.status === 409 && !retried) {
          pitIdRef.current = null;
          setCursorStack([null]);
          setPage(1);
          setTimeout(() => void loadAll({ cursor: null, pageNum: 1, retried: true }), 0);
          return;
        }
        if (reason?.status === 409) {
          pitIdRef.current = null;
          setCursorStack([null]);
          setPage(1);
          notices.push("Pagination session expired. Please retry.");
        } else {
          notices.push("Predictions list failed to load from the primary endpoint.");
        }
      }

      if (statsResult.status === "fulfilled") {
        const nextStats = statsResult.value?.data || null;
        setStats(nextStats);
        if (nextStats) setTotalPredictionsCount(Number(nextStats.totalPredictions ?? 0));
      } else {
        setStats(null);
        notices.push("Prediction statistics failed to load.");
      }

      let nextTimeline = [];
      if (timelineResult.status === "fulfilled" && Array.isArray(timelineResult.value?.data) && timelineResult.value.data.length) {
        nextTimeline = timelineResult.value.data;
      } else {
        nextTimeline = buildTimelineFromPredictions(preds, minutes, start, end);
        if (nextTimeline.length > 0 && preds.length > 0) {
          if (timelineResult.status === "fulfilled") notices.push("Timeline built from prediction data because the timeline endpoint did not return buckets.");
          else notices.push("Timeline built from prediction data because the timeline endpoint failed.");
        }
      }

      setTimeline(nextTimeline);
      setLastUpdated(new Date().toISOString());
      if (!preds.length && !nextTimeline.length) notices.push("No ML data exists for the selected range.");
      setDataNotice(notices.join(" "));

      if (predictionsResult.status === "rejected" && statsResult.status === "rejected" && timelineResult.status === "rejected") {
        setError(predictionsResult.reason instanceof Error ? predictionsResult.reason : new Error(String(predictionsResult.reason)));
      }
    } catch (err) {
      console.error("ML API error:", err);
      setPredictions([]);
      setTotalPredictionsCount(0);
      setTimeline([]);
      setError(err);
      setDataNotice(`An error occurred while loading ML data: ${err?.message || "unknown error"}`);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [getEffectiveRange, getBaseRange, filterParams, pageSize]);

  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));

  const handleFirstPage = useCallback(() => {
    pitIdRef.current = null;
    setCursorStack([null]);
    setPage(1);
    void loadAll({ cursor: null, pageNum: 1 });
    scrollPredictionsTableIntoView();
  }, [loadAll, scrollPredictionsTableIntoView]);

  const handlePrevPage = useCallback(() => {
    if (page <= 1) return;
    const nextStack = cursorStack.slice(0, -1);
    const cursor = nextStack[nextStack.length - 1] || null;
    const nextPage = nextStack.length;
    setCursorStack(nextStack);
    setPage(nextPage);
    void loadAll({ cursor, pageNum: nextPage });
    scrollPredictionsTableIntoView();
  }, [page, cursorStack, loadAll, scrollPredictionsTableIntoView]);

  const handleNextPage = useCallback(() => {
    if (!nextCursor) return;
    const nextPage = cursorStack.length + 1;
    setCursorStack((prev) => [...prev, nextCursor]);
    setPage(nextPage);
    void loadAll({ cursor: nextCursor, pageNum: nextPage });
    scrollPredictionsTableIntoView();
  }, [nextCursor, cursorStack.length, loadAll, scrollPredictionsTableIntoView]);

  const handleLastPage = useCallback(async () => {
    if (loading || page >= totalPages || !nextCursor) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setDataNotice('');

    try {
      const { start, end } = getEffectiveRange();
      let cursor = nextCursor;
      let pitId = pitIdRef.current;
      let targetPage = page;
      let finalResult = null;
      const nextStack = cursorStack.slice();

      while (targetPage < totalPages && cursor) {
        const pageNum = targetPage + 1;
        const params = {
          ...filterParams,
          start,
          end,
          limit: pageSize,
          page: pageNum,
          cursor: "1",
          search_after: cursor,
        };
        if (pitId) params.pit_id = pitId;

        const body = (await mlApi.getPredictions(params)) || {};
        if (requestId !== requestIdRef.current) return;

        const data = Array.isArray(body.data) ? body.data : [];
        if (!data.length) break;

        pitId = body.pit_id || pitId;
        if (pitId) pitIdRef.current = pitId;
        nextStack.push(cursor);
        targetPage = pageNum;
        finalResult = { body, data };
        cursor = body.next_search_after || null;
      }

      if (requestId !== requestIdRef.current || !finalResult) return;

      const total = Number(finalResult.body.pagination?.total ?? serverTotal);
      setPredictions(finalResult.data);
      setServerTotal(total);
      setTotalPredictionsCount(total);
      setNextCursor(finalResult.body.next_search_after || null);
      setCursorStack(nextStack);
      setPage(targetPage);
      scrollPredictionsTableIntoView();
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (err?.status === 409) {
        pitIdRef.current = null;
        setCursorStack([null]);
        setPage(1);
        setNextCursor(null);
        void loadAll({ cursor: null, pageNum: 1, retried: true });
      } else {
        setDataNotice(`Failed to navigate to the last page: ${err?.message || "unknown error"}`);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [loading, page, totalPages, nextCursor, getEffectiveRange, filterParams, pageSize, cursorStack, serverTotal, scrollPredictionsTableIntoView, loadAll]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Setiap perubahan query (rentang, filter, pencarian, ukuran halaman)
  // memulai lagi dari halaman pertama dengan snapshot PIT baru.
  useEffect(() => {
    pitIdRef.current = null;
    setCursorStack([null]);
    setPage(1);
    setNextCursor(null);
    void loadAll({ cursor: null, pageNum: 1 });
  }, [loadAll]);

  useEffect(() => {
    const interval = setInterval(() => {
      const cursor = cursorStack[cursorStack.length - 1] || null;
      void loadAll({ cursor, pageNum: page });
    }, 60_000);
    return () => clearInterval(interval);
  }, [loadAll, cursorStack, page]);

  const uniqueOptions = useMemo(() => {
    const mapLabel = (item) => ({ value: String(item.label), label: String(item.label) });
    return {
      agents: ensureSelectedOption((stats?.topAgents || []).map((item) => ({ value: String(item.name), label: String(item.name) })), filters.agent),
      labels: ensureSelectedOption((stats?.labels || []).map(mapLabel), filters.label),
      srcs: ensureSelectedOption((stats?.topSourceIps || []).map(mapLabel), filters.sourceIp),
      dests: ensureSelectedOption((stats?.topDestinationIps || []).map(mapLabel), filters.destinationIp),
      services: ensureSelectedOption((stats?.topServices || []).map(mapLabel), filters.service),
    };
  }, [stats, filters.agent, filters.label, filters.sourceIp, filters.destinationIp, filters.service]);

  const activePage = Math.max(1, Math.min(page, totalPages));
  const pageItems = predictions;

  // Negara asal source IP (cache + rate limit diurus hook).
  const mlSourceIps = useMemo(() => pageItems.map((p) => p.sourceIp), [pageItems]);
  const ipGeo = useIpGeo(mlSourceIps);

  const handleExportCsv = async () => {
    const { start, end } = getEffectiveRange();
    const rows = [];
    let cursor = null;
    let pitId = null;
    try {
      for (let pageNum = 1; pageNum <= 500; pageNum += 1) {
        const params = { ...filterParams, start, end, limit: 1000, page: pageNum, cursor: "1" };
        if (cursor) params.search_after = cursor;
        if (pitId) params.pit_id = pitId;
        const result = await mlApi.getPredictions(params);
        const batch = Array.isArray(result?.data) ? result.data : [];
        for (const p of batch) {
          const conf = getConfidenceScore(p);
          const geo = ipGeo.get(p.sourceIp);
          const country = geo?.private ? "UNDIP" : (geo?.name || geo?.code || "-");
          rows.push([formatTime(p.timestamp), p.agent || "-", p.predictedLabel || "-", p.sourceIp || "-", country, p.destinationIp || "-", p.service || "-", conf == null ? "-" : `${conf}%`, p.httpUri || "-", p.httpPostBody || "-"]);
        }
        cursor = result?.next_search_after || null;
        pitId = result?.pit_id || pitId;
        if (!cursor || batch.length === 0) break;
      }
      exportCsv({ filename: `ml-predictions-${new Date().toISOString().slice(0, 10)}.csv`, header: ["Timestamp", "Agent", "Label", "Source IP", "Country (source)", "Destination IP", "Service", "Confidence (%)", "HTTP URI", "HTTP Post Body"], rows });
    } catch (err) {
      setDataNotice(`CSV export failed: ${err?.message || "unknown error"}`);
    }
  };

  const distribution = useMemo(() => {
    return (stats?.labels || [])
      .map((bucket) => ({ name: String(bucket.label), label: String(bucket.label), value: Number(bucket.count) || 0 }))
      .sort((a, b) => b.value - a.value)
      .map((entry, i) => ({ ...entry, color: LABEL_RANK_COLORS[i % LABEL_RANK_COLORS.length] }));
  }, [stats]);

  const avgConfidence = useMemo(() => {
    const raw = Number(stats?.overallAvgConfidence);
    if (!Number.isFinite(raw)) return 0;
    return raw > 1 ? raw : raw * 100;
  }, [stats]);

  const uniqueSourceIpCount = Number(stats?.uniqueSourceIps ?? 0);

  const topSourceIps = useMemo(
    () => (stats?.topSourceIps || []).slice(0, 5).map((item) => ({ label: String(item.label), count: Number(item.count) || 0 })),
    [stats]
  );

  // Pilihan filter Source IP: 10 IP dengan log terbanyak (bukan semua).
  const topSourceIpOptions = useMemo(() => {
    const ranked = (stats?.topSourceIps || [])
      .slice(0, 10)
      .map((item) => ({ value: String(item.label), label: `${item.label} (${item.count})` }));
    // IP dari deep-link (mis. halaman Alerts) tetap muncul walau di luar top 10.
    if (filters.sourceIp && filters.sourceIp !== "all" && !ranked.some((o) => o.value === filters.sourceIp)) {
      ranked.splice(9, 1);
      ranked.unshift({ value: filters.sourceIp, label: `${filters.sourceIp} (filter)` });
    }
    return ranked;
  }, [stats, filters.sourceIp]);

  const topDestIps = useMemo(
    () => (stats?.topDestinationIps || []).slice(0, 5).map((item) => ({ label: String(item.label), count: Number(item.count) || 0 })),
    [stats]
  );

  const topAgents = useMemo(
    () => (stats?.topAgents || []).slice(0, 5).map((item) => ({ name: String(item.name), count: Number(item.count) || 0 })),
    [stats]
  );

  const uniqueAgents = Number(stats?.uniqueAgents ?? 0);

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


  if (loading && predictions.length === 0 && !error) {
    return <PageLoader message="Loading..." fullScreen />;
  }

  if (error && predictions.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[11px] text-red-300 text-center">{error?.message || String(error)}</div>
      </div>
    );
  }

  // Top Source/Dest as BarList items
  const topSourceBarItems = topSourceIps.map((ip, i) => ({ label: String(ip.label), value: Number(ip.count) || 0, color: TOP_SOURCE_IPS_COLORS[i % TOP_SOURCE_IPS_COLORS.length] }));
  const topDestBarItems = topDestIps.map((ip, i) => ({ label: String(ip.label), value: Number(ip.count) || 0, color: TOP_DEST_IPS_COLORS[i % TOP_DEST_IPS_COLORS.length] }));

  return (
    <div className="ml-predictions-page flex flex-col gap-4 w-full min-w-0">
      {/* Header — ML Predictions (tanpa icon, sejajar File Security / FimEvents) */}
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">ML Predictions</h1>
          <p className="text-[9px] min-[400px]:text-[10px] min-[600px]:text-[11px] text-[var(--soc-text-muted)] mt-0.5 leading-snug">Real-time machine learning traffic prediction and threat classification</p>
        </div>
        <div className="ml-predictions-controls flex items-center gap-1.5 min-[400px]:gap-2">
          <RangeFilter
            rangeKey={timeRange}
            onRangeChange={(nextRange) => {
              if (timeRange !== nextRange) { setPage(1); setSelectedTimelinePoint(null); setTimeRange(nextRange); setFilterMode("range"); }
            }}
          />
          <DateRangeFilter
            className="ml-date-range-filter"
            value={customDateRange}
            onChange={(range) => { setPage(1); setSelectedTimelinePoint(null); setCustomDateRange(range); setFilterMode("custom"); }}
            onClear={() => {
              const nextParams = new URLSearchParams(searchParams);
              nextParams.delete("start");
              nextParams.delete("end");
              setSearchParams(nextParams);
              setPage(1);
              setSelectedTimelinePoint(null);
              setFilterMode("range");
              setTimeRange(DEFAULT_TIME_RANGE);
              setCustomDateRange(createDefaultDateRange(1));
            }}
          />
          <div className="ml-page-size-control relative flex items-center bg-[var(--soc-card)] rounded-lg border border-[var(--soc-border)]">
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
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-2 text-[11px] text-red-300">Failed to load ML data: {error?.message || String(error)}<button onClick={handleFirstPage} className="ml-3 underline hover:text-red-200">Retry</button></div>
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

      {/* Timeline + Top Agents — sebaris mulai md */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 chart-card animate-fadeInUp stagger-1 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10"><BarChart3 className="h-3.5 w-3.5 text-violet-400" /></div>
              <div>
                <h3 className="text-[10px] min-[400px]:text-[11px] font-semibold text-[var(--soc-text-primary)]">ML Predictions Timeline</h3>
                <p className="text-[8px] min-[400px]:text-[9px] text-[var(--soc-text-muted)]">Predictions over time. Click a point to filter.</p>
              </div>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[9px] min-[400px]:text-[11px] text-[var(--soc-text-muted)]" title={filterMode === "custom" ? `${customDateRange.start} – ${customDateRange.end}` : undefined}>{filterMode === "custom" ? formatShortRange(customDateRange.start, customDateRange.end) : `Last ${timeRange}`}</div>
              <div className="text-[8px] min-[400px]:text-[10px] font-semibold text-[var(--soc-text-muted)]">Updated {formatLiveTimestamp(lastUpdated)}</div>
            </div>
          </div>
          <div className="h-[220px]" style={{ background: "transparent" }}>
            <WaveChart data={waveData} color="#a78bfa" rangeKey={timeRange} height={220} compact={isMobile} activePointKey={selectedTimelinePoint?.key ?? null} onPointSelect={handleTimelinePointSelect} />
          </div>
        </div>
        <div ref={topAgentsPanelRef} className="ml-top-agents-card chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
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
            <span className="ml-agent-summary-label text-[9px] text-[var(--soc-text-muted)]">Unique agents</span>
            <span className="ml-agent-summary-value text-[11px] font-bold text-[var(--soc-text-primary)]">{uniqueAgents}</span>
          </div>
          <TopAgentsCard agents={topAgents} onItemClick={handleMLAgentSummaryClick} activeName={filters.agent !== "all" ? filters.agent : null} />
        </div>
      </div>

      {/* Label Distribution + Top IPs (Source/Destination tabs) — sebaris mulai md */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="ml-label-distribution-card chart-card animate-fadeInUp stagger-1 flex flex-col md:col-span-2" style={{ opacity: 0, height: topIpsH > 0 ? Math.max(topIpsH, 240) : undefined }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10"><LineChart className="h-3.5 w-3.5 text-violet-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Label Distribution</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Distribution of prediction labels</p>
              </div>
            </div>
            <span className="ml-chart-summary-count text-[10px] font-bold text-[var(--soc-text-primary)]">{totalPredictionsCount} predictions</span>
          </div>
          <div className="ml-label-distribution-body flex-1 min-h-[160px] md:min-h-0 flex flex-col">
            <CategoryLineChart items={distribution} totalLabel="predictions" onPointClick={handleLabelSummaryClick} activeLabel={filters.label && filters.label !== "all" ? filters.label : null} />
          </div>
        </div>
        <div ref={topIpsCardRef} className="chart-card animate-fadeInUp stagger-2 flex flex-col self-start w-full lg:min-h-[320px]" style={{ opacity: 0 }}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <div className="shrink-0 p-1.5 rounded-lg bg-emerald-500/10"><Globe className={`h-3.5 w-3.5 ${ipTab === "source" ? "text-emerald-400" : "text-sky-400"}`} /></div>
              <div className="min-w-0">
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 IPs</h3>
                <p className="text-[9px] leading-tight text-[var(--soc-text-muted)]">Most frequent source / destination IPs</p>
              </div>
            </div>
            <span className={`ml-chart-summary-count shrink-0 whitespace-nowrap text-[10px] font-bold ${ipTab === "source" ? "text-emerald-400" : "text-sky-400"}`}>{(ipTab === "source" ? topSourceBarItems : topDestBarItems).length} IPs</span>
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
            listClassName={(ipTab === "source" ? topSourceBarItems : topDestBarItems).length === 5 ? "ml-bar-list--full" : ""}
          />
        </div>
      </div>

      {/* Logs Table — search/filter disamakan dengan FileSecurityScanner / FimEvents */}
      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg h-auto overflow-hidden">
        <div ref={predictionsTableRef} className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
          <div className="ml-filter-toolbar flex gap-1.5 min-[400px]:gap-2 flex-nowrap attack-logs-search soc-filter-row items-center overflow-x-auto">
            <div className="ml-predictions-search-container flex-1 min-w-0 basis-0 relative">
              <Search className="ml-predictions-search-icon absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input type="text" value={searchQuery} onChange={(e) => { setPage(1); setSearchQuery(e.target.value); }} placeholder="Search by source IP, destination IP, service, or agent..." className="ml-predictions-search-input w-full pl-10 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500" />
            </div>
            <MlCombinedFilter
              labelFilter={filters.label} onLabelChange={(v) => { setPage(1); setFilters((s) => ({ ...s, label: v })); }} labelOptions={uniqueOptions.labels}
              agentFilter={filters.agent} onAgentChange={(v) => { setPage(1); setFilters((s) => ({ ...s, agent: v })); }} agentOptions={uniqueOptions.agents}
              sourceIpFilter={filters.sourceIp} onSourceIpChange={(v) => { setPage(1); setFilters((s) => ({ ...s, sourceIp: v })); }} sourceIpOptions={topSourceIpOptions}
              destIpFilter={filters.destinationIp} onDestIpChange={(v) => { setPage(1); setFilters((s) => ({ ...s, destinationIp: v })); }} destIpOptions={uniqueOptions.dests}
              serviceFilter={filters.service} onServiceChange={(v) => { setPage(1); setFilters((s) => ({ ...s, service: v })); }} serviceOptions={uniqueOptions.services}
              confidenceRangeFilter={filters.confidenceRange} onConfidenceRangeChange={(v) => { setPage(1); setFilters((s) => ({ ...s, confidenceRange: v })); }}
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
            <ExportCsvButton accent="violet" onClick={handleExportCsv} className="ml-export-csv-button" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="ml-predictions-log-table w-full min-w-[1000px] table-fixed text-[10px] md:text-[11px] text-left">
            <colgroup>
              <col style={{ width: "10%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/70">
                {["time", "agent", "label", "source ip", "country", "destination ip", "service", "confidence", "http uri", "http post body"].map((h) => (
                  <th key={h} className={`py-2 md:py-3 lg:py-2 text-[9px] md:text-[11px] lg:text-[10px] font-semibold text-slate-400 uppercase ${(h === "http uri" || h === "http post body") ? "px-3 md:px-4" : "px-1.5 md:px-2"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-slate-500">Loading predictions...</td></tr>
              ) : predictions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center">
                    <p className="text-[10px] font-semibold text-[var(--soc-text-secondary)]">No predictions match current filters</p>
                    <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">Try adjusting the selected filters or time range.</p>
                  </td>
                </tr>
              ) : pageItems.map((p, idx) => (
                <tr key={p.id || p.zeekUid || idx} className={`border-b border-slate-800/60 transition-all duration-150 hover:bg-purple-500/10 hover:shadow-[inset_3px_0_0_0_#a855f7] ${idx % 2 !== 0 ? 'bg-[var(--soc-zebra)]' : ''}`}>
                  <td className="px-1.5 md:px-2 py-3 md:py-5 lg:py-4 text-slate-500 text-[10px] md:text-[11px] lg:text-[10px] whitespace-nowrap overflow-hidden text-ellipsis" title={formatTimeFull(p.timestamp)}>{formatTime(p.timestamp)}</td>
                  <td className="px-1.5 md:px-2 py-3 md:py-5 lg:py-4 text-sky-400 font-medium text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={p.agent || "-"}>{p.agent || '-'}</div></td>
                  <td className="px-1.5 md:px-2 py-3 md:py-5 lg:py-4 whitespace-nowrap"><PredictionBadge label={p.predictedLabel} /></td>
                  <td className="px-1.5 md:px-2 py-3 md:py-5 lg:py-4 text-emerald-400 font-mono text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={p.sourceIp || "-"}>{p.sourceIp || '-'}</div></td>
                  <td className="px-1.5 md:px-2 py-3 md:py-5 lg:py-4 whitespace-nowrap"><CountryFlag ip={p.sourceIp} entry={ipGeo.get(p.sourceIp)} /></td>
                  <td className="px-1.5 md:px-2 py-3 md:py-5 lg:py-4 text-violet-400 font-mono text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={p.destinationIp || "-"}>{p.destinationIp || '-'}</div></td>
                  <td className="px-1.5 md:px-2 py-3 md:py-5 lg:py-4 text-slate-300 text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={p.service || "-"}>{p.service || '-'}</div></td>
                  <td className="px-1.5 md:px-2 py-3 md:py-5 lg:py-4 whitespace-nowrap"><ConfidenceBadge score={p.confidence} label={p.predictedLabel} /></td>
                  <td className="px-3 md:px-4 py-3 md:py-5 lg:py-4 text-slate-400 font-mono text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={p.httpUri || "-"}>{p.httpUri || '-'}</div></td>
                  <td className="px-3 md:px-4 py-3 md:py-5 lg:py-4 text-amber-300/90 font-mono text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={p.httpPostBody || "-"}>{p.httpPostBody || '-'}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {serverTotal > 0 && (
          <div className="ml-pagination-footer border-t border-slate-800 bg-slate-900/50 px-2 md:px-4 py-3">
            <div className="ml-pagination-layout flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0">
              <div className="ml-pagination-summary text-[10px] md:text-[11px] font-mono text-slate-500">
                <span className="hidden md:inline">SHOWING </span>
                <span className="font-bold text-sky-400">{(activePage - 1) * pageSize + 1}</span>
                <span className="hidden md:inline"> - </span><span className="md:hidden">-</span>
                <span className="font-bold text-sky-400">{Math.min(activePage * pageSize, serverTotal)}</span>
                <span className="hidden md:inline"> OF </span><span className="md:hidden"> / </span>
                <span className="font-bold text-sky-400">{serverTotal}</span>
                <span className="hidden md:inline"> PREDICTIONS</span>
              </div>
              <div className="ml-pagination-controls flex flex-wrap items-center gap-2">
                <button disabled={activePage === 1 || loading} onClick={handleFirstPage} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">FIRST</button>
                <button disabled={activePage === 1 || loading} onClick={handlePrevPage} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">PREV</button>
                <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400"><span className="hidden md:inline">PAGE </span><span className="text-[var(--soc-text-primary)]">{activePage}</span> / {totalPages}</span>
                <button disabled={!nextCursor || activePage >= totalPages || loading} onClick={handleNextPage} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">NEXT</button>
                <button disabled={!nextCursor || activePage >= totalPages || loading} onClick={handleLastPage} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20">LAST</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
