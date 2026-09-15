import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../config/Api";
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
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Search,
  Bug,
  FileText,
  AlertCircle,
  BarChart3,
  ChevronDown,
  CalendarRange,
  X,
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

// Tooltip position in pixels, contained inside the plot box that the
// tooltip is absolutely positioned against (the relative SVG wrapper).
const getContainedTooltip = (px, py, width, height, tooltipWidth = 144, tooltipHeight = 56) => {
  const W = Math.max(width, 80);
  const H = Math.max(height, 80);
  const gap = 8;
  const edge = 4;
  const half = tooltipWidth / 2;
  const left = clamp(px, half + edge, Math.max(half + edge, W - half - edge));
  let below = false;
  let top = py - gap - tooltipHeight;
  if (top < edge) {
    below = true;
    top = py + 12;
  }
  top = clamp(top, edge, Math.max(edge, H - tooltipHeight - edge));
  return { left, top, below };
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
    keywords: [
      "eval_call",
      "php_eval",
      "combo_php_eval",
      "combo_remote_loader",
      "web_shell",
      "webshell",
      "php_webshell",
      "shell_exec",
      "system_call",
      "passthru",
      "backdoor",
      "reverse_shell",
      "obfuscated",
    ],
  },
  {
    severity: "HIGH",
    keywords: [
      "php_open_tag",
      "file_get_contents_remote",
      "remote_url",
      "remote_code",
      "remote_include",
      "deserialization",
      "sql_injection",
      "command_injection",
      "path_traversal",
    ],
  },
  {
    severity: "MEDIUM",
    keywords: ["short_url", "url_redirect", "base64_encoded", "suspicious_header", "suspicious_metadata", "credit_card", "api_key"],
  },
  {
    severity: "LOW",
    keywords: ["large_file", "unusual_extension", "exif_edit", "metadata_only"],
  },
];

function severityFromIndicator(indicator = "") {
  const key = String(indicator).toLowerCase();
  if (!key) return null;

  for (const rule of INDICATOR_SEVERITY_RULES) {
    if (rule.keywords.some((kw) => key === kw || key.includes(kw))) {
      return rule.severity;
    }
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
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
    if (current == null || typeof current !== "object") {
      return null;
    }
    current = current[key];
  }

  return current ?? null;
}

function normalizeAgentLabel(value) {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  if (!normalized || normalized === "-" || /^unknown agent$/i.test(normalized)) {
    return null;
  }

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
  return getFirstAgentValue(source, [
    "agentId",
    "agent_id",
    "agent.id",
    "hostId",
    "host_id",
    "host.id",
  ]);
}

function resolveAgentName(source) {
  const label = getFirstAgentValue(source, [
    "name",
    "agentName",
    "agent_name",
    "agent.name",
    "hostName",
    "host_name",
    "host.name",
    "host.hostname",
    "hostname",
    "data.hostname",
    "observer.hostname",
  ]);

  if (label) return label;

  const agentId = resolveAgentId(source);
  return agentId ? `Agent ${agentId}` : "Unknown agent";
}

function normalizeFinding(finding, index) {
  if (typeof finding === "string") {
    return {
      name: finding,
      severity: "HIGH",
      desc: finding,
      type: "content_indicator",
    };
  }

  const raw = finding || {};
  const name = raw.name || raw.indicator || raw.pattern || raw.keyword || raw.source || `Finding ${index + 1}`;
  const desc = raw.description || raw.desc || raw.message || raw.match || raw.value || raw.indicator || name;

  return {
    name,
    severity: normalizeSeverity(
      raw.severity || raw.risk || raw.level || severityFromIndicator(raw.indicator || raw.pattern || raw.keyword || name),
      "HIGH"
    ),
    desc: typeof desc === "object" ? JSON.stringify(desc) : String(desc),
    type: raw.type || raw.category || raw.source || "content_indicator",
  };
}

const RISK_SEVERITY_WEIGHTS = { CRITICAL: 30, HIGH: 20, MEDIUM: 10, LOW: 5, INFO: 2 };

const HIGH_RISK_FINDING_TYPES = [
  "malware",
  "trojan",
  "ransomware",
  "webshell",
  "obfuscation",
  "backdoor",
  "cryptominer",
  "spyware",
  "keylogger",
  "exploit",
  "shellcode",
  "command_injection",
  "credential",
];

const HIGH_RISK_INDICATORS = [
  "base64",
  "eval",
  "wscript",
  "powershell",
  "certutil",
  "meterpreter",
  "/etc/shadow",
  "/etc/passwd",
  "cmd /c",
  "regsvr32",
  "rundll32",
  "ncat",
  "nc ",
  "sshpass",
  "wget -",
  "curl -",
];

