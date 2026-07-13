import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "../components/Navbar";
import { API_BASE_URL } from "../config/Api";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Search,
  Bug,
  FileText,
  AlertCircle,
  BarChart3,
  RefreshCw,
  FolderOpen,
  ShieldCheck,
  Network,
} from "lucide-react";
import {
  FILE_SEVERITY_ORDER,
  inferFileSeverity,
  inferFindingSeverity,
  normalizeFileSeverity,
} from "../utils/fileSeverity";

const API_ROOT = `${API_BASE_URL}/api`;
const DEFAULT_PAGE_SIZE = 20;

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

const getBucketMsForRange = (rangeKey) => rangeToBucketMs[rangeKey] || rangeToBucketMs["24h"];

const formatBucketLabel = (ms, currentRangeKey) => {
  const date = new Date(ms);
  if (currentRangeKey === "1h") return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (currentRangeKey === "24h") return date.toLocaleTimeString("en-US", { hour: "2-digit" });
  if (currentRangeKey === "7d") return date.toLocaleString("en-US", { weekday: "short", hour: "2-digit" });
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

const severityOrder = FILE_SEVERITY_ORDER;
const severityColors = {
  CRITICAL: "text-red-400 bg-red-500/20",
  HIGH: "text-orange-400 bg-orange-500/20",
  MEDIUM: "text-yellow-400 bg-yellow-500/20",
  LOW: "text-blue-400 bg-blue-500/20",
  INFO: "text-slate-300 bg-slate-500/20",
};

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

function normalizeSeverity(value, fallback = "HIGH") {
  return normalizeFileSeverity(value, fallback);
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

function normalizeFinding(finding, index, item = {}) {
  if (typeof finding === "string") {
    return {
      name: finding,
      severity: inferFindingSeverity({ indicator: finding, sample: finding }, item),
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
      raw.severity || raw.risk || raw.level || raw.ruleLevel || raw.rule_level,
      inferFindingSeverity(raw, item)
    ),
    desc: typeof desc === "object" ? JSON.stringify(desc) : String(desc),
    type: raw.type || raw.category || raw.source || "content_indicator",
  };
}

function normalizeFileScan(item) {
  const findings = Array.isArray(item.findings)
    ? item.findings.map((finding, index) => normalizeFinding(finding, index, item))
    : [];
  const findingsCount = Number(item.findingsCount ?? findings.length ?? 0);
  const inferredFileSeverity = inferFileSeverity(item, findings);
  const safeFindings = findings.length
    ? findings
    : findingsCount > 0
      ? [
        {
          name: "Suspicious indicator detected",
          severity: inferredFileSeverity,
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
    severity: inferredFileSeverity,
    matchedSourcesCount: item.matchedSourcesCount ?? 0,
    matchedSources: Array.isArray(item.matchedSources) ? item.matchedSources : [],
    findings: safeFindings,
    extractedUrls: Array.isArray(item.extractedUrls) ? item.extractedUrls : [],
    error: item.error || "",
    folder: getDirectory(filePath),
    actionStatus: findingsCount > 0 ? "Review / Block" : "No Action",
    health: findingsCount > 0 ? Math.max(35, 100 - findingsCount * 15) : 100,
  };
}

function buildTimelineFallback(items, rangeKey) {
  const bucketMs = getBucketMsForRange(rangeKey);
  const buckets = new Map();

  items.forEach((item) => {
    const ts = new Date(item.timestamp).getTime();
    if (!Number.isFinite(ts)) return;

    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  });

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ t, v }));
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

const RangeFilter = ({ rangeKey, onRangeChange }) => (
  <div className="flex items-center gap-1 md:gap-2">
    <span className="hidden sm:inline text-xs text-slate-500">Range</span>
    <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700 gap-0.5">
      {["1h", "24h", "7d", "30d"].map((k) => (
        <button
          key={k}
          onClick={() => onRangeChange(k)}
          className={`px-1.5 md:px-2.5 py-0.5 md:py-1 text-xs rounded-sm ${rangeKey === k ? "bg-sky-600 text-white" : "text-slate-400"}`}
        >
          {k}
        </button>
      ))}
    </div>
  </div>
);

function getTooltipPosition(point, chartWidth, chartHeight) {
  const rawLeft = (point.x / chartWidth) * 100;
  const nearLeft = rawLeft < 16;
  const nearRight = rawLeft > 84;
  const placeBelow = point.y < 78;
  const left = clamp(rawLeft, 3, 97);
  const top = placeBelow
    ? clamp(((point.y + 18) / chartHeight) * 100, 3, 88)
    : clamp(((point.y - 18) / chartHeight) * 100, 10, 97);

  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(${nearLeft ? "0" : nearRight ? "-100%" : "-50%"}, ${placeBelow ? "0" : "-100%"})`,
  };
}

const WaveChart = ({
  data,
  color = "#ef4444",
  activeColor = "#fb7185",
  height = 200,
  rangeKey,
  compact = false,
  activePointKey = null,
  onPointSelect = null,
}) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const chartRef = useRef(null);
  const baseWidth = compact ? 620 : 800;
  const [chartWidth, setChartWidth] = useState(baseWidth);
  const width = chartWidth;
  const chartHeight = Math.max(compact ? 220 : 240, height);
  const padding = { l: 58, r: 24, t: 20, b: 56 };
  const innerW = width - padding.l - padding.r;
  const innerH = chartHeight - padding.t - padding.b;

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return undefined;

    const updateWidth = () => {
      const rect = node.getBoundingClientRect();
      const nextWidth = Math.max(compact ? 620 : 320, Math.round(rect.width || baseWidth));
      setChartWidth((current) => (current === nextWidth ? current : nextWidth));
      setSelectedPoint((current) => (current ? null : current));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [baseWidth, compact]);

  if (!data || data.length === 0) {
    return (
      <div ref={chartRef} className="relative w-full overflow-visible" style={{ height: chartHeight }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${chartHeight}`} className="block">
          <text x={width / 2} y={chartHeight / 2} textAnchor="middle" fontSize="12" fill="#64748b">No data</text>
        </svg>
      </div>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => Number(d.v || 0)));
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const defaultBucketMs = getBucketMsForRange(rangeKey);

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
    const y = padding.t + innerH - (Number(data[i].v || 0) / maxV) * innerH;
    if (i === 0) {
      pathD += `M ${x} ${y}`;
    } else {
      const prevX = padding.l + (i - 1) * pointSpacing;
      const prevY = padding.t + innerH - (Number(data[i - 1].v || 0) / maxV) * innerH;
      const controlX = (prevX + x) / 2;
      pathD += ` C ${controlX} ${prevY}, ${controlX} ${y}, ${x} ${y}`;
    }
  }

  const tickCount = clamp(Math.floor(innerW / (compact ? 260 : 160)), compact ? 2 : 3, compact ? 4 : 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));
  const tooltipPosition = selectedPoint ? getTooltipPosition(selectedPoint, width, chartHeight) : null;

  return (
    <div
      ref={chartRef}
      className="relative w-full overflow-visible"
      style={{ height: chartHeight }}
      onMouseLeave={() => setSelectedPoint(null)}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${chartHeight}`} className="block overflow-visible">
        {gridLines.map((grid) => (
          <g key={`grid-${grid.ratio}`}>
            <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="#334155" strokeDasharray="2,2" opacity="0.5" />
            <text x={padding.l - 7} y={grid.y + 3} textAnchor="end" fontSize="9" fill="#64748b" fontWeight="600">{grid.value}</text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="#334155" />

        <text
          x={padding.l + innerW / 2}
          y={chartHeight - 12}
          textAnchor="middle"
          fontSize="11"
          fill="#64748b"
          fontWeight="700"
        >
          Time Bucket
        </text>
        <text
          x={-(padding.t + innerH / 2)}
          y="15"
          transform="rotate(-90)"
          textAnchor="middle"
          fontSize="11"
          fill="#64748b"
          fontWeight="700"
        >
          Detections
        </text>

        <path d={pathD} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <defs>
          <linearGradient id="waveGradientFileScanner" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${pathD} L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill="url(#waveGradientFileScanner)" />

        {data.map((d, i) => {
          const x = padding.l + i * pointSpacing;
          const y = padding.t + innerH - (Number(d.v || 0) / maxV) * innerH;
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

          return (
            <g key={`point-${pointKey}`}>
              {isHighlighted && (
                <circle
                  cx={x}
                  cy={y}
                  r="8"
                  fill="#0f172a"
                  stroke={isActive ? activeColor : color}
                  strokeWidth="1.5"
                  opacity="0.95"
                  className="pointer-events-none"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={isHighlighted ? "7" : "10"}
                fill="transparent"
                className="cursor-pointer"
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
                r={isHighlighted ? "5" : "3.5"}
                fill={isActive ? activeColor : color}
                stroke="#0f172a"
                strokeWidth="1.5"
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
              <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="#334155" />
              <text
                x={x}
                y={padding.t + innerH + 17}
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
          style={tooltipPosition}
        >
          <div className="font-semibold text-white">{selectedPoint.value} detections</div>
          <div className="mt-1 text-slate-400">{formatDetailedTimestamp(selectedPoint.time)}</div>
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
        <circle r={r} fill="transparent" stroke="#1e293b" strokeWidth={stroke} />
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

const CompactBarChart = ({ items, getKey, getLabel, getValue, getBarColor = () => "#38bdf8", secondaryValue }) => {
  const maxValue = Math.max(...items.map((item) => getValue(item)), 1);

  if (!items.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-800/20 text-sm text-slate-500">
        No data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={getKey(item)} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-center gap-3">
          <div className="truncate font-mono text-[11px] text-slate-300" title={getLabel(item)}>
            {getLabel(item)}
          </div>
          <div className="relative h-7">
            <div className="absolute inset-0 rounded-md border border-slate-800 bg-slate-950/80" />
            <div
              className="absolute left-0 top-0 h-full rounded-md transition-all duration-500"
              style={{ width: `${(getValue(item) / maxValue) * 100}%`, background: getBarColor(item) }}
            />
            {secondaryValue ? <div className="absolute inset-y-0 right-2 flex items-center text-[10px] font-semibold text-slate-100">{secondaryValue(item)}</div> : null}
          </div>
          <div className="w-10 text-right text-xs font-bold text-slate-200">{getValue(item)}</div>
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

  const peakCount = Math.max(...agents.map((agent) => agent.count), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {agents.map((agent, idx) => {
        const accent = TOP_AGENT_COLORS[idx % TOP_AGENT_COLORS.length];
        const fillWidth = Math.max(10, Math.round((agent.count / peakCount) * 100));

        return (
          <div key={`${agent.name}-${idx}`} className="rounded-xl border border-slate-700/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
                  style={{ backgroundColor: `${accent}1f`, color: accent }}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">{agent.name}</div>
                  <div className="text-[11px] text-slate-500">
                    Last seen {formatLiveTimestamp(agent.lastSeen)}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-black" style={{ color: accent }}>{agent.count}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">files</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full"
                style={{ width: `${fillWidth}%`, background: accent }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RiskIndicator = ({ severity }) => {
  const sev = normalizeSeverity(severity, "INFO");
  return <span className={`px-3 py-1 rounded-full text-xs font-bold ${severityColors[sev]}`}>{sev}</span>;
};

const HealthIndicator = ({ health }) => {
  const value = Number(health || 0);
  const tone =
    value >= 90
      ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
      : value >= 75
        ? "text-amber-300 bg-amber-500/15 border-amber-500/30"
        : "text-red-300 bg-red-500/15 border-red-500/30";

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{value}%</span>;
};

const PaginationControls = ({ pagination, page, pageSize, loading, onPageChange }) => {
  const totalPages = pagination?.totalPages || 1;
  const total = pagination?.total || 0;
  const limit = pagination?.limit || pageSize;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="p-2 md:p-4 border-t border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0 bg-slate-900/50 rounded-b-lg md:rounded-b-xl">
      <div className="text-xs text-slate-500 font-mono">
        <span className="hidden md:inline">SHOWING </span>
        <span className="text-sky-400 font-bold">{start}</span>
        <span className="hidden md:inline">{" - "}</span>
        <span className="md:hidden">-</span>
        <span className="text-sky-400 font-bold">{end}</span>
        <span className="hidden md:inline">{" OF "}</span>
        <span className="md:hidden"> / </span>
        <span className="text-sky-400 font-bold">{total}</span>
        <span className="hidden md:inline"> RECORDS</span>
      </div>

      <div className="flex flex-wrap gap-1 md:gap-2 items-center">
        <button
          onClick={() => onPageChange(1)}
          disabled={loading || page <= 1}
          className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
        >
          <span className="hidden md:inline">FIRST</span>
          <span className="md:hidden">«</span>
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={loading || page <= 1}
          className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
        >
          <span className="hidden md:inline">PREV</span>
          <span className="md:hidden">‹</span>
        </button>
        <span className="text-xs font-black text-slate-400 px-1 md:px-2">
          <span className="hidden md:inline">PAGE </span><span className="text-white">{page}</span> / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={loading || page >= totalPages}
          className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
        >
          <span className="hidden md:inline">NEXT</span>
          <span className="md:hidden">›</span>
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={loading || page >= totalPages}
          className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
        >
          <span className="hidden md:inline">LAST</span>
          <span className="md:hidden">»</span>
        </button>
      </div>
    </div>
  );
};

const EmptyState = ({ message }) => (
  <tr>
    <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
      {message}
    </td>
  </tr>
);

const FileSecurityScanner = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [copiedText, setCopiedText] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [isScanning, setIsScanning] = useState(false);
  const [rangeKey, setRangeKey] = useState("24h");
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
  const [timelineChartHeight, setTimelineChartHeight] = useState(160);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(null);
  const topAgentsPanelRef = useRef(null);
  const filesTableRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const minutes = rangeToMinutes[rangeKey] || 1440;
      const suspiciousParams = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
        suspiciousParams.set("start", selectedTimelinePoint.start);
        suspiciousParams.set("end", selectedTimelinePoint.end);
      }

      const [suspiciousResponse, statsResponse, timelineResponse] = await Promise.all([
        fetchJson(`${API_ROOT}/file-scans/suspicious?${suspiciousParams.toString()}`),
        fetchJson(`${API_ROOT}/file-scans/stats`),
        fetchJson(`${API_ROOT}/file-scans/timeline?minutes=${minutes}`),
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

      setTimeline(
        mappedTimeline.length > 0
          ? mappedTimeline
          : buildTimelineFallback(normalizedSuspicious, rangeKey)
      );

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
  }, [page, pageSize, rangeKey, selectedTimelinePoint]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
    setSelectedTimelinePoint(null);
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
        setTimelineChartHeight(100);
        return;
      }

      const panelHeight = topAgentsPanelRef.current?.getBoundingClientRect().height;
      if (!panelHeight) return;

      const nextHeight = clamp(Math.round(panelHeight - 104), 160, 300);
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

  const filteredFiles = useMemo(() => {
    let result = files;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((file) =>
        `${file.fileName} ${file.filePath} ${file.sha256} ${file.agentName} ${file.scanner}`.toLowerCase().includes(q)
      );
    }
    if (filterSeverity !== "all") {
      result = result.filter(
        (file) => file.severity === filterSeverity || file.findings.some((finding) => finding.severity === filterSeverity)
      );
    }
    return result;
  }, [files, searchQuery, filterSeverity]);

  const analytics = useMemo(() => {
    const fileTypeSource =
      (stats?.fileTypes || []).length > 0
        ? (stats.fileTypes || []).map((item) => ({
            label: item.fileType || "unknown",
            value: item.count || 0,
          }))
        : Array.from(
            files.reduce((map, file) => {
              const fileType = file.fileType || "unknown";
              map.set(fileType, (map.get(fileType) || 0) + 1);
              return map;
            }, new Map()).entries()
          )
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

    const fileTypes = fileTypeSource
      .map((item, i) => ({
        label: item.label,
        value: item.value || 0,
        color: ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6"][i % 7],
      }))
      .slice(0, 7);

    const severityMap = new Map();
    files.forEach((file) => {
      const maxSeverity = normalizeSeverity(
        file.severity,
        file.findings.reduce((max, finding) => (severityOrder[finding.severity] > severityOrder[max] ? finding.severity : max), "LOW")
      );
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
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const scannerMap = new Map();
    filteredFiles.forEach((file) => scannerMap.set(file.scanner, (scannerMap.get(file.scanner) || 0) + 1));
    const topScanners = Array.from(scannerMap.entries())
      .map(([scanner, count]) => ({ scanner, count }))
      .sort((a, b) => b.count - a.count)
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

    return { fileTypes, severities, topFolders, topScanners, topAgents, uniqueAgents };
  }, [stats, files, filteredFiles]);

  const health = useMemo(() => {
    const total = Number(stats?.totalEvents || 0);
    if (!total) return 100;
    const errorsCount = Number(stats?.totalErrorScans || 0);
    return Math.max(0, Number((((total - errorsCount) / total) * 100).toFixed(1)));
  }, [stats]);

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text || "-");
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getVirusTotalLink = (sha256) => `https://www.virustotal.com/gui/file/${sha256}`;

  const handleRefresh = async () => {
    setIsScanning(true);
    await loadData();
    setIsScanning(false);
  };

  const handleRangeChange = (nextRange) => {
    setPage(1);
    setSelectedTimelinePoint(null);
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
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-2 md:p-4 flex flex-col gap-3 md:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl p-3 md:p-4 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <Bug className="h-5 md:h-6 w-5 md:w-6 text-red-400" />
                File Content Scanner
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-1">
                Real-time file content scanning and suspicious file detection
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl p-2 md:p-4 shadow-lg flex flex-col gap-3 md:gap-4">
          <div className="flex items-center justify-between gap-1 md:gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isScanning || loading}
                className="inline-flex items-center gap-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 transition-colors border border-slate-700 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${(isScanning || loading) ? "animate-spin" : ""}`} />
                <span>{isScanning || loading ? "Loading..." : "Refresh"}</span>
              </button>

              <label className="flex items-center gap-2 text-xs text-slate-400">
                <span className="hidden sm:inline">Rows</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPage(1);
                    setPageSize(Number(event.target.value));
                  }}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  {[10, 20, 50, 100].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            </div>

            <RangeFilter rangeKey={rangeKey} onRangeChange={handleRangeChange} />
          </div>

          {loadError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {loadError}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
            <div className="bg-slate-800/50 border border-slate-700/60 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-slate-500 uppercase font-semibold">Total Events</div>
              <div className="text-lg md:text-2xl font-black text-blue-400 mt-0.5 md:mt-1">{stats?.totalEvents ?? 0}</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-red-400 uppercase font-semibold">Suspicious</div>
              <div className="text-lg md:text-2xl font-black text-red-300 mt-0.5 md:mt-1">{stats?.suspiciousScans ?? 0}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-emerald-400 uppercase font-semibold">Clean</div>
              <div className="text-lg md:text-2xl font-black text-emerald-300 mt-0.5 md:mt-1">{stats?.cleanScans ?? 0}</div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-orange-400 uppercase font-semibold">Errors</div>
              <div className="text-lg md:text-2xl font-black text-orange-300 mt-0.5 md:mt-1">{stats?.totalErrorScans ?? 0}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-slate-400 uppercase font-semibold">Scan Success Rate</div>
              <div className="text-lg md:text-2xl font-black text-emerald-400 mt-0.5 md:mt-1">{health}%</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 items-stretch">
            <div className="bg-slate-800/30 border border-slate-800/50 rounded-lg p-4 md:p-6 flex flex-col h-full">
              <div className="flex justify-between items-center mb-4 md:mb-6 gap-2">
                <div>
                  <div className="text-xs md:text-sm font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                    <BarChart3 className="h-3 md:h-4 w-3 md:w-4 text-red-400" />
                    Detection Timeline
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">Click a point to filter suspicious files by time bucket</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Last {rangeKey}</div>
                  <div className="text-[11px] text-slate-600">Updated {formatLiveTimestamp(lastUpdated)}</div>
                </div>
              </div>
              <div className="overflow-x-auto flex-1 bg-slate-800/30 rounded-lg border border-slate-800/40 p-2 md:p-4">
                <div className={isMobile ? "min-w-[620px]" : "min-w-0"}>
                  <WaveChart
                    data={timeline}
                    color="#ef4444"
                    activeColor="#fb7185"
                    height={timelineChartHeight}
                    rangeKey={rangeKey}
                    compact={isMobile}
                    activePointKey={selectedTimelinePoint?.key ?? null}
                    onPointSelect={handleTimelinePointSelect}
                  />
                </div>
              </div>
            </div>

            <div ref={topAgentsPanelRef} className="bg-slate-800/30 border border-slate-800/50 rounded-lg p-4 md:p-6 h-full">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs md:text-sm font-semibold text-slate-300">Top 5 Agents</div>
                  <div className="mt-1 text-[11px] text-slate-500">Most suspicious file findings by agent</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Unique agents</div>
                  <div className="text-sm font-black text-emerald-300">{analytics.uniqueAgents}</div>
                </div>
              </div>
              <TopAgentsCard agents={analytics.topAgents} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4 shadow-lg flex flex-col">
              <div className="text-xs md:text-sm font-semibold text-slate-300 mb-4 w-full">File Type Distribution</div>
              <div className="flex items-center justify-center flex-1">
                <div className="flex flex-col items-center gap-4">
                  <Donut items={analytics.fileTypes} size={150} centerLabelTop={stats?.totalSuccessScans ?? 0} centerLabelBottom="files" />
                  <div className="text-xs w-44"><Legend items={analytics.fileTypes} /></div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4 shadow-lg flex flex-col">
              <div className="text-xs md:text-sm font-semibold text-slate-300 mb-4 w-full">Severity Distribution</div>
              <div className="flex items-center justify-center flex-1">
                <div className="flex flex-col items-center gap-4">
                  <Donut items={analytics.severities} size={150} centerLabelTop={files.length} centerLabelBottom="page" />
                  <div className="text-xs w-44"><Legend items={analytics.severities} /></div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-2 mb-4">
                <Network className="h-4 w-4 text-red-400" />
                <div>
                  <div className="text-xs md:text-sm font-semibold text-slate-200">Top Scanner Sources</div>
                  <div className="text-xs text-slate-500">Scanner frequency from the current table page</div>
                </div>
              </div>
              <CompactBarChart
                items={analytics.topScanners}
                getKey={(item) => item.scanner}
                getLabel={(item) => item.scanner}
                getValue={(item) => item.count}
                getBarColor={() => "linear-gradient(90deg, #0ea5e9 0%, #38bdf8 100%)"}
              />
            </div>

            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-2 mb-4">
                <FolderOpen className="h-4 w-4 text-amber-400" />
                <div>
                  <div className="text-xs md:text-sm font-semibold text-slate-200">Top Scanned Folders</div>
                  <div className="text-xs text-slate-500">Most frequent file paths from the current table page</div>
                </div>
              </div>
              <CompactBarChart
                items={analytics.topFolders}
                getKey={(item) => item.folder}
                getLabel={(item) => item.folder}
                getValue={(item) => item.count}
                getBarColor={() => "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)"}
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl shadow-lg overflow-hidden">
          <div className="border-b border-slate-800 bg-slate-800/50 px-6 py-4">
            <span className="flex items-center gap-2 font-medium text-red-400">
              <Bug className="h-4 w-4" />
              Suspicious Files ({pagination.total})
            </span>
          </div>

          <div className="p-3 md:p-4">
            <div className="mb-[12px] space-y-4">
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-64 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search current page by file, path, agent, scanner, or SHA-256..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {["all", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((severity) => (
                    <button
                      key={severity}
                      onClick={() => setFilterSeverity(severity)}
                      className={`px-3 py-2 text-xs rounded-lg font-medium transition-colors ${filterSeverity === severity ? "bg-red-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                        }`}
                    >
                      {severity}
                    </button>
                  ))}
                </div>
              </div>

              <div ref={filesTableRef} className="overflow-x-auto rounded-lg border border-slate-800">
                {selectedTimelinePoint && (
                  <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-800 bg-slate-800/60 p-3 sm:flex-row sm:items-center">
                    <div className="text-xs text-red-300">
                      Timeline filter: {formatDetailedTimestamp(selectedTimelinePoint.start)}
                      {selectedTimelinePoint.end ? ` - ${formatDetailedTimestamp(selectedTimelinePoint.end)}` : ""}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedTimelinePoint(null);
                        setPage(1);
                      }}
                      className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-red-400/50 hover:text-red-300"
                    >
                      Clear filter
                    </button>
                  </div>
                )}
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/50">
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">File</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Hostname</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Type</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Scanner</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">File Path</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Severity</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Findings</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Detected</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <EmptyState message="Loading file scan data from backend..." />
                    ) : filteredFiles.length === 0 ? (
                      <EmptyState message="No suspicious file scan data found on this page." />
                    ) : (
                        filteredFiles.map((file, idx) => {
                        const maxSeverity = normalizeSeverity(
                          file.severity,
                          file.findings.reduce(
                            (max, finding) => (severityOrder[finding.severity] > severityOrder[max] ? finding.severity : max),
                            "LOW"
                          )
                        );

                        return (
                          <tr key={file.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${idx % 2 !== 0 ? "bg-slate-900/30" : ""}`}>
                            <td className="px-2 md:px-4 py-1.5 md:py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-xs font-bold text-slate-300">
                                  {String(file.fileType || "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-mono text-sky-300 text-xs truncate max-w-xs">{file.fileName}</div>
                                  <div className="text-[11px] text-slate-500">{file.sizeLabel}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 md:px-4 py-1.5 md:py-3">
                              <div className="min-w-[140px]">
                                <div className="truncate text-xs font-semibold text-slate-200">{file.agentName || "Unknown agent"}</div>
                              </div>
                            </td>
                            <td className="px-2 md:px-4 py-1.5 md:py-3 text-xs text-slate-400">{file.fileType}</td>
                            <td className="px-2 md:px-4 py-1.5 md:py-3 text-xs text-slate-400 font-mono">{file.scanner}</td>
                            <td className="px-2 md:px-4 py-1.5 md:py-3 max-w-[300px]">
                              <div className="font-mono text-xs text-amber-300 truncate" title={file.filePath}>{file.filePath || "-"}</div>
                            </td>
                            <td className="px-2 md:px-4 py-1.5 md:py-3"><RiskIndicator severity={maxSeverity} /></td>
                            <td className="px-2 md:px-4 py-1.5 md:py-3 text-xs"><span className="text-slate-300 font-mono">{file.findingsCount} found</span></td>
                            <td className="px-2 md:px-4 py-1.5 md:py-3 text-xs text-slate-400">
                              {file.timestamp ? new Date(file.timestamp).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                            </td>
                            <td className="px-2 md:px-4 py-1.5 md:py-3">
                              <button
                                onClick={() => setSelectedFile(file)}
                                className="px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1 bg-red-500/10 text-red-300 hover:bg-red-500/20"
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
            </div>
          </div>

          <PaginationControls pagination={pagination} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} />
        </div>
      </div>

      {selectedFile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-4xl w-full max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-700 rounded flex items-center justify-center text-sm font-bold text-slate-300">
                  {String(selectedFile.fileType || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">{selectedFile.fileName}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Forensic Analysis Report</p>
                </div>
              </div>
              <button onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-slate-200 text-2xl">✕</button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><FileText className="h-4 w-4" /> File Metadata</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-700/30 rounded-lg p-4 border border-slate-700">
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">File Type</p><p className="text-sm text-slate-100">{selectedFile.fileType}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Size</p><p className="text-sm text-slate-100">{selectedFile.sizeLabel}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Scanner</p><p className="text-sm text-slate-100">{selectedFile.scanner}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Agent</p><p className="text-sm text-slate-100">{selectedFile.agentName || "Unknown agent"}</p></div>
                  <div className="md:col-span-2"><p className="text-xs text-slate-400 uppercase font-semibold mb-1">File Path</p><p className="text-sm font-mono text-amber-300 break-all">{selectedFile.filePath || "-"}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Detected</p><p className="text-sm text-slate-100">{selectedFile.timestamp ? new Date(selectedFile.timestamp).toLocaleString() : "-"}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Action</p><p className="text-sm text-slate-100">{selectedFile.actionStatus}</p></div>
                  {/* Agent ID intentionally hidden from UI per request */}
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">File Risk Score</p><HealthIndicator health={selectedFile.health} /></div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><FileText className="h-4 w-4" /> File Hashes</h3>
                <div className="space-y-3 bg-slate-700/30 rounded-lg p-4 border border-slate-700">
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-2">SHA-256</p>
                    <div className="flex items-center gap-2 bg-slate-800/50 rounded p-2">
                      <code className="text-xs text-slate-300 font-mono flex-1 break-all">{selectedFile.sha256}</code>
                      <button onClick={() => copyToClipboard(selectedFile.sha256, "sha256")} className={`p-1.5 rounded transition-colors ${copiedText === "sha256" ? "bg-green-500/30 text-green-300" : "bg-slate-600/30 text-slate-400 hover:bg-slate-600"}`}><Copy className="h-4 w-4" /></button>
                      {selectedFile.sha256 !== "-" && (
                        <a href={getVirusTotalLink(selectedFile.sha256)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-slate-600/30 text-slate-400 hover:text-sky-400 transition-colors"><ExternalLink className="h-4 w-4" /></a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {selectedFile.error ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Error Detail</h3>
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 text-sm text-orange-200 break-all">{selectedFile.error}</div>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Detected Indicators ({selectedFile.findings.length})</h3>
                <div className="space-y-3">
                  {selectedFile.findings.length === 0 ? (
                    <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-700 text-sm text-slate-400">No indicators reported.</div>
                  ) : (
                    selectedFile.findings.map((finding, idx) => (
                      <div key={`${finding.name}-${idx}`} className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2"><p className="font-semibold text-slate-100">{finding.name}</p><RiskIndicator severity={finding.severity} /></div>
                            <p className="text-sm text-slate-400 mt-1">{finding.desc}</p>
                            <p className="text-xs text-slate-500 mt-2 font-mono">{finding.type}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {selectedFile.extractedUrls.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><ExternalLink className="h-4 w-4" /> Extracted URLs ({selectedFile.extractedUrls.length})</h3>
                  <div className="space-y-2">
                    {selectedFile.extractedUrls.map((url, idx) => (
                      <div key={`${url}-${idx}`} className="bg-slate-700/30 rounded-lg p-3 border border-slate-700 flex items-center justify-between gap-3">
                        <code className="text-xs text-slate-300 font-mono flex-1 break-all">{url}</code>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-sky-400 transition-colors flex-shrink-0"><ExternalLink className="h-4 w-4" /></a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedFile.matchedSources.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Matched Sources ({selectedFile.matchedSources.length})</h3>
                  <div className="space-y-2">
                    {selectedFile.matchedSources.map((source, idx) => (
                      <div key={`${source}-${idx}`} className="bg-slate-700/30 rounded-lg p-3 border border-slate-700"><p className="text-sm text-slate-300 font-mono break-all">{typeof source === "object" ? JSON.stringify(source) : source}</p></div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-3">Recommended Actions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {selectedFile.sha256 !== "-" ? (
                    <a href={getVirusTotalLink(selectedFile.sha256)} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"><ExternalLink className="h-4 w-4" /> VirusTotal</a>
                  ) : (
                    <button disabled className="px-4 py-2.5 bg-slate-700/50 rounded-lg text-sm font-medium text-slate-500 flex items-center justify-center gap-2"><ExternalLink className="h-4 w-4" /> VirusTotal</button>
                  )}
                  <button onClick={() => copyToClipboard(JSON.stringify(selectedFile, null, 2), "export")} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"><Copy className="h-4 w-4" /> Copy JSON</button>
                  <button className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-300"><ShieldCheck className="h-4 w-4" /> {selectedFile.actionStatus}</button>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-6 py-4 flex justify-end gap-3">
              <button onClick={() => setSelectedFile(null)} className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileSecurityScanner;
