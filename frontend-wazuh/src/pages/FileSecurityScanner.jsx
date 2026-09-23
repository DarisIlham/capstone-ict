import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../config/Api";
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
import {
  AlertTriangle,
  Copy,
  Clock,
  ExternalLink,
  Search,
  FileText,
  AlertCircle,
  BarChart3,
  ChevronDown,
  X,
  Users,
  FolderSearch,
  Activity,
  ShieldAlert,
  SlidersHorizontal,
  Bug,
} from "lucide-react";

const API_ROOT = `${API_BASE_URL}/api`;
const DEFAULT_PAGE_SIZE = 25;

const rangeToMinutes = {
  "1h": 60,
  "24h": 1440,
  "7d": 10080,
  "30d": 43200,
};

const rangeToBucketMs = {
  "1h": 5 * 60 * 1000,
  "24h": 60 * 60 * 1000,
  "7d": 6 * 60 * 60 * 1000,
  "30d": 24 * 60 * 60 * 1000,
};

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

// Tooltip position in pixels, contained inside the plot box
const getContainedTooltip = (px, py, width, height, tooltipWidth = 144, tooltipHeight = 56) => {
  const W = Math.max(width, 80);
  const H = Math.max(height, 80);
  const gap = 8;
  const edge = 4;
  const half = tooltipWidth / 2;
  const left = clamp(px, half + edge, Math.max(half + edge, W - half - edge));
  let top = py - gap - tooltipHeight;
  if (top < edge) top = py + 12;
  top = clamp(top, edge, Math.max(edge, H - tooltipHeight - edge));
  return { left, top };
};

const getBucketMsForRange = (rangeKey) => rangeToBucketMs[rangeKey] || rangeToBucketMs["24h"];

const formatBucketLabel = (ms, currentRangeKey) => {
  const date = new Date(ms);
  if (currentRangeKey === "1h") return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (currentRangeKey === "24h") return date.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit" });
  if (currentRangeKey === "7d") return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "2-digit" });
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
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

const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
const severityColors = {
  CRITICAL: "text-red-400 bg-red-500/20",
  HIGH: "text-orange-400 bg-orange-500/20",
  MEDIUM: "text-yellow-400 bg-yellow-500/20",
  LOW: "text-blue-400 bg-blue-500/20",
  INFO: "text-slate-300 bg-slate-500/20",
};

const INDICATOR_SEVERITY_RULES = [
  {
    severity: "CRITICAL",
    keywords: ["eval_call","php_eval","combo_php_eval","combo_remote_loader","web_shell","webshell","php_webshell","shell_exec","system_call","passthru","backdoor","reverse_shell","obfuscated"],
  },
  { severity: "HIGH", keywords: ["php_open_tag","file_get_contents_remote","remote_url","remote_code","remote_include","deserialization","sql_injection","command_injection","path_traversal"] },
  { severity: "MEDIUM", keywords: ["short_url","url_redirect","base64_encoded","suspicious_header","suspicious_metadata","credit_card","api_key"] },
  { severity: "LOW", keywords: ["large_file","unusual_extension","exif_edit","metadata_only"] },
];

function severityFromIndicator(indicator = "") {
  const key = String(indicator).toLowerCase();
  if (!key) return null;
  for (const rule of INDICATOR_SEVERITY_RULES) {
    if (rule.keywords.some((kw) => key === kw || key.includes(kw))) return rule.severity;
  }
  return null;
}