const RISKY_FILE_TYPES = ["exe", "dll", "so", "sh", "bat", "cmd", "ps1", "vbs", "js", "hta", "scr", "jar", "bin", "docm", "xlsm", "pptm"];

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

  const sourceCount = Number(
    fileContext.matchedSourcesCount ??
      (Array.isArray(fileContext.matchedSources) ? fileContext.matchedSources.length : 0) ??
      0
  );
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
  const safeFindings = findings.length
    ? findings
    : findingsCount > 0
      ? [
        {
          name: "Suspicious indicator detected",
          severity: "HIGH",
          desc: `${findingsCount} finding(s) reported by scanner`,
          type: "scanner_result",
        },
      ]
      : [];

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
    riskScore: computeRiskScore({
      findings: safeFindings,
      findingsCount,
      matchedSourcesCount: item.matchedSourcesCount,
      matchedSources: item.matchedSources,
      extractedUrls: item.extractedUrls,
      fileType,
    }),
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

    for (let t = firstBucket; t <= lastBucket; t += bucketMs) {
      series.push({ t, v: buckets.get(t) || 0, bucketMs });
    }

    return series;
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ t, v, bucketMs }));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Request failed: ${response.status}`);
  }

  return data;
}

const WaveChart = ({
  data,
  color = "#ef4444",
  rangeKey = "24h",
  height = 80,
  compact = false,
  activePointKey = null,
  onPointSelect = null,
}) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
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

  if (!width || !height) {
    return <div ref={rootRef} className="relative h-full w-full" />;
  }

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
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const defaultBucketMs = getBucketMsForRange(rangeKey);
  const isDense = data.length > 30;
  const denseVisualR = isDense ? 2.6 : 3.5;
  const denseHitR = isDense ? 5 : 10;

  const gridSteps = 5;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i += 1) {
    const ratio = i / (gridSteps - 1);
    gridLines.push({
      value: Math.round(ratio * maxV),
      y: padding.t + innerH - ratio * innerH,
      ratio,
    });
  }

  let pathD = "";
  for (let i = 0; i < data.length; i += 1) {
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
        <defs>
          <linearGradient id="waveGradientFileScanner" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill="url(#waveGradientFileScanner)" />

        {data.map((d, i) => {
          const x = padding.l + i * pointSpacing;
          const y = padding.t + innerH - (d.v / maxV) * innerH;
          const pointKey = String(d.key ?? d.t);
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
          const isActive =
            activePointKey !== null && typeof activePointKey !== "undefined"
              ? String(activePointKey) === pointKey
              : false;
          const isHighlighted = isHovered || isActive;
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
                aria-label={`Filter file detections for ${formatDetailedTimestamp(pointData.start)}`}
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
                fill={isActive ? "#f87171" : color}
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
                fontSize="10"
                fill="#64748b"
                fontWeight="500"
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
          <div className="font-semibold text-white">{selectedPoint.value} detections</div>
          <div className="mt-1 text-slate-400">{formatDetailedTimestamp(selectedPoint.start || selectedPoint.time)}</div>
        </div>
      )}
    </div>
  );
};

const Donut = ({ items, size = 120, stroke = 12, centerLabelTop, centerLabelBottom }) => {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size / 2} ${size / 2})`}>
        <circle r={r} fill="transparent" stroke="var(--soc-border)" strokeWidth={stroke} />
        {items.map((it, idx) => {
          const currentOffset = items.slice(0, idx).reduce((acc, prev) => acc + (prev.value / total) * c, 0);
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
        <text y={-3} textAnchor="middle" fontSize="11" fill="#f1f5f9" fontWeight="700">
          {centerLabelTop}
        </text>
        <text y={10} textAnchor="middle" fontSize="8" fill="#64748b">
          {centerLabelBottom}
        </text>
      </g>
    </svg>
  );
};

const Legend = ({ items }) => (
  <div className="flex flex-col gap-1.5 items-center">
    {items.length === 0 ? (
      <div className="text-xs text-slate-500">No data available</div>
    ) : (
      items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
          <span className="truncate max-w-[120px]">{it.label}</span>
          <span className="text-slate-500 tabular-nums">{it.value}</span>
        </div>
      ))
    )}
  </div>
);

