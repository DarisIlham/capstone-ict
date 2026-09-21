import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, CalendarRange, ChevronDown, Clock, FileText, Search, X, Users, PieChart, Cloud, AlertTriangle, ShieldAlert, SlidersHorizontal } from "lucide-react";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import FilterSelect from "../components/FilterSelect";
import ExportCsvButton from "../components/ExportCsvButton";
import PageLoader from "../components/PageLoader";
import { useTheme } from "../hooks/useTheme";
import { fetchAllEvents } from "../utils/fetchAllEvents";
import { exportCsv } from "../utils/exportCsv";
import {
  createDefaultDateRange,
  normalizeDateRange,
  getIsoDateRange,
  toDateTimeLocalValue,
} from "../utils/dateRange";
import { adaptiveLeftGutter } from "../utils/chartAxis";

const API_BASE = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

// ── SVG chart helpers ───────────────────────────────────────────────────────
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const formatBucketLabel = (ms, rangeKey) => {
  const d = new Date(ms);
  if (rangeKey === "1h") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (rangeKey === "24h") return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit" });
  if (rangeKey === "7d") return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

const formatDetailedTimestamp = (timestamp) =>
  new Date(timestamp).toLocaleString("en-US", {
    month: "short", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

const WaveChart = ({ data, color = "#10b981", height = 80, rangeKey, compact = false, activePointKey = null, onPointSelect = null }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height });

  const updateSize = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize({ width: Math.max(rect.width, 200), height: Math.max(rect.height, 40) });
    }
  }, []);

  React.useEffect(() => {
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [updateSize]);

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
  const pointSpacing = data.length ? innerW / (data.length - 1) : innerW;
  const defaultBucketMs = rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000;
  const isDense = data.length > 30;
  const denseVisualR = isDense ? 1.6 : 3.5;
  const denseHitR = isDense ? 5 : 10;
  const gridSteps = 5;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i++) {
    const ratio = i / (gridSteps - 1);
    gridLines.push({ value: Math.round(ratio * maxV), y: padding.t + innerH - ratio * innerH, ratio });
  }

  let pathD = "";
  for (let i = 0; i < data.length; i++) {
    const x = padding.l + i * pointSpacing;
    const y = padding.t + innerH - (data[i].v / maxV) * innerH;
    if (i === 0) { pathD += `M ${x} ${y}`; }
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
          const pointData = { index: i, x, y, key: pointKey, value: d.v, time: d.t, start: new Date(Number(d.t)).toISOString(), end: new Date(Number(d.t) + bucketMsForPoint - 1).toISOString(), bucketMs: bucketMsForPoint };
          const isHovered = selectedPoint?.index === i;
          const isActive = activePointKey != null ? String(activePointKey) === pointKey : false;
          const isHighlighted = isHovered || isActive;
          const hitR = isHighlighted || isHovered ? (isDense ? "7" : "10") : `${denseHitR}`;

          return (
            <g key={`point-${pointKey}`}>
              <circle cx={x} cy={y} r={hitR} fill="transparent" className="cursor-pointer"
                onClick={() => onPointSelect?.(pointData)}
                onMouseEnter={() => setSelectedPoint(pointData)}
                onMouseLeave={() => setSelectedPoint(null)}
              />
              <circle cx={x} cy={y} r={`${denseVisualR}`} fill={isActive ? "#34d399" : color} stroke={isActive ? "#0f172a" : "none"} strokeWidth="2.5" opacity="0.95" className="pointer-events-none" />
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % tickEvery !== 0) return null;
          const x = padding.l + i * pointSpacing;
          return (
            <g key={`tick-${d.t}`}>
              <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="var(--soc-border)" />
              <text x={x} y={padding.t + innerH + 14} textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"} fontSize="10" fill="#64748b" fontWeight="500">{formatBucketLabel(d.t, rangeKey)}</text>
            </g>
          );
        })}
      </svg>
      {selectedPoint && (
        <div className="pointer-events-none absolute z-10 min-w-[120px] max-w-[220px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-lg"
          style={{ left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`, top: `${Math.max(((selectedPoint.y - 40) / height) * 100, 6)}%`, transform: "translate(-50%, -100%)" }}>
          <div className="font-semibold text-[var(--soc-text-primary)]">{selectedPoint.value} events</div>
          <div className="mt-1 text-[var(--soc-text-secondary)]">{formatDetailedTimestamp(selectedPoint.time)}</div>
        </div>
      )}
    </div>
  );
};

const Donut = ({ items, size = 140, stroke = 14, centerLabelTop, centerLabelBottom, compact = false, activeLabel = null, onSelect = null }) => {
  const [hovered, setHovered] = useState(null);
  const positive = items.filter((it) => (it.value || 0) > 0);
  if (positive.length === 0) {
    return <div className="flex shrink-0 items-center justify-center text-xs text-slate-600" style={{ width: size, height: size }}>No data</div>;
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
    return [`M ${x1o} ${y1o}`, `A ${ro} ${ro} 0 ${large} 1 ${x2o} ${y2o}`, `L ${x2i} ${y2i}`, `A ${ri} ${ri} 0 ${large} 0 ${x1i} ${y1i}`, "Z"].join(" ");
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
            <path key={it.label} d={d} fill={it.color} opacity={sliceOpacity} stroke="none"
              style={{ cursor: isInteractive ? "pointer" : "default", transition: "opacity 150ms" }}
              onClick={isInteractive ? () => onSelect(it.label) : undefined}
              onMouseEnter={() => setHovered(it.label)}
              onMouseLeave={() => setHovered((h) => (h === it.label ? null : h))}
            >
              <title>{`${it.label}: ${it.value}`}</title>
            </path>
          );
        })}
        <text y={compact ? -2 : -4} textAnchor="middle" fontSize={compact ? "14" : "18"} fill="var(--soc-text-primary)" fontWeight="700">{centerLabelTop}</text>
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
          <div key={it.label}
            className={`flex items-center gap-1 whitespace-nowrap transition-colors ${compact ? "text-[9px]" : "text-[10px]"} ${active ? "text-slate-100 font-bold" : "text-slate-400"} ${activeLabel != null && !active ? "opacity-70" : ""} ${isInteractive ? "cursor-pointer hover:text-slate-200" : ""}`}
            onClick={isInteractive ? () => onSelect(it.label) : undefined}
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

const TopAgentsCard = ({ agents, onItemClick = null, activeName = null }) => {
  if (!agents || agents.length === 0) {
    return (
      <div className="flex h-full min-h-16 flex-col items-center justify-center text-center">
        <p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">No agent data</p>
        <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">No agent activity available.</p>
      </div>
    );
  }
  const maxCount = Math.max(...agents.map((a) => a.count), 1);
  const CHART_COLORS = ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981", "#22C55E", "#EAB308", "#F97316"];
  return (
    <div className="w-full min-w-0 max-w-full space-y-1.5">
      {agents.map((item, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const isActive = activeName != null && String(item.name) === String(activeName);
        return (
          <div key={item.name} onClick={() => onItemClick?.(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg ${onItemClick ? "cursor-pointer" : ""} ${isActive ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : ""}`} title={onItemClick ? `Filter events for ${item.name}` : undefined}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color }}>
                  {i + 1}
                </span>
                <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)] font-mono" title={item.name}>
                  {item.name}
                </span>
              </div>
              <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">
                {new Intl.NumberFormat("en-US").format(item.count)}
              </span>
            </div>
            <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(item.count / maxCount) * 100}%`,
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

// ── FIM Combined Filter (seperti Host Monitoring CombinedFilter, accent emerald) ──
const FimCombinedFilter = ({ agentFilter, onAgentChange, agentOptions = [], userFilter, onUserChange, userOptions = [], eventFilter, onEventChange, eventOptions = [], severityFilter, onSeverityChange, severityOptions = [], dateFilterLabel = "", onResetDateFilter, pathFilter = "", onClearPathFilter, matchingEventsCount = 0, timelineFilterLabel = "", onClearTimelineFilter }) => {
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
  const activeCount = [agentFilter !== "all", userFilter !== "all", eventFilter !== "all", severityFilter !== "all", Boolean(dateFilterLabel), Boolean(pathFilter), Boolean(timelineFilterLabel)].filter(Boolean).length;
  const Section = ({ label, value, allLabel, options, onChange }) => (
    <div className="px-3 py-2">
      <div className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => onChange("all")} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${value === "all" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{allLabel}</button>
        {options.map((opt) => {
          const { value: optVal, label: optLabel } = normalizeOption(opt);
          return <button key={optVal} onClick={() => onChange(optVal)} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${value === optVal ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{optLabel}</button>;
        })}
      </div>
    </div>
  );
  return (
    <div ref={containerRef} className="relative">
      <button ref={buttonRef} type="button" onClick={() => setOpen((c) => !c)} className="flex items-center gap-2 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-2.5 text-[11px] text-[var(--soc-text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-colors hover:bg-[var(--soc-elevated)]">
        <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--soc-text-muted)]" />
        <span className="font-medium">Filters</span>
        {activeCount > 0 && <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">{activeCount}</span>}
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--soc-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="fixed z-[9999] w-[280px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] shadow-2xl" style={{ top: coords.top, left: coords.left }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--soc-border)]">
            <span className="text-[10px] font-semibold text-[var(--soc-text-primary)]">Filter Options</span>
            {activeCount > 0 && <button onClick={() => { onAgentChange("all"); onUserChange("all"); onEventChange("all"); onSeverityChange("all"); if (dateFilterLabel && onResetDateFilter) onResetDateFilter(); if (onClearPathFilter) onClearPathFilter(); if (onClearTimelineFilter) onClearTimelineFilter(); }} className="text-[9px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">Clear all</button>}
          </div>
          {pathFilter && (
            <div className="border-b border-[var(--soc-border)] px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">Path filter</div>
              <div className="mt-1.5 flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="min-w-0 flex-1 truncate" title={pathFilter}>{pathFilter}</span>
                {matchingEventsCount > 0 && <span className="shrink-0 font-mono text-emerald-300/70">{matchingEventsCount.toLocaleString()} matching</span>}
                <button onClick={onClearPathFilter} className="shrink-0 hover:text-white" aria-label="Clear path filter"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}
          {timelineFilterLabel && (
            <div className="border-b border-[var(--soc-border)] px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">Timeline filter</div>
              <div className="mt-1.5 flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="min-w-0 flex-1 truncate" title={timelineFilterLabel}>{timelineFilterLabel}</span>
                <button onClick={onClearTimelineFilter} className="shrink-0 hover:text-white" aria-label="Clear timeline filter"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}
          {dateFilterLabel && <div className="border-b border-[var(--soc-border)] px-3 py-2"><div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">Timeline date filter</div><div className="mt-1"><span className="block min-w-0 truncate rounded border border-emerald-500/30 bg-emerald-500/20 px-2 py-1 text-[10px] font-medium text-emerald-300" title={dateFilterLabel}>{dateFilterLabel}</span></div></div>}
          <div className="divide-y divide-[var(--soc-border)] max-h-[360px] overflow-y-auto">
            <Section label="Agent" value={agentFilter} allLabel="All agents" options={agentOptions} onChange={onAgentChange} />
            <Section label="User" value={userFilter} allLabel="All users" options={userOptions} onChange={onUserChange} />
            <Section label="Event" value={eventFilter} allLabel="All events" options={eventOptions} onChange={onEventChange} />
            <Section label="Severity" value={severityFilter} allLabel="All severities" options={severityOptions} onChange={onSeverityChange} />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Payload Word Cloud ──────────────────────────────────────────────────────
// Palet terang (tema terang) vs palet cerah (tema gelap) agar keyword tetap terbaca
const WORD_COLORS_LIGHT = ["#be123c", "#0369a1", "#047857", "#6d28d9", "#b45309", "#0f766e", "#b91c1c", "#1d4ed8", "#7c3aed", "#a16207"];
const WORD_COLORS_DARK = ["#fb7185", "#38bdf8", "#34d399", "#a78bfa", "#fbbf24", "#2dd4bf", "#f87171", "#60a5fa", "#c084fc", "#facc15"];

const PayloadWordCloud = ({ words, activeWord = null, onWordClick = null }) => {
  const { theme } = useTheme();
  const palette = theme === "light" ? WORD_COLORS_LIGHT : WORD_COLORS_DARK;
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!words || words.length === 0) return <div className="flex items-center justify-center h-auto min-h-16 px-3 py-6 text-center text-slate-600 text-xs">No payload data</div>;
  const W = Math.max(size.width || 0, 140);
  const H = Math.max(size.height || 0, 120);
  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const range = Math.max(1, maxCount - minCount);
  const SAFE_X = 18, SAFE_Y = 14;

  const measureTextWidth = (() => {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = canvas ? canvas.getContext("2d") : null;
    return (text, fs, weight) => {
      if (!ctx || !fs || fs <= 0) return text.length * fs * 0.62;
      ctx.font = `${weight} ${fs}px monospace`;
      return Math.ceil(ctx.measureText(text).width);
    };
  })();

  const fontSize = (count) => Math.round(11 + ((count - minCount) / range) * 31);
  const toWeight = (fs) => (fs > 26 ? "800" : fs > 18 ? "700" : "500");
  const placed = [];
  const rects = [];
  const overlaps = (nx, ny, nw, nh) => {
    const pad = 4;
    return rects.some(r => nx - nw / 2 - pad < r.x + r.w / 2 && nx + nw / 2 + pad > r.x - r.w / 2 && ny - nh / 2 - pad < r.y + r.h / 2 && ny + nh / 2 + pad > r.y - r.h / 2);
  };

  for (let i = 0; i < words.length; i++) {
    const { text, count } = words[i];
    const fs = fontSize(count);
    const weight = toWeight(fs);
    const tw = measureTextWidth(text, fs, weight);
    const th = Math.ceil(fs * 1.4);
    if (tw > W - 2 * SAFE_X || th > H - 2 * SAFE_Y) continue;
    let px = W / 2, py = H / 2, found = false;
    for (let step = 0; step < 800; step++) {
      const angle = step * 0.35, radius = step * 0.8;
      const cx = W / 2 + radius * Math.cos(angle), cy = H / 2 + radius * Math.sin(angle) * 0.6;
      if (cx - tw / 2 >= SAFE_X && cx + tw / 2 <= W - SAFE_X && cy - th / 2 >= SAFE_Y && cy + th / 2 <= H - SAFE_Y && !overlaps(cx, cy, tw, th)) {
        px = cx; py = cy; found = true; break;
      }
    }
    if (found) {
      rects.push({ x: px, y: py, w: tw, h: th });
      placed.push({ text, fs, weight, color: palette[i % palette.length], opacity: 0.65 + ((count - minCount) / range) * 0.35, x: px, y: py, count });
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full h-full min-h-0">
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="block w-full h-full">
        <defs>
          <radialGradient id="wcGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--soc-wc-center, #0f172a)" stopOpacity="var(--soc-wc-edge-opacity, 0)" />
            <stop offset="100%" stopColor="var(--soc-wc-edge, #020617)" stopOpacity="var(--soc-wc-edge-opacity, 0.6)" />
          </radialGradient>
        </defs>
        <rect className="command-word-cloud-bg" width={W} height={H} fill="url(#wcGlow)" rx={12} />
        {placed.map((w) => (
          <text key={w.text} x={w.x} y={w.y} textAnchor="middle" dominantBaseline="middle" fontSize={w.fs}
            fontWeight={activeWord === w.text ? "600" : w.weight} fill={w.color}
            opacity={activeWord != null && activeWord !== w.text ? 0.4 : activeWord === w.text ? 1 : w.opacity}
            style={{ cursor: typeof onWordClick === "function" ? "pointer" : "default", fontFamily: "monospace", transition: "opacity 120ms, fill 120ms" }}
            onClick={typeof onWordClick === "function" ? () => onWordClick(w.text) : undefined}
          >
            <title>{`${w.text}: ${w.count} occurrences`}</title>
            {w.text}
          </text>
        ))}
      </svg>
    </div>
  );
};

// ── KPI Card (copy from MainDashboard) ────────────────────────────────────
const KPICard = ({ label, value, icon: Icon, color, desc, loading, index = 0 }) => (
  <div className={`kpi-modern animate-fadeInUp stagger-${index + 1}`} style={{ opacity: 0 }}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">{label}</span>
      <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
    </div>
    <div className={`text-xl font-bold ${color} mb-1`}>
      {loading ? (
        <div className="skeleton h-6 w-16"></div>
      ) : (
        value
      )}
    </div>
    {desc && (
      <div className="text-[9px] text-[var(--soc-text-muted)]">{desc}</div>
    )}
  </div>
);



// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const TIME_RANGE_OPTIONS = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

const EVENT_TYPE_OPTIONS = [
  { value: "added", label: "Added" },
  { value: "modified", label: "Modified" },
  { value: "deleted", label: "Deleted" },
];

const SEVERITY_LABELS = ["Critical", "High", "Medium", "Low"];

const severityForLevel = (level) => {
  if (level >= 12) return "Critical";
  if (level >= 8) return "High";
  if (level >= 5) return "Medium";
  return "Low";
};

const matchesGridFilters = (event, agentFilter, userFilter, eventFilter, severityFilter) => {
  if (agentFilter !== "all" && String(event.agentName || "Unknown").trim() !== agentFilter) return false;
  if (userFilter !== "all" && String(event.username || "-") !== userFilter) return false;
  if (eventFilter !== "all" && (event.syscheckEvent || "unknown").toLowerCase() !== eventFilter.toLowerCase()) return false;
  if (severityFilter !== "all" && severityForLevel(Number(event.ruleLevel) || 0) !== severityFilter) return false;
  return true;
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const FimEvents = ({ agentId = "all" }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const urlPath = searchParams.get("path");
  const urlAgent = searchParams.get("agent");
  const urlFocus = searchParams.get("focus");
  const [events, setEvents] = useState([]);
  const [totalEventHits, setTotalEventHits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [distData, setDistData] = useState(null);
  const [agentsStats, setAgentsStats] = useState(null);
  const [usersStats, setUsersStats] = useState(null);
  const [rangeKey, setRangeKey] = useState(() => (urlRange && ["1h", "24h", "7d", "30d"].includes(urlRange) ? urlRange : "24h"));
  const [filterMode, setFilterMode] = useState(() => (urlStart && urlEnd ? "custom" : "range"));
  const [customDateRange, setCustomDateRange] = useState(() => {
    const base = createDefaultDateRange(1);
    if (urlStart && urlEnd) return { start: toDateTimeLocalValue(new Date(urlStart)), end: toDateTimeLocalValue(new Date(urlEnd)) };
    return base;
  });
  const [pathFilter, setPathFilter] = useState(urlPath || null);
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString());
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  const [timelineChartHeight, setTimelineChartHeight] = useState(250);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState(urlAgent || "all");
  const [userFilter, setUserFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedPayloadPattern, setSelectedPayloadPattern] = useState(null);
  const [clientPage, setClientPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const topAgentsPanelRef = useRef(null);
  const logsTableRef = useRef(null);

  const focusLogs = useCallback(() => {
    setClientPage(1);
    setTimeout(() => {
      if (logsTableRef.current?.scrollIntoView) {
        try { logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
      }
    }, 100);
  }, []);

  const handleAgentSummaryClick = useCallback((item) => {
    const value = String(item?.name || "all");
    const next = agentFilter === value ? "all" : value;
    setAgentFilter(next);
    if (next !== "all") focusLogs();
  }, [agentFilter, focusLogs]);

  const handleEventSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all").toLowerCase();
    const next = eventFilter === value ? "all" : value;
    setEventFilter(next);
    if (next !== "all") focusLogs();
  }, [eventFilter, focusLogs]);

  const handleSeveritySummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const next = severityFilter === value ? "all" : value;
    setSeverityFilter(next);
    if (next !== "all") focusLogs();
  }, [severityFilter, focusLogs]);

  const handleUserSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const next = userFilter === value ? "all" : value;
    setUserFilter(next);
    if (next !== "all") focusLogs();
  }, [userFilter, focusLogs]);

  const handleFileSummaryClick = useCallback((item) => {
    const value = String(item?.label || "");
    const next = pathFilter === value ? null : value;
    setPathFilter(next);
    if (next) focusLogs();
  }, [pathFilter, focusLogs]);

  const handleTimelinePointSelect = useCallback((point) => {
    setClientPage(1);
    const isCancel = selectedTimelinePoint?.key === point.key;
    setSelectedTimelinePoint((current) =>
      current?.key === point.key
        ? null
        : {
          key: point.key,
          time: point.time,
          start: point.start || point.time,
          end: point.end || point.time,
          bucketMs: point.bucketMs,
        }
    );
    if (!isCancel) focusLogs();
  }, [selectedTimelinePoint, focusLogs]);

  const isMobile = viewportWidth < 768;
  const usesCompactDonuts = viewportWidth < 1280;
  const usesLargeDonuts = viewportWidth >= 1600;
  const donutSize = isMobile ? 124 : usesCompactDonuts ? 160 : usesLargeDonuts ? 260 : 200;
  const donutStroke = isMobile ? 14 : usesCompactDonuts ? 18 : usesLargeDonuts ? 22 : 20;

  React.useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  React.useEffect(() => {
    const updateTimelineHeight = () => {
      if (isMobile) { setTimelineChartHeight(110); return; }
      const panelHeight = topAgentsPanelRef.current?.getBoundingClientRect().height;
      if (panelHeight) setTimelineChartHeight(clamp(Math.round(panelHeight - 104), 180, 420));
    };
    updateTimelineHeight();
  }, [isMobile, viewportWidth]);

  React.useEffect(() => { setClientPage(1); }, [searchQuery, eventFilter, agentFilter, userFilter, severityFilter]);

  React.useEffect(() => {
    if (!pathFilter && !urlAgent && urlFocus !== "logs") return;
    const id = setTimeout(() => {
      if (logsTableRef.current && typeof logsTableRef.current.scrollIntoView === "function") {
        try { logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
      }
    }, 300);
    return () => clearTimeout(id);
  }, [pathFilter, urlAgent, urlFocus, loading]);

  const getEffectiveRange = useCallback(() => {
    if (filterMode === "custom") return getIsoDateRange(normalizeDateRange(customDateRange));
    const end = new Date();
    const start = new Date(end);
    switch (rangeKey) {
      case "1h": start.setHours(start.getHours() - 1); break;
      case "24h": start.setDate(start.getDate() - 1); break;
      case "7d": start.setDate(start.getDate() - 7); break;
      case "30d": start.setDate(start.getDate() - 30); break;
      default: start.setDate(start.getDate() - 1);
    }
    return { start: start.toISOString(), end: end.toISOString() };
  }, [filterMode, customDateRange, rangeKey]);

  const fetchRealData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingMore(false);
      setFetchError("");
      const isCustom = filterMode === "custom";
      const baseEvents = agentId && agentId !== "all" ? `${API_BASE}/events/${encodeURIComponent(agentId)}` : `${API_BASE}/events`;
      const baseDist = agentId && agentId !== "all" ? `${API_BASE}/events/${encodeURIComponent(agentId)}/distribution/stats` : `${API_BASE}/events/distribution/stats`;
      const baseAgents = agentId && agentId !== "all" ? `${API_BASE}/events/${encodeURIComponent(agentId)}/agents/stats` : `${API_BASE}/events/agents/stats`;
      let distUrl, agentsUrl, usersUrl;
      if (isCustom) {
        const { start, end } = getIsoDateRange(normalizeDateRange(customDateRange));
        const qs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${severityFilter !== "all" ? `&severity=${encodeURIComponent(severityFilter.toLowerCase())}` : ""}`;
        distUrl = `${baseDist}?${qs}`;
        agentsUrl = `${baseAgents}?${qs}`;
        usersUrl = `${baseEvents.replace(/\/events(?:\/[^/]+)?$/, "/events/users/stats")}?${qs}`;
      } else {
        distUrl = `${baseDist}?range=${encodeURIComponent(rangeKey)}`;
        agentsUrl = `${baseAgents}?range=${encodeURIComponent(rangeKey)}`;
        usersUrl = `${baseEvents.replace(/\/events(?:\/[^/]+)?$/, "/events/users/stats")}?range=${encodeURIComponent(rangeKey)}`;
      }
      // Ambil SEMUA events via search_after paralel per slice waktu (tanpa batas)
      const fetchJson = (url) => fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`events ${r.status}`);
        return r.json();
      });
      const effRange = getEffectiveRange();
      let firstSliceShown = false;
      const [eventsRes, distRes, agentsRes, usersRes] = await Promise.all([
        fetchAllEvents(fetchJson, {
          baseUrl: baseEvents,
          start: effRange.start,
          end: effRange.end,
          severity: severityFilter,
          slices: 2,
          pageSize: 500,
          onProgress: (partialRows) => {
            // Tampilkan data sebagian secepatnya; gabung + dedup + urut
            setEvents((prev) => {
              const seen = new Map(prev.map((e) => [e?.id ?? `${e?.timestamp}-${e?.agentName}-${e?.syscheckPath}`, e]));
              for (const e of partialRows) {
                const key = e?.id ?? `${e?.timestamp}-${e?.agentName}-${e?.syscheckPath}`;
                if (!seen.has(key)) seen.set(key, e);
              }
              return Array.from(seen.values()).sort(
                (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
              );
            });
            if (!firstSliceShown) {
              firstSliceShown = true;
              setLoading(false);
              setLoadingMore(true);
            }
          },
        }),
        fetch(distUrl).then(async (r) => {
          if (!r.ok) throw new Error(`distribution ${r.status}`);
          return r.json();
        }).catch(() => null),
        fetch(agentsUrl).then(async (r) => {
          if (!r.ok) throw new Error(`agents ${r.status}`);
          return r.json();
        }).catch(() => null),
        fetch(usersUrl).then(async (r) => {
          if (!r.ok) throw new Error(`users ${r.status}`);
          return r.json();
        }).catch(() => null),
      ]);
      const eventsData = Array.isArray(eventsRes?.rows) ? eventsRes.rows : [];
      setEvents(eventsData);
      setTotalEventHits(Number(eventsRes?.totalHits ?? eventsData.length));
      setDistData(distRes || null);
      setAgentsStats(agentsRes || null);
      setUsersStats(usersRes || null);
      setLastUpdated(new Date().toISOString());
    } catch (e) {
      setFetchError(e?.message || "Failed to load FIM events");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [rangeKey, filterMode, customDateRange, agentId, severityFilter, getEffectiveRange]);

  useEffect(() => {
    fetchRealData();
  }, [fetchRealData]);

  useEffect(() => {
    const id = setInterval(() => fetchRealData(), 30000);
    return () => clearInterval(id);
  }, [fetchRealData]);

  // ── Derived data from real events + dist/agents aggregates ────────────────
  const derived = useMemo(() => {
    const rangeMsMap = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
    const now = Date.now();
    let rangeMs, startMs, endMs;

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

    const filtered = events
      .map((e) => ({ ...e, _ms: e.timestamp ? new Date(e.timestamp).getTime() : NaN }))
      .filter((e) => Number.isFinite(e._ms) && e._ms >= startMs && e._ms <= endMs)
      .sort((a, b) => b._ms - a._ms);

    // Timeline buckets from filtered (real)
    const stepMs = rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000;
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

    // Event type donut — hanya 3 syscheck (added/modified/deleted), yang lain buang
    const allowedEvents = new Set(["added", "modified", "deleted"]);
    let eventItems;
    if (distData?.eventTypes && Array.isArray(distData.eventTypes) && distData.eventTypes.length) {
      const palette = { added: "#38bdf8", modified: "#34D399", deleted: "#FBBF24" };
      eventItems = distData.eventTypes
        .filter((it) => allowedEvents.has(String(it.label).toLowerCase()))
        .slice(0, 3)
        .map((it) => ({ label: String(it.label).toLowerCase(), value: Number(it.value) || 0, color: palette[String(it.label).toLowerCase()] || "#64748b" }))
        .sort((a, b) => b.value - a.value);
    } else {
      const byEvent = new Map();
      for (const e of filtered) {
        const raw = String(e.syscheckEvent || "").toLowerCase().trim();
        if (!allowedEvents.has(raw)) continue;
        byEvent.set(raw, (byEvent.get(raw) || 0) + 1);
      }
      const colorMap = { added: "#38bdf8", modified: "#34D399", deleted: "#FBBF24" };
      eventItems = Array.from(byEvent.entries())
        .map(([label, value]) => ({ label, value, color: colorMap[label] || "#64748b" }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);
    }

    // Severity donut — prefer distData.severity (full-range agg)
    let severityItems;
    if (distData?.severity && Array.isArray(distData.severity) && distData.severity.length) {
      const severityColorMap = { "Critical": "#ef4444", "High": "#f97316", "Medium": "#eab308", "Low": "#3b82f6" };
      severityItems = distData.severity.map((it) => ({ label: it.label, value: Number(it.value) || 0, color: severityColorMap[it.label] || "#64748b" })).filter((it) => it.value >= 0).sort((a, b) => b.value - a.value);
    } else {
      const bySeverity = new Map();
      for (const e of filtered) {
        const level = e.ruleLevel || 0;
        let sev = "Low";
        if (level >= 12) sev = "Critical";
        else if (level >= 8) sev = "High";
        else if (level >= 5) sev = "Medium";
        bySeverity.set(sev, (bySeverity.get(sev) || 0) + 1);
      }
      const severityColorMap = { "Critical": "#ef4444", "High": "#f97316", "Medium": "#eab308", "Low": "#3b82f6" };
      severityItems = Array.from(bySeverity.entries())
        .map(([label, value]) => ({ label, value, color: severityColorMap[label] || "#64748b" }))
        .sort((a, b) => b.value - a.value);
    }

    // Top agents — prefer agentsStats.data (full-range agg)
    let topAgents;
    if (agentsStats?.data && Array.isArray(agentsStats.data) && agentsStats.data.length) {
      const byAgentLastSeen = new Map();
      for (const e of filtered) {
        const k = String(e.agentName || "").trim();
        if (!k) continue;
        byAgentLastSeen.set(k, Math.max(byAgentLastSeen.get(k) || 0, e._ms || 0));
      }
      topAgents = agentsStats.data.slice(0, 5).map((a) => ({ name: a.agent || a.label || "Unknown", count: Number(a.count ?? a.doc_count ?? 0), lastSeen: byAgentLastSeen.get(a.agent || a.label) || 0 }));
    } else {
      const byAgent = new Map();
      for (const e of filtered) {
        const agentLabel = String(e.agentName || "Unknown agent").trim() || "Unknown agent";
        const existing = byAgent.get(agentLabel) || { name: agentLabel, count: 0, lastSeen: 0 };
        existing.count += 1;
        existing.lastSeen = Math.max(existing.lastSeen, e._ms || 0);
        byAgent.set(agentLabel, existing);
      }
      topAgents = Array.from(byAgent.values())
        .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
        .slice(0, 5);
    }

    // Payload words — from filtered real fileDiff/full_log
    const STOP = new Set(["", "---", "@@", "+", "-", "//", "#", "the", "is", "to", "and", "file", "mode", "old", "new", "was", "now", "sum", "changed", "attributes", "realtime"]);
    const byPayload = new Map();
    for (const e of filtered) {
      const raw = e.fileDiff || e.fullLog;
      if (!raw) continue;
      const lines = String(raw).replace(/\\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
      const diffLines = lines.filter((l) => l.startsWith(">") || l.startsWith("<"));
      const payloadLines = diffLines.length ? diffLines.map((l) => l.substring(1)) : lines;
      for (const line of payloadLines) {
        const tokens = line.split(/[\s/=:;,'"(){}[\]<>|&!?@#%^*`~]+/).map((t) => t.toLowerCase()).filter((t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));
        for (const token of tokens) byPayload.set(token, (byPayload.get(token) || 0) + 1);
      }
    }
    const payloadWords = Array.from(byPayload.entries()).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 40);

    // Keep the headline total aligned with the dashboard's /events total_hits.
    // Distribution is enrichment and may be unavailable while event pagination
    // is still usable.
    const totalForUI = totalEventHits > 0
      ? totalEventHits
      : (distData?.total != null ? Number(distData.total) : filtered.length);
    const criticalFromDist = distData?.severity?.find((s) => s.label === "Critical")?.value;
    const criticalCount = criticalFromDist != null ? Number(criticalFromDist) : filtered.filter((e) => (e.ruleLevel || 0) >= 12).length;
    const byFile = new Map();
    for (const e of filtered) {
      const key = String(e.syscheckPath || "unknown").trim() || "unknown";
      byFile.set(key, (byFile.get(key) || 0) + 1);
    }
    const fileUserCounts = new Map();
    for (const e of filtered) {
      const key = String(e.syscheckPath || "unknown").trim() || "unknown";
      const user = String(e.username || "").trim() || "unknown";
      if (!fileUserCounts.has(key)) fileUserCounts.set(key, new Map());
      const umap = fileUserCounts.get(key);
      umap.set(user, (umap.get(user) || 0) + 1);
    }
    const topFiles = Array.from(byFile.entries())
      .map(([label, value], i) => {
        const umap = fileUserCounts.get(label);
        let sub = "";
        if (umap) {
          let maxUser = "";
          let maxCount = 0;
          for (const [u, c] of umap.entries()) {
            if (c > maxCount) { maxCount = c; maxUser = u; }
          }
          sub = maxUser;
        }
        return { label, value, sub, color: ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6"][i % 5] };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const topUsers = Array.isArray(usersStats?.data)
      ? usersStats.data.slice(0, 5).map((item, i) => ({ label: item.user || item.label, value: Number(item.count ?? item.value ?? 0), color: ["#A855F7", "#EC4899", "#8B5CF6", "#6366F1", "#3B82F6"][i % 5] }))
      : [];
    const mostSevere = filtered.reduce((acc, e) => {
      const level = e.ruleLevel || 0;
      if (!acc || level > (acc.ruleLevel || 0)) return { ruleLevel: level, description: e.ruleDescription || "-" };
      return acc;
    }, null);

    const uniqueAgentsCount = agentsStats?.data?.length ?? (() => { const s = new Set(filtered.map((e) => String(e.agentName || "").trim()).filter(Boolean)); return s.size || (filtered.length ? 1 : 0); })();

    return {
      filtered, series, eventItems, topAgents, severityItems, payloadWords, topUsers, topFiles,
      total: totalForUI, startMs, endMs, uniqueAgents: uniqueAgentsCount,
      criticalCount, uniqueFiles: byFile.size, mostSevereEvent: mostSevere,
    };
  }, [events, totalEventHits, distData, agentsStats, usersStats, rangeKey, filterMode, customDateRange]);

  const filterOptions = useMemo(() => {
    const agentSet = new Set();
    const userSet = new Set();
    for (const e of events) {
      agentSet.add(String(e.agentName || "Unknown").trim() || "Unknown");
      const u = String(e.username || "-").trim();
      if (u && u !== "-") userSet.add(u);
    }
    return { agents: Array.from(agentSet).sort(), users: Array.from(userSet).sort() };
  }, [events]);

  const tableEvents = useMemo(() => {
    return events
      .filter((e) => {
        if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
          const ms = new Date(e.timestamp).getTime();
          const s = new Date(selectedTimelinePoint.start).getTime();
          const en = new Date(selectedTimelinePoint.end).getTime();
          if (!(Number.isFinite(ms) && ms >= s && ms <= en)) return false;
        }
        return true;
      })
      .filter((e) => {
        if (pathFilter && String(e.syscheckPath || "").toLowerCase() !== String(pathFilter).toLowerCase()) return false;
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return [e.agentName, e.username, e.syscheckPath, e.syscheckEvent, e.ruleDescription].filter(Boolean).some((f) => String(f).toLowerCase().includes(q));
      })
      .filter((e) => matchesGridFilters(e, agentFilter, userFilter, eventFilter, severityFilter))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [events, searchQuery, agentFilter, userFilter, eventFilter, severityFilter, pathFilter, selectedTimelinePoint]);

  const visibleEvents = useMemo(() => {
    return tableEvents.slice((clientPage - 1) * pageSize, clientPage * pageSize);
  }, [tableEvents, clientPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(tableEvents.length / pageSize));

  const formatTime = (isoString) => {
    if (!isoString) return "-";
    return new Date(isoString).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const handleExportCsv = () => {
    const rows = tableEvents.map((evt) => [
      formatTime(evt.timestamp), evt.agentName || "-", evt.username || "-", evt.syscheckPath || "-",
      evt.syscheckEvent || "-", evt.ruleDescription || "-", evt.ruleLevel ?? "-", evt.fileDiff || "-",
    ]);
    exportCsv({
      filename: `fim-events-${new Date().toISOString().slice(0, 10)}.csv`,
      header: ["Timestamp", "Agent", "User", "Path", "Event", "Rule", "Severity", "Diff"],
      rows,
    });
  };

  const renderSeverityBadge = (level) => {
    if (level >= 12) return <span className="bg-red-900/50 text-red-300 border border-red-700/50 px-2 py-0.5 rounded text-[10px] md:text-[11px] font-bold">Critical Lvl {level}</span>;
    if (level >= 8) return <span className="bg-orange-900/50 text-orange-300 border border-orange-700/50 px-2 py-0.5 rounded text-[10px] md:text-[11px] font-bold">High Lvl {level}</span>;
    if (level >= 5) return <span className="bg-yellow-900/50 text-yellow-300 border border-yellow-700/50 px-2 py-0.5 rounded text-[10px] md:text-[11px] font-bold">Medium Lvl {level}</span>;
    return <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-[10px] md:text-[11px] font-bold">Low Lvl {level}</span>;
  };

  if (loading && events.length === 0 && !fetchError) {
    return <PageLoader message="Loading..." fullScreen />;
  }

  if (fetchError && events.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[11px] text-red-300">
          {fetchError}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      {/* Header — like Host Monitoring */}
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">
            File Integrity Monitoring
          </h1>
          <p className="text-[11px] text-[var(--soc-text-muted)] mt-0.5">Real-time file changes monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <RangeFilter
            rangeKey={rangeKey}
            onRangeChange={(nextRange) => {
              if (rangeKey !== nextRange) {
                setClientPage(1);
                setSelectedTimelinePoint(null);
                setRangeKey(nextRange);
                setFilterMode("range");
              }
            }}
          />
          <DateRangeFilter
            value={customDateRange}
            onChange={(range) => {
              setClientPage(1);
              setSelectedTimelinePoint(null);
              setCustomDateRange(range);
              setFilterMode("custom");
            }}
          />
          <div className="relative flex items-center bg-[var(--soc-card)] rounded-lg border border-[var(--soc-border)]">
            <select
              value={pageSize}
              onChange={(event) => {
                setClientPage(1);
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

      {fetchError && events.length > 0 && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-2 text-[11px] text-red-300">
          Failed to load FIM data: {fetchError}
          <button onClick={() => fetchRealData()} className="ml-3 underline hover:text-red-200">Retry</button>
        </div>
      )}

      {/* KPI Cards — kpi-modern like Host Monitoring */}
      <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-3">
        <KPICard
          label="Total Events"
          value={new Intl.NumberFormat("en-US").format(derived.total)}
          icon={FileText}
          color="text-purple-400"
          desc="events in range"
          loading={loading}
          index={0}
        />
        <KPICard
          label="Files Changed"
          value={new Intl.NumberFormat("en-US").format(derived.uniqueFiles)}
          icon={Activity}
          color="text-pink-400"
          desc="unique files modified"
          loading={loading}
          index={1}
        />
        <KPICard
          label="Critical Events"
          value={new Intl.NumberFormat("en-US").format(derived.criticalCount)}
          icon={AlertTriangle}
          color="text-cyan-400"
          desc="rule level ≥ 12"
          loading={loading}
          index={2}
        />
        <KPICard
          label="Most Severe"
          value={derived.mostSevereEvent ? `Lvl ${derived.mostSevereEvent.ruleLevel}` : "—"}
          icon={ShieldAlert}
          color="text-emerald-400"
          desc={derived.mostSevereEvent ? derived.mostSevereEvent.description : "no events"}
          loading={loading}
          index={3}
        />
      </div>

      {/* Timeline + Top Agents — xl:grid-cols-3 like Host Monitoring */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 chart-card animate-fadeInUp stagger-1 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">FIM Timeline</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">File integrity changes over time. Click a point to filter.</p>
              </div>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[9px] text-[var(--soc-text-muted)]">Last {rangeKey}</div>
              <div className="text-[10px] font-semibold text-[var(--soc-text-muted)]">Updated {formatTime(lastUpdated)}{loadingMore ? " · Syncing…" : ""}</div>
            </div>
          </div>
          <div className="h-[220px]" style={{ background: "transparent" }}>
            <WaveChart data={derived.series} color="#10b981" height={220} rangeKey={rangeKey} compact={isMobile} activePointKey={selectedTimelinePoint?.key ?? null} onPointSelect={handleTimelinePointSelect} />
          </div>
        </div>
        <div ref={topAgentsPanelRef} className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10">
                <Users className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Agents</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Most active agents from FIM events</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[9px] text-[var(--soc-text-muted)]">Unique agents</span>
            <span className="text-[11px] font-bold text-[var(--soc-text-primary)]">{derived.uniqueAgents}</span>
          </div>
          <TopAgentsCard agents={derived.topAgents} onItemClick={handleAgentSummaryClick} activeName={agentFilter !== "all" ? agentFilter : null} />
        </div>
      </div>

      {/* Event + Severity dipisah — masing-masing container seperti Top 5 Agents */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="chart-card animate-fadeInUp stagger-1 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-sky-500/10">
                <Activity className="h-3.5 w-3.5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Event Distribution</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Share of events by type</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-[var(--soc-text-primary)]">{derived.total} events</span>
          </div>
          {(() => {
            const items = derived.eventItems || [];
            if (!items.length) return <div className="flex h-full min-h-16 flex-col items-center justify-center text-center"><p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">No event data</p></div>;
            const maxV = Math.max(...items.map((d) => d.value), 1);
            return (
              <div className="w-full min-w-0 max-w-full space-y-1.5">
                {items.map((item, i) => {
                  const isActive = eventFilter !== "all" && String(eventFilter).toLowerCase() === String(item.label).toLowerCase();
                  return (
                    <div key={item.label} onClick={() => handleEventSummaryClick(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg cursor-pointer ${isActive ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color: item.color }}>{i + 1}</span>
                          <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)]" title={item.label}>{item.label}</span>
                        </div>
                        <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(item.value)}</span>
                      </div>
                      <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(item.value / maxV) * 100}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-500/10">
                <ShieldAlert className="h-3.5 w-3.5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Severity Distribution</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Share of events by severity</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-[var(--soc-text-primary)]">{derived.total} total</span>
          </div>
          {(() => {
            const items = derived.severityItems || [];
            if (!items.length) return <div className="flex h-full min-h-16 flex-col items-center justify-center text-center"><p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">No severity data</p></div>;
            const maxV = Math.max(...items.map((d) => d.value), 1);
            return (
              <div className="w-full min-w-0 max-w-full space-y-1.5">
                {items.map((item, i) => {
                  const isActive = severityFilter !== "all" && String(severityFilter) === String(item.label);
                  return (
                    <div key={item.label} onClick={() => handleSeveritySummaryClick(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg cursor-pointer ${isActive ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color: item.color }}>{i + 1}</span>
                          <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)]" title={item.label}>{item.label}</span>
                        </div>
                        <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(item.value)}</span>
                      </div>
                      <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(item.value / maxV) * 100}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <div className="chart-card animate-fadeInUp stagger-3 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10">
                <Users className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Users</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Most active users by file changes</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-violet-400">{derived.topUsers?.length || 0} users</span>
          </div>
          {(() => {
            const items = derived.topUsers || [];
            if (!items.length) return <div className="flex h-full min-h-16 flex-col items-center justify-center text-center"><p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">No user data</p></div>;
            const maxV = Math.max(...items.map((d) => d.value), 1);
            return (
              <div className="w-full min-w-0 max-w-full space-y-1.5">
                {items.map((item, i) => {
                  const isActive = userFilter !== "all" && String(userFilter) === String(item.label);
                  return (
                    <div key={item.label} onClick={() => handleUserSummaryClick(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg cursor-pointer ${isActive ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : ""}`} title={`Filter events for ${item.label}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color: item.color }}>{i + 1}</span>
                          <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)]" title={item.label}>{item.label}</span>
                        </div>
                        <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(item.value)}</span>
                      </div>
                      <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(item.value / maxV) * 100}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Payload Pattern Cloud (bawah Event/Severity) + Top 5 Changed Files di kanannya — Payload span2 + Changed Files span1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
        <div className="xl:col-span-2 chart-card animate-fadeInUp stagger-1 flex flex-col overflow-hidden" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10">
                <Cloud className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Payload Pattern Cloud</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Frequent patterns found in FIM event payloads</p>
              </div>
            </div>
          </div>
          {/* Fixed height (not flex-1): word cloud has no intrinsic height, so a
              flex/percentage chain makes the row height unstable/circular.
              280px matches the natural height of the Top 5 Changed Files card. */}
          <div className="w-full h-[280px] shrink-0 overflow-hidden rounded-xl" style={{ background: "transparent" }}>
            <div className="w-full h-full rounded-xl overflow-hidden" style={{ background: "transparent" }}>
              <PayloadWordCloud words={derived.payloadWords} activeWord={selectedPayloadPattern} onWordClick={(w) => setSelectedPayloadPattern((p) => p === w ? null : w)} />
            </div>
          </div>
        </div>

        <div className="chart-card animate-fadeInUp stagger-2 flex flex-col overflow-hidden" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-sky-500/10">
                <FileText className="h-3.5 w-3.5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Changed Files</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Most frequently modified files</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-sky-400">{derived.topFiles?.length || 0} files</span>
          </div>
          {(() => {
            const items = derived.topFiles || [];
            if (!items.length) return <div className="flex h-full min-h-16 flex-col items-center justify-center text-center"><p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">No file data</p></div>;
            const maxV = Math.max(...items.map((d) => d.value), 1);
            return (
              <div className="w-full min-w-0 max-w-full space-y-1.5 flex-1 overflow-y-auto">
                {items.map((item, i) => (
                  <div key={item.label} onClick={() => handleFileSummaryClick(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg cursor-pointer ${pathFilter && String(pathFilter) === String(item.label) ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : ""}`} title={`Filter events for ${item.label}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color: item.color }}>{i + 1}</span>
                        <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)] font-mono" title={item.label}>{item.label}</span>
                      </div>
                      <span className="min-w-[1.5rem] shrink-0 text-right text-[10px] font-bold text-[var(--soc-text-primary)] tabular-nums ml-1.5">{new Intl.NumberFormat("en-US").format(item.value)}</span>
                    </div>
                    {item.sub && (
                      <div className="-mt-0.5 ml-7 leading-none">
                        <span className="text-[9px] text-[var(--soc-text-muted)]" title={`by ${item.sub}`}>by {item.sub}</span>
                      </div>
                    )}
                    <div className="mt-0.5 ml-7 h-1.5 bg-[var(--soc-elevated)] rounded-full overflow-hidden progress-bar">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(item.value / maxV) * 100}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Logs Table — filter log disamakan dengan Host Monitoring (AttackDashboard) */}
      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg h-auto overflow-hidden">
        <div ref={logsTableRef} className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
          <div className="flex gap-2 flex-wrap attack-logs-search soc-filter-row items-center">
            <div className="flex-1 min-w-0 basis-full sm:basis-0 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input type="text" value={searchQuery} onChange={(e) => { setClientPage(1); setSearchQuery(e.target.value); }} placeholder="Search agent, user, path, event, rule..." className="w-full pl-10 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500" />
            </div>
            <FimCombinedFilter
              agentFilter={agentFilter} onAgentChange={(v) => { setClientPage(1); setAgentFilter(v); }} agentOptions={filterOptions.agents}
              userFilter={userFilter} onUserChange={(v) => { setClientPage(1); setUserFilter(v); }} userOptions={filterOptions.users}
              eventFilter={eventFilter} onEventChange={(v) => { setClientPage(1); setEventFilter(v); }} eventOptions={EVENT_TYPE_OPTIONS}
              severityFilter={severityFilter} onSeverityChange={(v) => { setClientPage(1); setSeverityFilter(v); }} severityOptions={SEVERITY_LABELS}
              dateFilterLabel={urlStart && urlEnd ? `${formatDetailedTimestamp(urlStart)} - ${formatDetailedTimestamp(urlEnd)}` : ""}
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
              pathFilter={pathFilter}
              matchingEventsCount={tableEvents.length}
              onClearPathFilter={() => { setPathFilter(null); setClientPage(1); }}
              timelineFilterLabel={selectedTimelinePoint
                ? `${formatDetailedTimestamp(selectedTimelinePoint.start)}${selectedTimelinePoint.end ? ` - ${formatDetailedTimestamp(selectedTimelinePoint.end)}` : ""}`
                : ""}
              onClearTimelineFilter={() => { setSelectedTimelinePoint(null); setClientPage(1); }}
            />
            <ExportCsvButton accent="emerald" onClick={handleExportCsv} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[10px] md:text-[11px] text-left">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/70">
                {["↓ time", "agent", "user", "path", "event", "payload", "severity"].map((h) => (
                  <th key={h} className="px-2 md:px-4 lg:px-3 py-2 md:py-3 lg:py-2 text-[9px] md:text-[11px] lg:text-[10px] font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">Loading FIM events...</td></tr>
              ) : visibleEvents.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">No FIM events found.</td></tr>
              ) : visibleEvents.map((evt, idx) => (
                <tr key={evt.id} className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${idx % 2 !== 0 ? "bg-slate-900/60" : ""}`}>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-slate-500 text-[10px] md:text-[11px] lg:text-[10px]">{formatTime(evt.timestamp)}</td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-sky-400 font-medium text-[10px] md:text-[11px] lg:text-[10px]">{evt.agentName}</td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-violet-400 font-medium text-[10px] md:text-[11px] lg:text-[10px]">{evt.username}</td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-emerald-400 font-mono text-[10px] md:text-[11px] lg:text-[10px] max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px]">
                    <div className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={evt.syscheckPath}>
                      {evt.syscheckPath}
                    </div>
                  </td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2">
                    <span className={`text-[10px] md:text-[11px] lg:text-[10px] px-1 md:px-2 lg:px-1.5 py-0.5 rounded border ${evt.syscheckEvent === "deleted" ? "text-red-400 bg-red-900/30" : "text-green-400 bg-green-900/30"}`}>
                      {evt.syscheckEvent}
                    </span>
                  </td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 max-w-[320px] sm:max-w-[400px] md:max-w-[480px] lg:max-w-[580px] xl:max-w-[680px] align-top">
                    <div className="flex flex-col gap-1 max-w-[320px] sm:max-w-[400px] md:max-w-[480px] lg:max-w-[580px] xl:max-w-[680px]">
                      <div className="rounded-md border bg-[var(--soc-payload-bg)] px-2.5 py-2" style={{ borderColor: "var(--soc-payload-border)" }}>
                        <div className="text-[9px] font-bold tracking-wider text-cyan-400 uppercase mb-1">CHANGES:</div>
                        <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.4] text-[var(--soc-payload-text)] max-h-[120px] overflow-y-auto scrollbar-thin">
{`File ${evt.syscheckPath}
${evt.syscheckEvent}${evt.fileDiff ? `\n${String(evt.fileDiff).replace(/\\n/g, "\n").replace(/\\u003e/g, "→")}` : ""}`.trim()}
                        </pre>
                      </div>
                      <div className="text-[10px] leading-tight break-words" style={{ color: "var(--soc-text-secondary)" }} title={evt.ruleDescription}>
                        {evt.ruleDescription}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2">{renderSeverityBadge(evt.ruleLevel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-t border-slate-800 bg-slate-900/50 px-4 lg:px-3 py-3 lg:py-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-[10px] md:text-[11px] font-mono text-slate-500">
              <span className="hidden md:inline">SHOWING </span>
              <span className="font-bold text-sky-400">{tableEvents.length === 0 ? 0 : (clientPage - 1) * pageSize + 1}</span>
              <span className="hidden md:inline"> - </span>
              <span className="md:hidden">-</span>
              <span className="font-bold text-sky-400">{Math.min(clientPage * pageSize, tableEvents.length)}</span>
              <span className="hidden md:inline"> OF </span>
              <span className="md:hidden"> / </span>
              <span className="font-bold text-sky-400">{totalEventHits.toLocaleString()}</span>
              <span className="hidden md:inline"> EVENTS</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button disabled={clientPage === 1} onClick={() => setClientPage(1)} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 hover:border-sky-500/50 hover:bg-sky-900/20 disabled:opacity-20">
                <span className="hidden md:inline">FIRST</span><span className="md:hidden">«</span>
              </button>
              <button disabled={clientPage === 1} onClick={() => setClientPage(Math.max(clientPage - 1, 1))} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 hover:border-sky-500/50 hover:bg-sky-900/20 disabled:opacity-20">
                <span className="hidden md:inline">← PREV</span><span className="md:hidden">‹</span>
              </button>
              <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400">
                <span className="hidden md:inline">PAGE </span>
                <span className="text-white">{clientPage}</span> / {totalPages}
              </span>
              <button disabled={clientPage === totalPages} onClick={() => setClientPage(Math.min(clientPage + 1, totalPages))} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 hover:border-sky-500/50 hover:bg-sky-900/20 disabled:opacity-20">
                <span className="hidden md:inline">NEXT →</span><span className="md:hidden">›</span>
              </button>
              <button disabled={clientPage === totalPages} onClick={() => setClientPage(totalPages)} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 hover:border-sky-500/50 hover:bg-sky-900/20 disabled:opacity-20">
                <span className="hidden md:inline">LAST</span><span className="md:hidden">»</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FimEvents;