function getDirectory(filePath = "") {
  if (!filePath) return "-";
  const normalized = String(filePath).replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : normalized;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatLiveTimestamp(isoString) {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatTime(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${month} ${day} ${year}, ${hh}:${mm}:${ss}`;
}

function normalizeSeverity(value, fallback = "HIGH") {
  const sev = String(value || fallback).toUpperCase();
  return severityOrder[sev] !== undefined ? sev : fallback;
}

function getNestedValue(source, path) {
  if (!source || !path) return null;
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  const keys = path.split(".");
  let current = source;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return null;
    current = current[key];
  }
  return current ?? null;
}

function normalizeAgentLabel(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized === "-" || /^unknown agent$/i.test(normalized)) return null;
  return normalized;
}

function getFirstAgentValue(source, paths = []) {
  for (const path of paths) {
    const value = normalizeAgentLabel(getNestedValue(source, path));
    if (value) return value;
  }
  return null;
}

function resolveAgentId(source) {
  return getFirstAgentValue(source, ["agentId","agent_id","agent.id","hostId","host_id","host.id"]);
}

function resolveAgentName(source) {
  const label = getFirstAgentValue(source, ["name","agentName","agent_name","agent.name","hostName","host_name","host.name","host.hostname","hostname","data.hostname","observer.hostname"]);
  if (label) return label;
  const agentId = resolveAgentId(source);
  return agentId ? `Agent ${agentId}` : "Unknown agent";
}

function normalizeFinding(finding, index) {
  if (typeof finding === "string") {
    return { name: finding, severity: "HIGH", desc: finding, type: "content_indicator" };
  }
  const raw = finding || {};
  const name = raw.name || raw.indicator || raw.pattern || raw.keyword || raw.source || `Finding ${index + 1}`;
  const desc = raw.description || raw.desc || raw.message || raw.match || raw.value || raw.indicator || name;
  return {
    name,
    severity: normalizeSeverity(raw.severity || raw.risk || raw.level || severityFromIndicator(raw.indicator || raw.pattern || raw.keyword || name), "HIGH"),
    desc: typeof desc === "object" ? JSON.stringify(desc) : String(desc),
    type: raw.type || raw.category || raw.source || "content_indicator",
  };
}

const RISK_SEVERITY_WEIGHTS = { CRITICAL: 30, HIGH: 20, MEDIUM: 10, LOW: 5, INFO: 2 };
const HIGH_RISK_FINDING_TYPES = ["malware","trojan","ransomware","webshell","obfuscation","backdoor","cryptominer","spyware","keylogger","exploit","shellcode","command_injection","credential"];
const HIGH_RISK_INDICATORS = ["base64","eval","wscript","powershell","certutil","meterpreter","/etc/shadow","/etc/passwd","cmd /c","regsvr32","rundll32","ncat","nc ","sshpass","wget -","curl -"];
const RISKY_FILE_TYPES = ["exe","dll","so","sh","bat","cmd","ps1","vbs","js","hta","scr","jar","bin","docm","xlsm","pptm"];

function computeRiskScore(fileContext) {
  const findings = Array.isArray(fileContext.findings) ? fileContext.findings : [];
  const count = Number(fileContext.findingsCount ?? findings.length ?? 0);
  if (count === 0) return 0;
  let score = 0;
  for (const finding of findings) {
    const severity = String(finding.severity || "LOW").toUpperCase();
    let findingScore = RISK_SEVERITY_WEIGHTS[severity] ?? RISK_SEVERITY_WEIGHTS.MEDIUM;
    const findingType = String(finding.type || "").toLowerCase();
    if (HIGH_RISK_FINDING_TYPES.some((type) => findingType.includes(type))) findingScore += 15;
    const findingText = String(`${finding.name} ${finding.desc}`).toLowerCase();
    if (HIGH_RISK_INDICATORS.some((keyword) => findingText.includes(keyword))) findingScore += 10;
    score += findingScore;
  }
  if (score === 0 && count > 0) score = count * RISK_SEVERITY_WEIGHTS.MEDIUM;
  const sourceCount = Number(fileContext.matchedSourcesCount ?? (Array.isArray(fileContext.matchedSources) ? fileContext.matchedSources.length : 0) ?? 0);
  if (sourceCount > 0) score += Math.min(15, sourceCount * 5);
  const urlCount = Array.isArray(fileContext.extractedUrls) ? fileContext.extractedUrls.length : 0;
  if (urlCount > 0) score += Math.min(10, urlCount * 5);
  const fileType = String(fileContext.fileType || "").toLowerCase();
  if (RISKY_FILE_TYPES.includes(fileType)) score += 10;
  if (fileType.includes("exe")) score += 5;
  return Math.min(100, Math.round(score));
}

function normalizeFileScan(item) {
  const findings = Array.isArray(item.findings) ? item.findings.map(normalizeFinding) : [];
  const findingsCount = Number(item.findingsCount ?? findings.length ?? 0);
  const safeFindings = findings.length ? findings : findingsCount > 0 ? [{ name: "Suspicious indicator detected", severity: "HIGH", desc: `${findingsCount} finding(s) reported by scanner`, type: "scanner_result" }] : [];
  const filePath = item.filePath || "";
  const fileName = item.fileName || (filePath ? filePath.split(/[\\/]/).pop() : "Unknown file");
  const fileType = item.fileType || (fileName.includes(".") ? fileName.split(".").pop() : "unknown");
  return {
    id: item.id || `${filePath}-${item.timestamp}`,
    timestamp: item.timestamp,
    agentId: resolveAgentId(item) || "-",
    agentName: resolveAgentName(item),
    logType: item.logType,
    eventType: item.eventType,
    scanner: item.scanner || "file-content-scanner",
    filePath,
    fileName,
    fileType,
    sizeLabel: formatBytes(item.fileSize),
    sha256: item.sha256 || "-",
    md5: item.md5 || "-",
    findingsCount,
    matchedSourcesCount: item.matchedSourcesCount ?? 0,
    matchedSources: Array.isArray(item.matchedSources) ? item.matchedSources : [],
    findings: safeFindings,
    extractedUrls: Array.isArray(item.extractedUrls) ? item.extractedUrls : [],
    error: item.error || "",
    folder: getDirectory(filePath),
    actionStatus: findingsCount > 0 ? "Review / Block" : "No Action",
    riskScore: computeRiskScore({ findings: safeFindings, findingsCount, matchedSourcesCount: item.matchedSourcesCount, matchedSources: item.matchedSources, extractedUrls: item.extractedUrls, fileType }),
  };
}

function buildTimelineFallback(items, rangeKey, startIso, endIso) {
  const bucketMs = getBucketMsForRange(rangeKey);
  const buckets = new Map();
  items.forEach((item) => {
    const ts = new Date(item.timestamp).getTime();
    if (!Number.isFinite(ts)) return;
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  });
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
    const firstBucket = Math.floor(startMs / bucketMs) * bucketMs;
    const lastBucket = Math.floor(endMs / bucketMs) * bucketMs;
    const series = [];
    for (let t = firstBucket; t <= lastBucket; t += bucketMs) series.push({ t, v: buckets.get(t) || 0, bucketMs });
    return series;
  }
  return Array.from(buckets.entries()).sort((a,b)=>a[0]-b[0]).map(([t,v])=>({t,v,bucketMs}));
}

async function fetchJson(url) {
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `Request failed: ${response.status}`);
  return data;
}

const WaveChart = ({ data, color = "#ef4444", rangeKey = "24h", height = 80, compact = false, activePointKey = null, onPointSelect = null }) => {
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
  const baseP = { l: 28, r: 10, t: 8, b: 24 };
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
  const padding = { ...baseP, l: adaptiveLeftGutter([Math.round(maxV)], baseP.l) };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const defaultBucketMs = getBucketMsForRange(rangeKey);
  const isDense = data.length > 30;
  const denseVisualR = isDense ? 2.6 : 3.5;
  const denseHitR = isDense ? 5 : 10;
  const gridSteps = 5;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i += 1) gridLines.push({ value: Math.round((i / (gridSteps - 1)) * maxV), y: padding.t + innerH - (i / (gridSteps - 1)) * innerH, ratio: i / (gridSteps - 1) });
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
        <defs><linearGradient id="waveGradientFileScanner" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor={color} stopOpacity="0.24" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill="url(#waveGradientFileScanner)" />
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
              <circle cx={x} cy={y} r={hitR} fill="transparent" className="cursor-pointer focus:outline-none" style={{ outline: "none" }} role="button" tabIndex={0} aria-label={`Filter file detections for ${formatDetailedTimestamp(pointData.start)}`} onClick={() => onPointSelect?.(pointData)} onMouseEnter={() => setSelectedPoint(pointData)} onMouseLeave={() => setSelectedPoint(null)} onFocus={() => setSelectedPoint(pointData)} onBlur={() => setSelectedPoint(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPointSelect?.(pointData); } }} />
              <circle cx={x} cy={y} r={visualR} fill={isActive ? "#f87171" : color} stroke={isActive ? "#0f172a" : "none"} strokeWidth="2.5" opacity="0.95" className="pointer-events-none" />
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
          <div className="font-semibold text-[var(--soc-text-primary)]">{selectedPoint.value} detections</div>
          <div className="mt-1 text-[var(--soc-text-secondary)]">{formatDetailedTimestamp(selectedPoint.start || selectedPoint.time)}</div>
        </div>
      )}
    </div>
  );
};

// ── KPI Card (kpi-modern seperti FimEvents / MainDashboard) ────────────────
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

// ── File Security Combined Filter (mirror FimCombinedFilter) ───────────────
const FileSecCombinedFilter = ({ agentFilter, onAgentChange, agentOptions = [], typeFilter, onTypeChange, typeOptions = [], severityFilter, onSeverityChange, severityOptions = [], dateFilterLabel = "", onResetDateFilter, timelineFilterLabel = "", onClearTimelineFilter, folderFilterLabel = "", onClearFolderFilter, fileFilterLabel = "", onClearFileFilter }) => {
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
  const activeCount = [agentFilter !== "all", typeFilter !== "all", severityFilter !== "all", Boolean(dateFilterLabel), Boolean(timelineFilterLabel), Boolean(folderFilterLabel), Boolean(fileFilterLabel)].filter(Boolean).length;
  const Section = ({ label, value, allLabel, options, onChange }) => (
    <div className="px-3 py-2">
      <div className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => onChange("all")} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${value === "all" ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{allLabel}</button>
        {options.map((opt) => {
          const { value: optVal, label: optLabel } = normalizeOption(opt);
          return <button key={optVal} onClick={() => onChange(optVal)} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${value === optVal ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}>{optLabel}</button>;
        })}
      </div>
    </div>
  );
  return (
    <div ref={containerRef} className="relative">
      <button ref={buttonRef} type="button" onClick={() => setOpen((c) => !c)} className="flex items-center gap-2 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-2.5 text-[11px] text-[var(--soc-text-primary)] focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-colors hover:bg-[var(--soc-elevated)]">
        <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--soc-text-muted)]" />
        <span className="font-medium">Filters</span>
        {activeCount > 0 && <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500/20 text-red-300 text-[9px] font-bold">{activeCount}</span>}
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--soc-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="fixed z-[9999] w-[280px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] shadow-2xl" style={{ top: coords.top, left: coords.left }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--soc-border)]">
            <span className="text-[10px] font-semibold text-[var(--soc-text-primary)]">Filter Options</span>
            {activeCount > 0 && <button onClick={() => { onAgentChange("all"); onTypeChange("all"); onSeverityChange("all"); if (dateFilterLabel && onResetDateFilter) onResetDateFilter(); if (onClearTimelineFilter) onClearTimelineFilter(); if (onClearFolderFilter) onClearFolderFilter(); if (onClearFileFilter) onClearFileFilter(); }} className="text-[9px] font-semibold text-red-400 hover:text-red-300 transition-colors">Clear all</button>}
          </div>
          {timelineFilterLabel && (
            <div className="border-b border-[var(--soc-border)] px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">Timeline filter</div>
              <div className="mt-1.5 flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-300">
                <Clock className="h-3.5 w-3.5 shrink-0 text-red-400" />
                <span className="min-w-0 flex-1 truncate" title={timelineFilterLabel}>{timelineFilterLabel}</span>
                <button onClick={onClearTimelineFilter} className="shrink-0 hover:text-white" aria-label="Clear timeline filter"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}
          {folderFilterLabel && (
            <div className="border-b border-[var(--soc-border)] px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">Folder filter</div>
              <div className="mt-1.5 flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-300">
                <FolderSearch className="h-3.5 w-3.5 shrink-0 text-red-400" />
                <span className="min-w-0 flex-1 truncate" title={folderFilterLabel}>{folderFilterLabel}</span>
                <button onClick={onClearFolderFilter} className="shrink-0 hover:text-white" aria-label="Clear folder filter"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}
          {fileFilterLabel && (
            <div className="border-b border-[var(--soc-border)] px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">File filter</div>
              <div className="mt-1.5 flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-300">
                <FileText className="h-3.5 w-3.5 shrink-0 text-red-400" />
                <span className="min-w-0 flex-1 truncate" title={fileFilterLabel}>{fileFilterLabel}</span>
                <button onClick={onClearFileFilter} className="shrink-0 hover:text-white" aria-label="Clear file filter"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}
          {dateFilterLabel && <div className="border-b border-[var(--soc-border)] px-3 py-2"><div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--soc-text-muted)]">Timeline date filter</div><div className="mt-1"><span className="block min-w-0 truncate rounded border border-red-500/30 bg-red-500/20 px-2 py-1 text-[10px] font-medium text-red-300" title={dateFilterLabel}>{dateFilterLabel}</span></div></div>}
          <div className="divide-y divide-[var(--soc-border)] max-h-[360px] overflow-y-auto">
            <Section label="Agent" value={agentFilter} allLabel="All agents" options={agentOptions} onChange={onAgentChange} />
            <Section label="Type" value={typeFilter} allLabel="All types" options={typeOptions} onChange={onTypeChange} />
            <Section label="Severity" value={severityFilter} allLabel="All severities" options={severityOptions} onChange={onSeverityChange} />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Bar list (severity / folders / etc) seperti FimEvents ──────────────────
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
                <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)]" title={label}>{label}</span>
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
          <button key={label} type="button" onClick={() => onSelect(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg text-left ${isActive ? "bg-red-500/10 ring-1 ring-red-500/30" : ""}`}>
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
          <button key={label} type="button" onClick={() => onItemClick(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg text-left ${isActive ? "bg-red-500/10 ring-1 ring-red-500/30" : ""}`}>
            {inner}
          </button>
        );
      })}
    </div>
  );
};

const RiskIndicator = ({ severity }) => {
  const sev = normalizeSeverity(severity, "INFO");
  return <span className={`px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold ${severityColors[sev]}`}>{sev}</span>;
};

const RiskScoreBadge = ({ score }) => {
  const value = Number(score || 0);
  const tone = value >= 75 ? "text-red-300 bg-red-500/15 border-red-500/30" : value >= 40 ? "text-amber-300 bg-amber-500/15 border-amber-500/30" : "text-emerald-300 bg-emerald-500/15 border-emerald-500/30";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{value}%</span>;
};

const PaginationControls = ({ pagination, page, pageSize, loading, onPageChange }) => {
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
            <span className="hidden md:inline"> RECORDS</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={page === 1 || loading} onClick={() => onPageChange(1)} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"><span className="hidden md:inline">FIRST</span><span className="md:hidden">«</span></button>
          <button disabled={page === 1 || loading} onClick={() => onPageChange(Math.max(page - 1, 1))} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"><span className="hidden md:inline">← PREV</span><span className="md:hidden">‹</span></button>
          <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400"><span className="hidden md:inline">PAGE </span><span className="text-white">{page}</span> / {totalPages}</span>
          <button disabled={page >= totalPages || loading} onClick={() => onPageChange(Math.min(page + 1, totalPages))} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"><span className="hidden md:inline">NEXT →</span><span className="md:hidden">›</span></button>
          <button disabled={page >= totalPages || loading} onClick={() => onPageChange(totalPages)} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"><span className="hidden md:inline">LAST</span><span className="md:hidden">»</span></button>
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({ title, description }) => (
  <tr>
    <td colSpan={8} className="px-4 py-10 text-center">
      <p className="text-[10px] font-semibold text-[var(--soc-text-secondary)]">{title}</p>
      <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">{description}</p>
    </td>
  </tr>
);

const FileSecurityScanner = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const urlAgent = searchParams.get("agent");
  const urlFocus = searchParams.get("focus");
  const [selectedFile, setSelectedFile] = useState(null);
  const [vtState, setVtState] = useState({ status: "idle", error: null, result: null, scanningHash: null });
  const [copiedText, setCopiedText] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAgent, setFilterAgent] = useState(urlAgent || "all");
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [fileFilter, setFileFilter] = useState("all");
  const [rangeKey, setRangeKey] = useState(() => (urlRange && ["1h", "24h", "7d", "30d"].includes(urlRange) ? urlRange : "24h"));
  const [filterMode, setFilterMode] = useState(() => (urlStart && urlEnd ? "custom" : "range"));
  const [customDateRange, setCustomDateRange] = useState(() => {
    const base = createDefaultDateRange(1);
    if (urlStart && urlEnd) return { start: toDateTimeLocalValue(new Date(urlStart)), end: toDateTimeLocalValue(new Date(urlEnd)) };
    return base;
  });
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  const [timelineChartHeight, setTimelineChartHeight] = useState(250);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(null);
  const topAgentsPanelRef = useRef(null);
  const filesTableRef = useRef(null);

  React.useEffect(() => {
    if (!urlAgent && urlFocus !== "logs") return;
    const id = setTimeout(() => {
      if (filesTableRef.current && typeof filesTableRef.current.scrollIntoView === "function") {
        try { filesTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
      }
    }, 300);
    return () => clearTimeout(id);
  }, [urlAgent, urlFocus, loading]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const filterDateRange = filterMode === "custom" ? getIsoDateRange(normalizeDateRange(customDateRange)) : (() => { const minutes = rangeToMinutes[rangeKey] || 1440; const end = new Date(); const start = new Date(end.getTime() - minutes * 60000); return { start: start.toISOString(), end: end.toISOString() }; })();
      const minutes = filterMode === "custom" ? getDateRangeMinutes(getIsoDateRange(normalizeDateRange(customDateRange))) : rangeToMinutes[rangeKey] || 1440;
      const suspiciousParams = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (filterMode === "custom" && filterDateRange) { suspiciousParams.set("start", filterDateRange.start); suspiciousParams.set("end", filterDateRange.end); }
      else if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) { suspiciousParams.set("start", selectedTimelinePoint.start); suspiciousParams.set("end", selectedTimelinePoint.end); }
      else if (filterDateRange) { suspiciousParams.set("start", filterDateRange.start); suspiciousParams.set("end", filterDateRange.end); }
      const statsParams = new URLSearchParams({ start: filterDateRange.start, end: filterDateRange.end });
      const timelineParams = new URLSearchParams({ minutes: String(minutes), start: filterDateRange.start, end: filterDateRange.end });
      const [suspiciousResponse, statsResponse, timelineResponse] = await Promise.all([
        fetchJson(`${API_ROOT}/file-scans/suspicious?${suspiciousParams.toString()}`),
        fetchJson(`${API_ROOT}/file-scans/stats?${statsParams.toString()}`),
        fetchJson(`${API_ROOT}/file-scans/timeline?${timelineParams.toString()}`),
      ]);
      const normalizedSuspicious = (suspiciousResponse.data || []).map(normalizeFileScan);
      setFiles(normalizedSuspicious);
      setStats(statsResponse.data || null);
      const bucketMs = getBucketMsForRange(rangeKey);
      const mappedTimeline = (timelineResponse.data || []).map((item) => { const ts = new Date(item.timestamp).getTime(); return { t: ts, v: Number(item.suspicious || item.errors || item.total || 0), bucketMs }; }).filter((item) => Number.isFinite(item.t));
      const denseTimeline = (() => {
        const startMs = new Date(filterDateRange.start).getTime();
        const endMs = new Date(filterDateRange.end).getTime();
        const buckets = new Map();
        for (const item of mappedTimeline) { const b = Math.floor(item.t / bucketMs) * bucketMs; buckets.set(b, (buckets.get(b) || 0) + item.v); }
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
          const first = Math.floor(startMs / bucketMs) * bucketMs;
          const last = Math.floor(endMs / bucketMs) * bucketMs;
          const series = [];
          for (let t = first; t <= last; t += bucketMs) series.push({ t, v: buckets.get(t) || 0, bucketMs });
          if (series.length > 0) return series;
        }
        if (buckets.size > 0) return Array.from(buckets.entries()).sort((a,b)=>a[0]-b[0]).map(([t,v])=>({t,v,bucketMs}));
        return buildTimelineFallback(normalizedSuspicious, rangeKey, filterDateRange.start, filterDateRange.end);
      })();
      setTimeline(denseTimeline);
      setPagination(suspiciousResponse.pagination || { page, limit: pageSize, total: normalizedSuspicious.length, totalPages: 1 });
      setLastUpdated(new Date().toISOString());
    } catch (error) {
      console.error(error);
      setLoadError(error.message || "Failed to load file scan data");
    } finally { setLoading(false); }
  }, [page, pageSize, rangeKey, selectedTimelinePoint, filterMode, customDateRange]);

  const handleExportCsv = async () => {
    try {
      const filterDateRange = filterMode === "custom" ? getIsoDateRange(normalizeDateRange(customDateRange)) : (() => { const minutes = rangeToMinutes[rangeKey] || 1440; const end = new Date(); const start = new Date(end.getTime() - minutes * 60000); return { start: start.toISOString(), end: end.toISOString() }; })();
      const start = selectedTimelinePoint?.start || filterDateRange.start;
      const end = selectedTimelinePoint?.end || filterDateRange.end;
      const collected = [];
      for (let pg = 1; pg <= 50; pg++) {
        const params = new URLSearchParams({ page: String(pg), limit: String(100), start, end });
        const response = await fetchJson(`${API_ROOT}/file-scans/suspicious?${params.toString()}`);
        const data = (response.data || []).map(normalizeFileScan);
        collected.push(...data);
        const totalPages = Number(response.pagination?.totalPages || 1);
        if (pg >= totalPages || data.length < 100) break;
      }
      const rows = collected.map((file) => [formatTime(file.timestamp), file.agentName || "-", file.fileName || "-", file.filePath || "-", file.fileType || "-", file.folder || "-", file.scanner || "-", file.sha256 || "-", file.findingsCount ?? 0, file.findings.map((f) => f.severity).join(" | ") || "-", file.findings.map((f) => f.name).join(" | ") || "-", file.riskScore ?? "-"]);
      exportCsv({ filename: `file-security-scans-${new Date().toISOString().slice(0, 10)}.csv`, header: ["Timestamp","Agent","File","Path","Type","Folder","Scanner","SHA-256","Findings","Severities","Findings Detail","Risk Score"], rows });
    } catch (err) { console.error("Export failed:", err); }
  };

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { const interval = setInterval(() => { loadData(); }, 30000); return () => clearInterval(interval); }, [loadData]);
  useEffect(() => { setPage(1); setSelectedTimelinePoint((prev) => (prev?.key === "custom" ? prev : null)); }, [rangeKey]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const isMobile = viewportWidth < 768;
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateTimelineHeight = () => {
      if (isMobile) { setTimelineChartHeight(110); return; }
      const panelHeight = topAgentsPanelRef.current?.getBoundingClientRect().height;
      if (!panelHeight) return;
      const nextHeight = clamp(Math.round(panelHeight - 104), 180, 420);
      setTimelineChartHeight(nextHeight);
    };
    updateTimelineHeight();
    if (typeof ResizeObserver === "undefined" || !topAgentsPanelRef.current) return undefined;
    const observer = new ResizeObserver(() => { updateTimelineHeight(); });
    observer.observe(topAgentsPanelRef.current);
    return () => observer.disconnect();
  }, [isMobile, viewportWidth]);

  const filterOptions = useMemo(() => {
    const agents = new Set();
    const types = new Set();
    files.forEach((file) => {
      if (file.agentName && file.agentName !== "-") agents.add(String(file.agentName));
      if (file.fileType && file.fileType !== "-") types.add(String(file.fileType));
    });
    return { agents: Array.from(agents).sort((a,b)=>a.localeCompare(b)), types: Array.from(types).sort((a,b)=>a.localeCompare(b)) };
  }, [files]);

  const filteredFiles = useMemo(() => {
    let result = files;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((file) => `${file.fileName} ${file.filePath} ${file.sha256} ${file.agentName} ${file.scanner}`.toLowerCase().includes(q));
    }
    if (filterAgent !== "all") result = result.filter((file) => String(file.agentName || "Unknown agent") === filterAgent);
    if (filterType !== "all") result = result.filter((file) => String(file.fileType || "unknown") === filterType);
    if (filterSeverity !== "all") result = result.filter((file) => file.findings.some((finding) => finding.severity === filterSeverity));
    if (folderFilter !== "all") result = result.filter((file) => String(file.folder || "-") === folderFilter);
    if (fileFilter !== "all") result = result.filter((file) => String(file.fileName || "") === fileFilter);
    return result;
  }, [files, searchQuery, filterAgent, filterType, filterSeverity, folderFilter, fileFilter]);

  const analytics = useMemo(() => {
    const severityMap = new Map();
    files.forEach((file) => {
      const maxSeverity = file.findings.reduce((max, finding) => (severityOrder[finding.severity] > severityOrder[max] ? finding.severity : max), "LOW");
      severityMap.set(maxSeverity, (severityMap.get(maxSeverity) || 0) + 1);
    });
    const severities = Array.from(severityMap.entries()).map(([label,value])=>({label,value})).sort((a,b)=>severityOrder[b.label]-severityOrder[a.label]).map((item)=>({...item, color: { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#3b82f6", INFO: "#64748b" }[item.label] || "#64748b"}));
    const folderMap = new Map();
    filteredFiles.forEach((file) => folderMap.set(file.folder, (folderMap.get(file.folder) || 0) + 1));
    const topFolders = Array.from(folderMap.entries()).map(([folder,count])=>({label: folder, value: count, color: "#A855F7"})).sort((a,b)=>b.value-a.value).slice(0,5);
    const fallbackAgentMap = new Map();
    files.forEach((file) => {
      const key = resolveAgentName(file);
      const existing = fallbackAgentMap.get(key) || { name: key, count: 0, lastSeen: null };
      existing.count += 1;
      if (!existing.lastSeen || new Date(file.timestamp).getTime() > new Date(existing.lastSeen).getTime()) existing.lastSeen = file.timestamp || null;
      fallbackAgentMap.set(key, existing);
    });
    const fallbackTopAgents = Array.from(fallbackAgentMap.values()).sort((a,b)=>b.count-a.count || new Date(b.lastSeen||0).getTime()-new Date(a.lastSeen||0).getTime()).slice(0,5);
    const statsTopAgents = (stats?.topAgents || []).map((agent)=>({ name: resolveAgentName(agent), count: Number(agent.count||0), lastSeen: agent.lastSeen || agent.last_seen || null }));
    const hasUsefulStatsTopAgents = statsTopAgents.length > 0 && statsTopAgents.some((agent)=>normalizeAgentLabel(agent.name));
    const topAgents = hasUsefulStatsTopAgents ? statsTopAgents : fallbackTopAgents;
    const fallbackUniqueAgents = new Set(files.map((file)=>resolveAgentName(file))).size;
    const uniqueAgents = Number(hasUsefulStatsTopAgents ? (stats?.uniqueAgents ?? fallbackUniqueAgents) : fallbackUniqueAgents);
    const topSuspiciousFiles = filteredFiles
      .filter((f) => Number(f.findingsCount || 0) > 0)
      .sort((a, b) => (Number(b.findingsCount || 0) - Number(a.findingsCount || 0)) || (Number(b.riskScore || 0) - Number(a.riskScore || 0)))
      .slice(0, 5)
      .map((f, i) => ({ label: f.fileName || String(f.filePath || "").split("/").pop() || "Unknown file", sub: f.filePath, value: Number(f.findingsCount || 0), color: ["#ef4444", "#f97316", "#eab308", "#A855F7", "#3b82f6"][i % 5], fullLabel: f.filePath }));
    return { severities, topFolders, topAgents, uniqueAgents, topSuspiciousFiles };
  }, [stats, files, filteredFiles]);

  const copyToClipboard = (text, type) => { navigator.clipboard.writeText(text || "-"); setCopiedText(type); setTimeout(()=>setCopiedText(null),2000); };
  useEffect(() => { setVtState({ status: "idle", error: null, result: null, scanningHash: null }); }, [selectedFile?.id]);
  const runVirusTotalScan = async () => {
    if (!selectedFile || selectedFile.sha256 === "-") return;
    const scanHash = selectedFile.sha256;
    setVtState({ status: "loading", error: null, result: null, scanningHash: scanHash });
    try {
      const response = await fetch(`${API_BASE_URL}/api/virustotal/report?hash=${encodeURIComponent(scanHash)}`);
      const payload = await response.json().catch(()=>({}));
      if (!payload.success) { setVtState({ status: "error", error: payload.message || `Scan gagal (HTTP ${response.status})`, result: null, scanningHash: scanHash }); return; }
      setVtState({ status: "done", error: null, result: payload.data, scanningHash: scanHash });
    } catch (error) { setVtState({ status: "error", error: error.message || "Gagal menghubungi backend", result: null, scanningHash: scanHash }); }
  };
  const getVirusTotalLink = (sha256) => `https://www.virustotal.com/gui/file/${sha256}`;
  const handleRangeChange = (nextRange) => { setPage(1); setSelectedTimelinePoint(null); setFilterMode("range"); setRangeKey(nextRange); };
  const focusFilesTable = useCallback(() => {
    const el = filesTableRef.current;
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const handleAgentSummaryClick = useCallback((item) => {
    const value = String(item?.name || "all");
    const next = filterAgent === value ? "all" : value;
    setFilterAgent(next);
    if (next !== "all") focusFilesTable();
  }, [filterAgent, focusFilesTable]);
  const handleSeveritySummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const next = filterSeverity === value ? "all" : value;
    setFilterSeverity(next);
    if (next !== "all") focusFilesTable();
  }, [filterSeverity, focusFilesTable]);
  const handleFolderSummaryClick = useCallback((item) => {
    const value = String(item?.label || "all");
    const next = folderFilter === value ? "all" : value;
    setFolderFilter(next);
    if (next !== "all") focusFilesTable();
  }, [folderFilter, focusFilesTable]);
  const handleFileSummaryClick = useCallback((item) => {
    const value = String(item?.label || "");
    const next = fileFilter === value ? "all" : value;
    setFileFilter(next);
    if (next !== "all") focusFilesTable();
  }, [fileFilter, focusFilesTable]);
  const handleTimelinePointSelect = useCallback((point) => {
    if (!point) return;
    const pointKey = String(point.key ?? point.t ?? point.start ?? point);
    const bucketMs = point.bucketMs || getBucketMsForRange(rangeKey);
    const startIso = point.start || new Date(Number(point.t)).toISOString();
    const endIso = point.end || new Date(Number(point.t) + bucketMs - 1).toISOString();
    setPage(1);
    if (selectedTimelinePoint?.key === pointKey) setSelectedTimelinePoint(null);
    else {
      setSelectedTimelinePoint({ key: pointKey, start: startIso, end: endIso, bucketMs, time: point.t });
      if (filesTableRef.current && typeof filesTableRef.current.scrollIntoView === "function") { try { filesTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {} }
    }
  }, [rangeKey, selectedTimelinePoint]);

  if (loading && files.length === 0 && !loadError) {
    return <PageLoader message="Loading..." fullScreen />;
  }

  if (loadError && files.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[11px] text-red-300">{loadError}</div>
      </div>
    );
  }

  const avgRisk = files.length ? Math.round(files.reduce((s,f)=>s+(Number(f.riskScore)||0),0)/files.length) : 0;

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      {/* Header — File Security Scanner (tanpa icon, sejajar FimEvents) */}
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">File Security Scanner</h1>
          <p className="text-[11px] text-[var(--soc-text-muted)] mt-0.5">Real-time file content scanning and suspicious file detection</p>
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
            onChange={(range) => { setPage(1); setSelectedTimelinePoint(null); setCustomDateRange(range); setFilterMode("custom"); }}
          />
          <div className="relative flex items-center bg-[var(--soc-card)] rounded-lg border border-[var(--soc-border)]">
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
                setTimeout(() => {
                  if (filesTableRef.current && typeof filesTableRef.current.scrollIntoView === "function") {
                    try { filesTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
                  }
                }, 100);
              }}
              className="appearance-none bg-transparent py-2 pl-2.5 pr-5 text-[11px] font-medium leading-tight text-[var(--soc-text-primary)] focus:outline-none"
            >
              {[10,25,50,100].map((size)=>(<option key={size} value={size} className="bg-[var(--soc-card)] text-[var(--soc-text-primary)]">{size}</option>))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--soc-text-muted)]" />
          </div>
        </div>
      </div>

      {loadError && files.length > 0 && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-2 text-[11px] text-red-300">Failed to load file scan data: {loadError}<button onClick={() => loadData()} className="ml-3 underline hover:text-red-200">Retry</button></div>
      )}

      {/* KPI Cards — kpi-modern 4 kolom */}
      <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-3">
        <KPICard label="Total Scanned" value={new Intl.NumberFormat("en-US").format(stats?.totalEvents ?? 0)} icon={FileText} color="text-purple-400" desc="scans in range" loading={loading} index={0} />
        <KPICard label="Suspicious" value={new Intl.NumberFormat("en-US").format(stats?.suspiciousScans ?? 0)} icon={AlertTriangle} color="text-pink-400" desc="suspicious detected" loading={loading} index={1} />
        <KPICard label="Clean" value={new Intl.NumberFormat("en-US").format(stats?.cleanScans ?? 0)} icon={ShieldAlert} color="text-cyan-400" desc="clean scans" loading={loading} index={2} />
        <KPICard label="Avg Risk" value={`${avgRisk}%`} icon={Activity} color="text-emerald-400" desc={`${Number(stats?.maxFindings||0)} max findings`} loading={loading} index={3} />
      </div>

      {/* Timeline + Top Agents — xl:grid-cols-3 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 chart-card animate-fadeInUp stagger-1 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-500/10"><Activity className="h-3.5 w-3.5 text-red-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Detection Timeline</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">File scan detections over time. Click a point to filter.</p>
              </div>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[9px] text-[var(--soc-text-muted)]">Last {rangeKey}</div>
              <div className="text-[10px] font-semibold text-[var(--soc-text-muted)]">Updated {formatLiveTimestamp(lastUpdated)}</div>
            </div>
          </div>
          <div className="h-[220px]" style={{ background: "transparent" }}>
            <WaveChart data={timeline} color="#ef4444" rangeKey={rangeKey} height={220} compact={isMobile} activePointKey={selectedTimelinePoint?.key ?? null} onPointSelect={handleTimelinePointSelect} />
          </div>
        </div>
        <div ref={topAgentsPanelRef} className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10"><Users className="h-3.5 w-3.5 text-purple-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Agents</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Most suspicious file findings by agent</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[9px] text-[var(--soc-text-muted)]">Unique agents</span>
            <span className="text-[11px] font-bold text-[var(--soc-text-primary)]">{analytics.uniqueAgents}</span>
          </div>
          <TopAgentsCard agents={analytics.topAgents} onItemClick={handleAgentSummaryClick} activeName={filterAgent !== "all" ? filterAgent : null} />
        </div>
      </div>

      {/* Severity + Top Folders — xl:grid-cols-3 (2 charts, 1 empty flex) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="chart-card animate-fadeInUp stagger-1 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-500/10"><AlertCircle className="h-3.5 w-3.5 text-orange-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Severity Distribution</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Scanned files grouped by detection severity</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-[var(--soc-text-primary)]">{files.length} files</span>
          </div>
          <BarList items={analytics.severities} emptyLabel="No severity data" onSelect={handleSeveritySummaryClick} activeValue={filterSeverity !== "all" ? filterSeverity : null} />
        </div>
        <div className="chart-card animate-fadeInUp stagger-2 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10"><FolderSearch className="h-3.5 w-3.5 text-violet-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top Scanned Folders</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Folders with the most files scanned</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-violet-400">{analytics.topFolders?.length || 0} folders</span>
          </div>
          <BarList items={analytics.topFolders} emptyLabel="No folder data" onSelect={handleFolderSummaryClick} activeValue={folderFilter !== "all" ? folderFilter : null} />
        </div>
        <div className="chart-card animate-fadeInUp stagger-3 flex flex-col" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-500/10"><Bug className="h-3.5 w-3.5 text-red-400" /></div>
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Top 5 Suspicious Files</h3>
                <p className="text-[9px] text-[var(--soc-text-muted)]">Most suspicious files by findings</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-red-400">{analytics.topSuspiciousFiles?.length || 0} files</span>
          </div>
          {(() => {
            const items = analytics.topSuspiciousFiles || [];
            if (!items.length) return <InlineEmptyState title="No suspicious file data" description="No suspicious file activity for the selected time range." />;
            const maxV = Math.max(...items.map((d) => d.value), 1);
            return (
              <div className="w-full min-w-0 max-w-full space-y-1.5">
                {items.map((item, i) => {
                    const isActive = fileFilter !== "all" && String(item.label) === String(fileFilter);
                    const inner = (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-[var(--soc-elevated)] flex items-center justify-center text-[8px] font-bold" style={{ color: item.color }}>{i + 1}</span>
                            <span className="min-w-0 max-w-full truncate text-[10px] font-medium text-[var(--soc-text-secondary)] font-mono" title={item.fullLabel || item.label}>{item.label}</span>
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
                      </>
                    );
                    return (
                      <button key={item.fullLabel || item.label} type="button" onClick={() => handleFileSummaryClick(item)} className={`w-full min-w-0 max-w-full list-item-interactive px-2 py-1 rounded-lg text-left ${isActive ? "bg-red-500/10 ring-1 ring-red-500/30" : ""}`}>
                        {inner}
                      </button>
                    );
                  })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Logs Table — search/filter disamakan dengan FimEvents */}
      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg h-auto overflow-hidden">
        <div ref={filesTableRef} className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
          <div className="flex gap-2 flex-wrap attack-logs-search soc-filter-row items-center">
            <div className="flex-1 min-w-0 basis-full sm:basis-0 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input type="text" value={searchQuery} onChange={(e)=>{ setPage(1); setSearchQuery(e.target.value); }} placeholder="Search current page by file, path, agent, scanner, or SHA-256..." className="w-full pl-10 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500" />
            </div>
            <FileSecCombinedFilter
              agentFilter={filterAgent} onAgentChange={(v)=>{ setPage(1); setFilterAgent(v); }} agentOptions={filterOptions.agents}
              typeFilter={filterType} onTypeChange={(v)=>{ setPage(1); setFilterType(v); }} typeOptions={filterOptions.types}
              severityFilter={filterSeverity} onSeverityChange={(v)=>{ setPage(1); setFilterSeverity(v); }} severityOptions={["CRITICAL","HIGH","MEDIUM","LOW"]}
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
              timelineFilterLabel={selectedTimelinePoint
                ? `${formatDetailedTimestamp(selectedTimelinePoint.start)}${selectedTimelinePoint.end ? ` - ${formatDetailedTimestamp(selectedTimelinePoint.end)}` : ""}`
                : ""}
              onClearTimelineFilter={() => { setSelectedTimelinePoint(null); setPage(1); }}
              folderFilterLabel={folderFilter !== "all" ? String(folderFilter) : ""}
              onClearFolderFilter={() => setFolderFilter("all")}
              fileFilterLabel={fileFilter !== "all" ? String(fileFilter) : ""}
              onClearFileFilter={() => setFileFilter("all")}
            />
            <ExportCsvButton accent="red" onClick={handleExportCsv} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[10px] md:text-[11px] text-left">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/70">
                {["time","agent","file","type","file path","severity","findings","action"].map((h)=>(
                  <th key={h} className="px-2 md:px-4 lg:px-3 py-2 md:py-3 lg:py-2 text-[9px] md:text-[11px] lg:text-[10px] font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">Loading file scans...</td></tr>
              ) : filteredFiles.length === 0 ? (
                <EmptyState
                  title="No suspicious file scan data"
                  description="No suspicious file scan data found on this page."
                />
              ) : filteredFiles.map((file, idx) => {
                const maxSeverity = file.findings.reduce((max, finding)=>(severityOrder[finding.severity] > severityOrder[max.severity] ? finding : max), file.findings[0]);
                return (
                  <tr key={file.id} className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${idx % 2 !== 0 ? "bg-slate-900/60" : ""}`}>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-slate-500 text-[10px] md:text-[11px] lg:text-[10px] whitespace-nowrap">{formatTime(file.timestamp)}</td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-sky-400 font-medium text-[10px] md:text-[11px] lg:text-[10px]"><div className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={file.agentName}>{file.agentName}</div></td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">{String(file.fileType || "?").charAt(0).toUpperCase()}</div>
                        <div className="min-w-0 max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px]">
                          <div className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sky-300 text-[10px] md:text-[11px]" title={file.fileName}>{file.fileName}</div>
                          <div className="text-[9px] md:text-[10px] text-slate-500">{file.sizeLabel}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-[10px] md:text-[11px] text-slate-400">{file.fileType}</td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px]">
                      <div className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] md:text-[11px] text-amber-300" title={file.filePath}>{file.filePath || "-"}</div>
                    </td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2"><RiskIndicator severity={maxSeverity?.severity || "HIGH"} /></td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2 text-[10px] md:text-[11px]"><span className="text-slate-300 font-mono">{file.findingsCount} found</span></td>
                    <td className="px-2 md:px-4 lg:px-3 py-1.5 md:py-3 lg:py-2">
                      <button onClick={()=>setSelectedFile(file)} className="px-3 py-1.5 rounded text-[10px] md:text-[11px] font-medium transition-colors flex items-center gap-1 bg-red-500/10 text-red-300 hover:bg-red-500/20"><FileText className="h-3.5 w-3.5" />Detail</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationControls pagination={pagination} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} />
      </div>

      {selectedFile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-700 rounded flex items-center justify-center text-xs font-bold text-slate-300">{String(selectedFile.fileType || "?").charAt(0).toUpperCase()}</div>
                <div><h2 className="text-base font-bold text-slate-100">{selectedFile.fileName}</h2><p className="text-[11px] text-slate-500 mt-0.5">Forensic Analysis Report</p></div>
              </div>
              <button onClick={()=>setSelectedFile(null)} className="text-slate-400 hover:text-slate-200 text-xl">✕</button>
            </div>
            <div className="p-3 md:p-4 space-y-4">
              <div>
                <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> File Metadata</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-700/30 rounded-lg p-3 border border-slate-700">
                  <div><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Detected</p><p className="text-xs text-slate-100">{selectedFile.timestamp ? new Date(selectedFile.timestamp).toLocaleString() : "-"}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Agent</p><p className="text-xs text-slate-100">{selectedFile.agentName || "Unknown agent"}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">File Type</p><p className="text-xs text-slate-100">{selectedFile.fileType}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Size</p><p className="text-xs text-slate-100">{selectedFile.sizeLabel}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">File Risk Score</p><RiskScoreBadge score={selectedFile.riskScore} /></div>
                  <div className="md:col-span-2"><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">File Path</p><p className="text-xs font-mono text-amber-300 break-all">{selectedFile.filePath || "-"}</p></div>
                </div>
              </div>
              <div>
                <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> File Hashes</h3>
                <div className="space-y-2 bg-slate-700/30 rounded-lg p-3 border border-slate-700">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1.5">SHA-256</p>
                    <div className="flex items-center gap-2 bg-slate-800/50 rounded p-2">
                      <code className="text-[11px] text-slate-300 font-mono flex-1 break-all">{selectedFile.sha256}</code>
                      <button onClick={()=>copyToClipboard(selectedFile.sha256, "sha256")} className={`p-1.5 rounded transition-colors ${copiedText === "sha256" ? "bg-green-500/30 text-green-300" : "bg-slate-600/30 text-slate-400 hover:bg-slate-600"}`}><Copy className="h-3.5 w-3.5" /></button>
                      {selectedFile.sha256 !== "-" && (<a href={getVirusTotalLink(selectedFile.sha256)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-slate-600/30 text-slate-400 hover:text-sky-400 transition-colors"><ExternalLink className="h-3.5 w-3.5" /></a>)}
                    </div>
                  </div>
                </div>
              </div>
              {selectedFile.error ? (<div><h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><AlertCircle className="h-3.5 w-3.5" /> Error Detail</h3><div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-xs text-orange-200 break-all">{selectedFile.error}</div></div>) : null}
              <div>
                <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Detected Indicators ({selectedFile.findings.length})</h3>
                <div className="space-y-2">
                  {selectedFile.findings.length === 0 ? (<div className="bg-slate-700/30 rounded-lg p-3 border border-slate-700 text-xs text-slate-400">No indicators reported.</div>) : (selectedFile.findings.map((finding, idx) => (<div key={`${finding.name}-${idx}`} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3"><div className="flex items-start justify-between gap-3"><div className="flex-1"><div className="flex items-center gap-2"><p className="text-xs font-semibold text-slate-100">{finding.name}</p><RiskIndicator severity={finding.severity} /></div><p className="text-xs text-slate-400 mt-1">{finding.desc}</p><p className="text-[11px] text-slate-500 mt-1.5 font-mono">{finding.type}</p></div></div></div>)))}
                </div>
              </div>
              {selectedFile.extractedUrls.length > 0 && (<div><h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><ExternalLink className="h-3.5 w-3.5" /> Extracted URLs ({selectedFile.extractedUrls.length})</h3><div className="space-y-2">{selectedFile.extractedUrls.map((url, idx) => (<div key={`${url}-${idx}`} className="bg-slate-700/30 rounded-lg p-2 border border-slate-700 flex items-center justify-between gap-3"><code className="text-[11px] text-slate-300 font-mono flex-1 break-all">{url}</code><a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-sky-400 transition-colors flex-shrink-0"><ExternalLink className="h-3.5 w-3.5" /></a></div>))}</div></div>)}
              {selectedFile.matchedSources.length > 0 && (<div><h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3">Matched Sources ({selectedFile.matchedSources.length})</h3><div className="space-y-2">{selectedFile.matchedSources.map((source, idx) => (<div key={`${source}-${idx}`} className="bg-slate-700/30 rounded-lg p-2 border border-slate-700"><p className="text-xs text-slate-300 font-mono break-all">{typeof source === "object" ? JSON.stringify(source) : source}</p></div>))}</div></div>)}
              <div>
                <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3">Recommended Actions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button onClick={runVirusTotalScan} disabled={selectedFile.sha256 === "-" || vtState.status === "loading"} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><ExternalLink className="h-3.5 w-3.5" />{vtState.status === "loading" ? "Scanning..." : "Scan with VirusTotal"}</button>
                  <button onClick={()=>copyToClipboard(JSON.stringify(selectedFile, null, 2), "export")} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 ${copiedText === "export" ? "bg-green-600/30 text-green-300" : "bg-slate-700 hover:bg-slate-600"}`}><Copy className="h-3.5 w-3.5" /> {copiedText === "export" ? "Copied!" : "Copy JSON"}</button>
                </div>
                {vtState.status === "loading" && (<div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-300">Checking hash {vtState.scanningHash} on VirusTotal...</div>)}
                {vtState.error && (<div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{vtState.error}</div>)}
                {vtState.status === "done" && vtState.result && (
                  <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${vtState.result.stats.malicious > 0 ? "border-red-500/40 bg-red-500/10 text-red-300" : vtState.result.stats.suspicious > 0 ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>{vtState.result.stats.malicious}/{vtState.result.stats.total} malicious</span>
                      {vtState.result.threatLabel && (<span className="text-[11px] text-slate-300 truncate">Threat: {vtState.result.threatLabel}</span>)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400"><span>Suspicious: {vtState.result.stats.suspicious}</span><span>Harmless: {vtState.result.stats.harmless}</span><span>Undetected: {vtState.result.stats.undetected}</span><span>Engine count: {vtState.result.stats.total}</span></div>
                    {vtState.result.analyzedAt && (<div className="mt-1 text-[10px] text-slate-500">Last analyzed: {formatTime(new Date(vtState.result.analyzedAt * 1000).toISOString())}</div>)}
                    <a href={vtState.result.reportUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition-colors"><ExternalLink className="h-3 w-3" /> Open full VirusTotal report</a>
                  </div>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-4 py-3 flex justify-end gap-3"><button onClick={()=>setSelectedFile(null)} className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors text-xs font-medium">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileSecurityScanner;