const CategoryLineChart = ({ items, totalLabel = "items" }) => {
  const [selected, setSelected] = useState(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState({ width: 1000, height: 210 });
  // Responsive plot padding (presentation only): reclaim horizontal space
  // on narrow phones so the line itself stays wide enough to read.
  const narrowPlot = size.width < 480;
  const padding = narrowPlot
    ? { l: 34, r: 16, t: 12, b: 42 }
    : { l: 56, r: 56, t: 12, b: 42 };

  // Keep the measured plot size fresh (see PayloadWordCloud): the SVG
  // viewBox and the hover tooltip both assume these match the live box.
  const syncSize = useCallback(() => {
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height }
      );
    }
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    syncSize();
    const raf = requestAnimationFrame(() => syncSize());
    const observer = new ResizeObserver(syncSize);
    observer.observe(node);
    window.addEventListener("resize", syncSize);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", syncSize);
    };
  }, [syncSize, items]);

  const width = size.width;
  const height = size.height;
  if (!items || items.length === 0) {
    return (
      <div className="flex m-auto items-center justify-center px-2 py-10 text-center text-[11px] text-slate-500">
        No data available
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
  // 8% headroom so the peak never touches the top edge (gridlines keep
  // their nice round values; only plotted points sit slightly lower).
  const yFor = (v) => padding.t + innerH - (v / maxV) * innerH * 0.92;

  const points = sorted.map((it, i) => ({
    x: xFor(i),
    y: yFor(it.value),
    label: it.label,
    value: it.value,
    color: it.color,
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
      <div ref={rootRef} className="relative w-full cat-chart-plot">
        {/* "meet" keeps axis/legend glyphs proportional (never gepeng):
            the viewBox always matches this box via ResizeObserver. */}
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block">
          {gridLines.map((grid, idx) => (
            <g key={`grid-${idx}`}>
              <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="var(--soc-border)" strokeWidth="1" opacity={grid.y === padding.t || grid.y === padding.t + innerH ? "1" : "0.5"} />
              <text x={padding.l - 6} y={grid.y + 3} textAnchor="end" fontSize="11" fill="var(--soc-text-muted)" fontWeight="600">
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
            // Keep edge labels inside the SVG box: shift the centered label
            // so its estimated half-width never crosses the box border.
            const halfLabel = Math.ceil(String(p.label ?? "").length * 5.4 / 2) + 3;
            const labelX = clamp(p.x, halfLabel + 2, Math.max(halfLabel + 2, width - halfLabel - 2));
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
                <text x={labelX} y={padding.t + innerH + 18} textAnchor="middle" fontSize="10" fill="var(--soc-text-muted)" fontWeight="500">{p.label}</text>
              </g>
            );
          })}
        </svg>
        {selected &&
          (() => {
            const pos = getContainedTooltip(selected.x, selected.y, width, height);
            return (
              <div
                className="pointer-events-none absolute z-20 min-w-[110px] max-w-[180px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-xl"
                style={{
                  left: `${pos.left}px`,
                  top: `${pos.top}px`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="font-semibold text-slate-300 break-words">{selected.label}</div>
                <div className="mt-1 text-slate-500">{selected.value} {totalLabel}</div>
              </div>
            );
          })()}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-center px-1 mt-1">
        {points.map((p) => (
          <div key={`${p.label}-${p.index}`} className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="whitespace-nowrap">{p.label}</span>
            <span className="text-slate-500 font-mono">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const CompactBarChart = ({ items, emptyLabel = "No data available" }) => {
  if (!items || items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-600">
        {emptyLabel}
      </div>
    );
  }

  const maxValue = Math.max(...items.map((d) => d.value), 1);

  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={item.label} className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="w-4 text-[11px] font-bold text-slate-500 shrink-0">
              {i + 1}.
            </span>
            <span className="flex-1 min-w-0 text-[11px] font-mono text-slate-400 truncate" title={item.label}>
              {item.label}
            </span>
            <span className="text-[12px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
              {item.value}x
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-4 shrink-0" />
            <div
              className="flex-1 bg-[var(--soc-elevated)] border border-[var(--soc-border-strong)] rounded h-4 overflow-hidden"
              title={`${item.label}: ${item.value} hits`}
            >
              <div
                className="h-full rounded transition-all"
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

const TOP_AGENT_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];

const TopAgentsCard = ({ agents }) => {
  if (!agents || agents.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-600">No agent data</div>;
  }
  const maxValue = Math.max(...agents.map((a) => Number(a.count) || 0), 1);
  const COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];
  return (
    <div className="flex flex-col gap-3">
      {agents.map((item, i) => {
        const color = COLORS[i % COLORS.length];
        const label = item.name || "Unknown agent";
        const value = Number(item.count) || 0;
        return (
          <div key={label} className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 text-[13px] font-bold text-slate-500 shrink-0">
                {i + 1}.
              </span>
              <span className="flex-1 min-w-0 text-[13px] font-mono text-slate-300 truncate" title={label}>
                {label}
              </span>
              <span className="text-[13px] font-bold text-slate-400 tabular-nums shrink-0 ml-1">
                {new Intl.NumberFormat("en-US").format(value)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 shrink-0" />
              <div
                className="flex-1 bg-[var(--soc-bg)] rounded h-4 overflow-hidden"
                title={item.lastSeen ? `Last seen ${formatLiveTimestamp(item.lastSeen)}` : `${label}: ${value} findings`}
              >
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(value / maxValue) * 100}%`,
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

const RiskIndicator = ({ severity }) => {
  const sev = normalizeSeverity(severity, "INFO");
  return <span className={`px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold ${severityColors[sev]}`}>{sev}</span>;
};

const RiskScoreBadge = ({ score }) => {
  const value = Number(score || 0);
  const tone =
    value >= 75
      ? "text-red-300 bg-red-500/15 border-red-500/30"
      : value >= 40
        ? "text-amber-300 bg-amber-500/15 border-amber-500/30"
        : "text-emerald-300 bg-emerald-500/15 border-emerald-500/30";

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
          <button
            disabled={page === 1 || loading}
            onClick={() => onPageChange(1)}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">FIRST</span>
            <span className="md:hidden">«</span>
          </button>
          <button
            disabled={page === 1 || loading}
            onClick={() => onPageChange(Math.max(page - 1, 1))}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">← PREV</span>
            <span className="md:hidden">‹</span>
          </button>
          <span className="px-1 text-[10px] md:text-[11px] font-black text-slate-400">
            <span className="hidden md:inline">PAGE </span>
            <span className="text-white">{page}</span> / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(Math.min(page + 1, totalPages))}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">NEXT →</span>
            <span className="md:hidden">›</span>
          </button>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(totalPages)}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
          >
            <span className="hidden md:inline">LAST</span>
            <span className="md:hidden">»</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({ message }) => (
  <tr>
    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
      {message}
    </td>
  </tr>
);

const FileSecurityScanner = () => {
  const [searchParams] = useSearchParams();
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRange = searchParams.get("rangeKey");
  const [selectedFile, setSelectedFile] = useState(null);
  const [vtState, setVtState] = useState({ status: "idle", error: null, result: null, scanningHash: null });
  const [copiedText, setCopiedText] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [rangeKey, setRangeKey] = useState(() =>
    urlRange && ["1h", "24h", "7d", "30d"].includes(urlRange) ? urlRange : "24h"
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
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [timelineChartHeight, setTimelineChartHeight] = useState(250);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(() =>
    urlStart && urlEnd ? { key: "custom", start: urlStart, end: urlEnd } : null
  );
  const topAgentsPanelRef = useRef(null);
  const filesTableRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const filterDateRange =
        filterMode === "custom"
          ? getIsoDateRange(normalizeDateRange(customDateRange))
          : (() => {
            const minutes = rangeToMinutes[rangeKey] || 1440;
            const end = new Date();
            const start = new Date(end.getTime() - minutes * 60000);
            return { start: start.toISOString(), end: end.toISOString() };
          })();
      const minutes =
        filterMode === "custom"
          ? getDateRangeMinutes(getIsoDateRange(normalizeDateRange(customDateRange)))
          : rangeToMinutes[rangeKey] || 1440;
      const suspiciousParams = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (filterMode === "custom" && filterDateRange) {
        suspiciousParams.set("start", filterDateRange.start);
        suspiciousParams.set("end", filterDateRange.end);
      } else if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
        suspiciousParams.set("start", selectedTimelinePoint.start);
        suspiciousParams.set("end", selectedTimelinePoint.end);
      } else if (filterDateRange) {
        suspiciousParams.set("start", filterDateRange.start);
        suspiciousParams.set("end", filterDateRange.end);
      }

      const statsParams = new URLSearchParams({
        start: filterDateRange.start,
        end: filterDateRange.end,
      });
      const timelineParams = new URLSearchParams({
        minutes: String(minutes),
        start: filterDateRange.start,
        end: filterDateRange.end,
      });

      const [suspiciousResponse, statsResponse, timelineResponse] = await Promise.all([
        fetchJson(`${API_ROOT}/file-scans/suspicious?${suspiciousParams.toString()}`),
        fetchJson(`${API_ROOT}/file-scans/stats?${statsParams.toString()}`),
        fetchJson(`${API_ROOT}/file-scans/timeline?${timelineParams.toString()}`),
      ]);

      const normalizedSuspicious = (suspiciousResponse.data || []).map(normalizeFileScan);

      setFiles(normalizedSuspicious);
      setStats(statsResponse.data || null);
      const bucketMs = getBucketMsForRange(rangeKey);
      const mappedTimeline = (timelineResponse.data || [])
        .map((item) => {
          const ts = new Date(item.timestamp).getTime();
          return {
            t: ts,
            v: Number(item.suspicious || item.errors || item.total || 0),
            bucketMs,
          };
        })
        .filter((item) => Number.isFinite(item.t));

      const denseTimeline = (() => {
        const startMs = new Date(filterDateRange.start).getTime();
        const endMs = new Date(filterDateRange.end).getTime();
        const buckets = new Map();
        for (const item of mappedTimeline) {
          const b = Math.floor(item.t / bucketMs) * bucketMs;
          buckets.set(b, (buckets.get(b) || 0) + item.v);
        }
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
          const first = Math.floor(startMs / bucketMs) * bucketMs;
          const last = Math.floor(endMs / bucketMs) * bucketMs;
          const series = [];
          for (let t = first; t <= last; t += bucketMs) {
            series.push({ t, v: buckets.get(t) || 0, bucketMs });
          }
          if (series.length > 0) return series;
        }
        if (buckets.size > 0) {
          return Array.from(buckets.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([t, v]) => ({ t, v, bucketMs }));
        }
        return buildTimelineFallback(normalizedSuspicious, rangeKey, filterDateRange.start, filterDateRange.end);
      })();

      setTimeline(denseTimeline);

      setPagination(
        suspiciousResponse.pagination || {
          page,
          limit: pageSize,
          total: normalizedSuspicious.length,
          totalPages: 1,
        }
      );
      setLastUpdated(new Date().toISOString());
    } catch (error) {
      console.error(error);
      setLoadError(error.message || "Failed to load file scan data");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, rangeKey, selectedTimelinePoint, filterMode, customDateRange]);

  const handleExportCsv = async () => {
    try {
      const filterDateRange =
        filterMode === "custom"
          ? getIsoDateRange(normalizeDateRange(customDateRange))
          : (() => {
            const minutes = rangeToMinutes[rangeKey] || 1440;
            const end = new Date();
            const start = new Date(end.getTime() - minutes * 60000);
            return { start: start.toISOString(), end: end.toISOString() };
          })();
      const start = selectedTimelinePoint?.start || filterDateRange.start;
      const end = selectedTimelinePoint?.end || filterDateRange.end;
      const collected = [];
      for (let pg = 1; pg <= 50; pg++) {
        const params = new URLSearchParams({
          page: String(pg),
          limit: String(100),
          start,
          end,
        });
        const response = await fetchJson(`${API_ROOT}/file-scans/suspicious?${params.toString()}`);
        const data = (response.data || []).map(normalizeFileScan);
        collected.push(...data);
        const totalPages = Number(response.pagination?.totalPages || 1);
        if (pg >= totalPages || data.length < 100) break;
      }
      const rows = collected.map((file) => [
        formatTime(file.timestamp),
        file.agentName || "-",
        file.fileName || "-",
        file.filePath || "-",
        file.fileType || "-",
        file.folder || "-",
        file.scanner || "-",
        file.sha256 || "-",
        file.findingsCount ?? 0,
        file.findings.map((f) => f.severity).join(" | ") || "-",
        file.findings.map((f) => f.name).join(" | ") || "-",
        file.riskScore ?? "-",
      ]);
      exportCsv({
        filename: `file-security-scans-${new Date().toISOString().slice(0, 10)}.csv`,
        header: ["Timestamp", "Agent", "File", "Path", "Type", "Folder", "Scanner", "SHA-256", "Findings", "Severities", "Findings Detail", "Risk Score"],
        rows,
      });
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    setPage(1);
    setSelectedTimelinePoint((prev) => (prev?.key === "custom" ? prev : null));
  }, [rangeKey]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = viewportWidth < 768;

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

  const filterOptions = useMemo(() => {
    const agents = new Set();
    const types = new Set();
    files.forEach((file) => {
      if (file.agentName && file.agentName !== "-") agents.add(String(file.agentName));
      if (file.fileType && file.fileType !== "-") types.add(String(file.fileType));
    });
    return {
      agents: Array.from(agents).sort((a, b) => a.localeCompare(b)),
      types: Array.from(types).sort((a, b) => a.localeCompare(b)),
    };
  }, [files]);

  const filteredFiles = useMemo(() => {
    let result = files;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((file) =>
        `${file.fileName} ${file.filePath} ${file.sha256} ${file.agentName} ${file.scanner}`.toLowerCase().includes(q)
      );
    }
    if (filterAgent !== "all") {
      result = result.filter((file) => String(file.agentName || "Unknown agent") === filterAgent);
    }
    if (filterType !== "all") {
      result = result.filter((file) => String(file.fileType || "unknown") === filterType);
    }
    if (filterSeverity !== "all") {
      result = result.filter((file) => file.findings.some((finding) => finding.severity === filterSeverity));
    }
    return result;
  }, [files, searchQuery, filterAgent, filterType, filterSeverity]);

  const analytics = useMemo(() => {
    const severityMap = new Map();
    files.forEach((file) => {
      const maxSeverity = file.findings.reduce((max, finding) => (severityOrder[finding.severity] > severityOrder[max] ? finding.severity : max), "LOW");
      severityMap.set(maxSeverity, (severityMap.get(maxSeverity) || 0) + 1);
    });
    const severities = Array.from(severityMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => severityOrder[b.label] - severityOrder[a.label])
      .map((item) => ({
        ...item,
        color: { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#3b82f6", INFO: "#64748b" }[item.label] || "#64748b",
      }));

    const folderMap = new Map();
    filteredFiles.forEach((file) => folderMap.set(file.folder, (folderMap.get(file.folder) || 0) + 1));
    const topFolders = Array.from(folderMap.entries())
      .map(([folder, count]) => ({ label: folder, value: count, color: "#f59e0b" }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const fallbackAgentMap = new Map();
    files.forEach((file) => {
      const key = resolveAgentName(file);
      const existing = fallbackAgentMap.get(key) || { name: key, count: 0, lastSeen: null };
      existing.count += 1;
      if (!existing.lastSeen || new Date(file.timestamp).getTime() > new Date(existing.lastSeen).getTime()) {
        existing.lastSeen = file.timestamp || null;
      }
      fallbackAgentMap.set(key, existing);
    });

    const fallbackTopAgents = Array.from(fallbackAgentMap.values())
      .sort((a, b) => b.count - a.count || new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime())
      .slice(0, 5);

    const statsTopAgents = (stats?.topAgents || []).map((agent) => ({
      name: resolveAgentName(agent),
      count: Number(agent.count || 0),
      lastSeen: agent.lastSeen || agent.last_seen || null,
    }));

    const hasUsefulStatsTopAgents =
      statsTopAgents.length > 0 &&
      statsTopAgents.some((agent) => normalizeAgentLabel(agent.name));

    const topAgents = hasUsefulStatsTopAgents ? statsTopAgents : fallbackTopAgents;

    const fallbackUniqueAgents = new Set(files.map((file) => resolveAgentName(file))).size;

    const uniqueAgents = Number(
      hasUsefulStatsTopAgents ? (stats?.uniqueAgents ?? fallbackUniqueAgents) : fallbackUniqueAgents
    );

    return { severities, topFolders, topAgents, uniqueAgents };
  }, [stats, files, filteredFiles]);

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text || "-");
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2000);
  };

  useEffect(() => {
    setVtState({ status: "idle", error: null, result: null, scanningHash: null });
  }, [selectedFile?.id]);

  const runVirusTotalScan = async () => {
    if (!selectedFile || selectedFile.sha256 === "-") return;

    const scanHash = selectedFile.sha256;
    setVtState({ status: "loading", error: null, result: null, scanningHash: scanHash });

    try {
      const response = await fetch(`${API_BASE_URL}/api/virustotal/report?hash=${encodeURIComponent(scanHash)}`);
      const payload = await response.json().catch(() => ({}));

      if (!payload.success) {
        setVtState({ status: "error", error: payload.message || `Scan gagal (HTTP ${response.status})`, result: null, scanningHash: scanHash });
        return;
      }

      setVtState({ status: "done", error: null, result: payload.data, scanningHash: scanHash });
    } catch (error) {
      setVtState({ status: "error", error: error.message || "Gagal menghubungi backend", result: null, scanningHash: scanHash });
    }
  };

  const getVirusTotalLink = (sha256) => `https://www.virustotal.com/gui/file/${sha256}`;

  const handleRangeChange = (nextRange) => {
    setPage(1);
    setSelectedTimelinePoint(null);
    setFilterMode("range");
    setRangeKey(nextRange);
  };

  const handleTimelinePointSelect = useCallback(
    (point) => {
      if (!point) return;

      const pointKey = String(point.key ?? point.t ?? point.start ?? point);
      const bucketMs = point.bucketMs || getBucketMsForRange(rangeKey);
      const startIso = point.start || new Date(Number(point.t)).toISOString();
      const endIso = point.end || new Date(Number(point.t) + bucketMs - 1).toISOString();

      setPage(1);
      if (selectedTimelinePoint?.key === pointKey) {
        setSelectedTimelinePoint(null);
      } else {
        setSelectedTimelinePoint({ key: pointKey, start: startIso, end: endIso, bucketMs, time: point.t });
      }

      if (filesTableRef.current && typeof filesTableRef.current.scrollIntoView === "function") {
        try {
          filesTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          // ignore scroll errors
        }
      }
    },
    [rangeKey, selectedTimelinePoint]
  );

  return (
    <>
      <div className="soc-page-shell soc-fluid-page flex flex-col gap-3 sm:gap-4 w-full min-w-0">
        <div className="soc-page-heading bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl p-3 md:p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
            <div>
              <h1 className="soc-page-title flex items-center gap-2">
                <Bug className="h-4 w-4 sm:h-5 sm:w-5 text-red-400" />
                File Content Scanner
              </h1>
              <p className="soc-page-subtitle">
                Real-time file content scanning and suspicious file detection
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
                  onChange={(event) => {
                    setPage(1);
                    setPageSize(Number(event.target.value));
                  }}
                  className="appearance-none bg-transparent py-2 pl-2.5 pr-5 text-left text-[11px] font-medium leading-tight text-slate-100 focus:outline-none"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size} className="bg-white text-black">{size}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              </div>
              <ExportCsvButton accent="red" onClick={handleExportCsv} />
            </div>

            <div className="soc-filter-toolbar ml-auto flex flex-wrap items-center gap-2">
              <RangeFilter
                rangeKey={rangeKey}
                onRangeChange={handleRangeChange}
                dimmed={filterMode === "custom"}
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
                  : rangeKey}
              </span>
            </div>
          </div>

          {loadError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {loadError}
            </div>
          )}

          <div className="soc-kpi-grid">
            <div className="bg-sky-500/10 border border-sky-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-sky-400 uppercase font-semibold">Total Events</div>
              <div className="text-sm md:text-lg font-black text-sky-300 mt-0.5 md:mt-1">{stats?.totalEvents ?? 0}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">scans in range</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-red-400 uppercase font-semibold">Suspicious</div>
              <div className="text-sm md:text-lg font-black text-red-300 mt-0.5 md:mt-1">{stats?.suspiciousScans ?? 0}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">suspicious detected</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-emerald-400 uppercase font-semibold">Clean</div>
              <div className="text-sm md:text-lg font-black text-emerald-300 mt-0.5 md:mt-1">{stats?.cleanScans ?? 0}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">clean scans</div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-orange-400 uppercase font-semibold">Max Findings</div>
              <div className="text-sm md:text-lg font-black text-orange-300 mt-0.5 md:mt-1">{Math.round(Number(stats?.maxFindings || 0))}</div>
              <div className="text-[8px] md:text-[9px] text-slate-500 mt-0.5">most indicators in one file</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 items-stretch attack-panel-grid">
            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-5 flex flex-col h-full min-w-0 overflow-visible attack-card soc-fluid-card">
              <div className="soc-chart-header flex flex-wrap justify-between items-start gap-x-3 gap-y-1.5 mb-4 md:mb-4">
                <div className="text-[11px] md:text-xs font-semibold text-slate-300 flex items-center gap-1 md:gap-2 min-w-0">
                  <BarChart3 className="h-3 md:h-4 w-3 md:w-4 text-red-400 shrink-0" />
                  <span className="truncate">Detection Timeline</span>
                </div>
                <div className="soc-chart-meta text-right min-w-0">
                  <div className="text-xs text-slate-500 whitespace-nowrap">Last {rangeKey}</div>
                  <div className="text-[11px] text-slate-600 break-words">Updated {formatLiveTimestamp(lastUpdated)}</div>
                </div>
              </div>
              <div className="min-w-0 soc-chart--timeline rounded-lg bg-[var(--soc-card)] p-2 md:p-4 overflow-visible" style={{ height: `${timelineChartHeight}px` }}>
                <div className="min-w-0 h-full w-full">
                  <WaveChart
                    data={timeline}
                    color="#ef4444"
                    rangeKey={rangeKey}
                    height={timelineChartHeight}
                    compact={isMobile}
                    activePointKey={selectedTimelinePoint?.key ?? null}
                    onPointSelect={handleTimelinePointSelect}
                  />
                </div>
              </div>
            </div>

            <div ref={topAgentsPanelRef} className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-4 md:p-5 h-full flex flex-col min-w-0">
              <div className="mb-1 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] md:text-xs font-semibold text-slate-300">Top 5 Agents</div>
                  <div className="mt-1 text-[11px] text-slate-500">Most suspicious file findings by agent</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Unique agents</div>
                  <div className="text-xs font-black text-emerald-300">{analytics.uniqueAgents}</div>
                </div>
              </div>
              <TopAgentsCard agents={analytics.topAgents} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 items-stretch attack-split-grid">
            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 flex flex-col h-full min-w-0">
              <div className="text-[11px] md:text-xs font-semibold text-slate-300 mb-2 w-full">Severity Distribution</div>
              <div className="flex-1 min-h-0 w-full soc-chart soc-chart--category overflow-visible flex flex-col">
                <CategoryLineChart items={analytics.severities} totalLabel="files" />
              </div>
            </div>

            <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-3 md:p-4 flex flex-col h-full min-w-0">
              <div className="text-[11px] md:text-xs font-semibold text-slate-300 mb-2 w-full">Top Scanned Folders</div>
              <div className="flex-1 min-h-0 w-full soc-chart soc-chart--category overflow-visible flex flex-col">
                <CompactBarChart items={analytics.topFolders} emptyLabel="No folder data found" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg overflow-hidden">
          <div ref={filesTableRef} className="p-3 md:p-4 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
            {selectedTimelinePoint && (
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="text-xs text-red-300">
                  Timeline filter: {formatDetailedTimestamp(selectedTimelinePoint.start)}
                  {selectedTimelinePoint.end ? ` - ${formatDetailedTimestamp(selectedTimelinePoint.end)}` : ""}
                </div>
                <button
                  onClick={() => {
                    setSelectedTimelinePoint(null);
                    setPage(1);
                  }}
                  className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20"
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
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search current page by file, path, agent, scanner, or SHA-256..."
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
                value={filterAgent}
                allLabel="All agents"
                options={filterOptions.agents}
                accent="red"
                onChange={(nextValue) => setFilterAgent(nextValue)}
              />
              <FilterSelect
                value={filterType}
                allLabel="All types"
                options={filterOptions.types}
                accent="red"
                onChange={(nextValue) => setFilterType(nextValue)}
              />
              <FilterSelect
                value={filterSeverity}
                allLabel="All severities"
                options={["CRITICAL", "HIGH", "MEDIUM", "LOW"]}
                accent="red"
                onChange={(nextValue) => setFilterSeverity(nextValue)}
              />
            </div>
            </div>
          </div>

          <div className="overflow-x-auto soc-table-scroll">
            <table className="w-full min-w-[760px] text-[10px] md:text-[11px] soc-responsive-table">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Time</th>
                  <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Agent</th>
                  <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">File</th>
                  <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Type</th>
                  <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">File Path</th>
                  <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Severity</th>
                  <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Findings</th>
                  <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10">
                      <PageLoader message="Loading file scan data..." size="sm" />
                    </td>
                  </tr>
                ) : filteredFiles.length === 0 ? (
                  <EmptyState message="No suspicious file scan data found on this page." />
                ) : (
                  filteredFiles.map((file, idx) => {
                    const maxSeverity = file.findings.reduce(
                      (max, finding) => (severityOrder[finding.severity] > severityOrder[max.severity] ? finding : max),
                      file.findings[0]
                    );

                    return (
                      <tr key={file.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${idx % 2 !== 0 ? "bg-slate-900/30" : ""}`}>
                        <td className="px-1 md:px-2 py-1.5 md:py-2 text-[10px] md:text-[11px] text-slate-400 whitespace-nowrap">
                          {formatTime(file.timestamp)}
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2">
                          <div className="min-w-[70px]">
                            <div className="truncate text-[10px] md:text-[11px] font-semibold text-slate-200">{file.agentName || "Unknown agent"}</div>
                          </div>
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-xs font-bold text-slate-300">
                              {String(file.fileType || "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-mono text-sky-300 text-[10px] md:text-[11px] truncate max-w-xs">{file.fileName}</div>
                              <div className="text-[9px] md:text-[10px] text-slate-500">{file.sizeLabel}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2 text-[10px] md:text-[11px] text-slate-400">{file.fileType}</td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2 max-w-[480px]">
                          <div className="font-mono text-[10px] md:text-[11px] text-amber-300 truncate" title={file.filePath}>{file.filePath || "-"}</div>
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2"><RiskIndicator severity={maxSeverity?.severity || "HIGH"} /></td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2 text-[10px] md:text-[11px]"><span className="text-slate-300 font-mono">{file.findingsCount} found</span></td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2">
                          <button
                            onClick={() => setSelectedFile(file)}
                            className="px-3 py-1.5 rounded text-[10px] md:text-[11px] font-medium transition-colors flex items-center gap-1 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls pagination={pagination} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} />
        </div>
      </div>

      {selectedFile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-3xl w-full max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-700 rounded flex items-center justify-center text-xs font-bold text-slate-300">
                  {String(selectedFile.fileType || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">{selectedFile.fileName}</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">Forensic Analysis Report</p>
                </div>
              </div>
              <button onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-slate-200 text-xl">✕</button>
            </div>

            <div className="p-4 md:p-5 space-y-5">
              <div>
                <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> File Metadata</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-700/30 rounded-lg p-3 border border-slate-700">
                  <div><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Detected</p><p className="text-xs text-slate-100">{selectedFile.timestamp ? new Date(selectedFile.timestamp).toLocaleString() : "-"}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Agent</p><p className="text-xs text-slate-100">{selectedFile.agentName || "Unknown agent"}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">File Type</p><p className="text-xs text-slate-100">{selectedFile.fileType}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Size</p><p className="text-xs text-slate-100">{selectedFile.sizeLabel}</p></div>
                  {/* Agent ID intentionally hidden from UI per request */}
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
                      <button onClick={() => copyToClipboard(selectedFile.sha256, "sha256")} className={`p-1.5 rounded transition-colors ${copiedText === "sha256" ? "bg-green-500/30 text-green-300" : "bg-slate-600/30 text-slate-400 hover:bg-slate-600"}`}><Copy className="h-3.5 w-3.5" /></button>
                      {selectedFile.sha256 !== "-" && (
                        <a href={getVirusTotalLink(selectedFile.sha256)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-slate-600/30 text-slate-400 hover:text-sky-400 transition-colors"><ExternalLink className="h-3.5 w-3.5" /></a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {selectedFile.error ? (
                <div>
                  <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><AlertCircle className="h-3.5 w-3.5" /> Error Detail</h3>
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-xs text-orange-200 break-all">{selectedFile.error}</div>
                </div>
              ) : null}

              <div>
                <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Detected Indicators ({selectedFile.findings.length})</h3>
                <div className="space-y-2">
                  {selectedFile.findings.length === 0 ? (
                    <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-700 text-xs text-slate-400">No indicators reported.</div>
                  ) : (
                    selectedFile.findings.map((finding, idx) => (
                      <div key={`${finding.name}-${idx}`} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2"><p className="text-xs font-semibold text-slate-100">{finding.name}</p><RiskIndicator severity={finding.severity} /></div>
                            <p className="text-xs text-slate-400 mt-1">{finding.desc}</p>
                            <p className="text-[11px] text-slate-500 mt-1.5 font-mono">{finding.type}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {selectedFile.extractedUrls.length > 0 && (
                <div>
                  <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><ExternalLink className="h-3.5 w-3.5" /> Extracted URLs ({selectedFile.extractedUrls.length})</h3>
                  <div className="space-y-2">
                    {selectedFile.extractedUrls.map((url, idx) => (
                      <div key={`${url}-${idx}`} className="bg-slate-700/30 rounded-lg p-2 border border-slate-700 flex items-center justify-between gap-3">
                        <code className="text-[11px] text-slate-300 font-mono flex-1 break-all">{url}</code>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-sky-400 transition-colors flex-shrink-0"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedFile.matchedSources.length > 0 && (
                <div>
                  <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3">Matched Sources ({selectedFile.matchedSources.length})</h3>
                  <div className="space-y-2">
                    {selectedFile.matchedSources.map((source, idx) => (
                      <div key={`${source}-${idx}`} className="bg-slate-700/30 rounded-lg p-2 border border-slate-700"><p className="text-xs text-slate-300 font-mono break-all">{typeof source === "object" ? JSON.stringify(source) : source}</p></div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs md:text-sm font-semibold text-slate-200 mb-3">Recommended Actions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={runVirusTotalScan}
                    disabled={selectedFile.sha256 === "-" || vtState.status === "loading"}
                    className="px-3 py-2 bg-sky-600 hover:bg-sky-700 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {vtState.status === "loading" ? "Scanning..." : "Scan with VirusTotal"}
                  </button>
                  <button
                      onClick={() => copyToClipboard(JSON.stringify(selectedFile, null, 2), "export")}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 ${copiedText === "export"
                        ? "bg-green-600/30 text-green-300"
                        : "bg-slate-700 hover:bg-slate-600"
                        }`}
                    ><Copy className="h-3.5 w-3.5" /> {copiedText === "export" ? "Copied!" : "Copy JSON"}</button>
                </div>

                {vtState.status === "loading" && (
                  <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-300">
                    Checking hash {vtState.scanningHash} on VirusTotal...
                  </div>
                )}

                {vtState.error && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{vtState.error}</div>
                )}

                {vtState.status === "done" && vtState.result && (
                  <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${vtState.result.stats.malicious > 0
                        ? "border-red-500/40 bg-red-500/10 text-red-300"
                        : vtState.result.stats.suspicious > 0
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        }`}>
                        {vtState.result.stats.malicious}/{vtState.result.stats.total} malicious
                      </span>
                      {vtState.result.threatLabel && (
                        <span className="text-[11px] text-slate-300 truncate">Threat: {vtState.result.threatLabel}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
                      <span>Suspicious: {vtState.result.stats.suspicious}</span>
                      <span>Harmless: {vtState.result.stats.harmless}</span>
                      <span>Undetected: {vtState.result.stats.undetected}</span>
                      <span>Engine count: {vtState.result.stats.total}</span>
                    </div>
                    {vtState.result.analyzedAt && (
                      <div className="mt-1 text-[10px] text-slate-500">Last analyzed: {formatTime(new Date(vtState.result.analyzedAt * 1000).toISOString())}</div>
                    )}
                    <a
                      href={vtState.result.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" /> Open full VirusTotal report
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-4 py-3 flex justify-end gap-3">
              <button onClick={() => setSelectedFile(null)} className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors text-xs font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FileSecurityScanner;
