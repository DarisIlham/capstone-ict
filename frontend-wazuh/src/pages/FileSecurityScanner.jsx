import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Zap,
  RefreshCw,
  FolderOpen,
  ShieldCheck,
  Network,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const API_ROOT = "http://localhost:5000/api";;
const PAGE_LIMIT = 20;

const rangeToMinutes = {
  "1h": 60,
  "24h": 1440,
  "7d": 10080,
  "30d": 43200,
};

const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
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

function normalizeSeverity(value, fallback = "HIGH") {
  const sev = String(value || fallback).toUpperCase();
  return severityOrder[sev] !== undefined ? sev : fallback;
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
    severity: normalizeSeverity(raw.severity || raw.risk || raw.level, "HIGH"),
    desc: typeof desc === "object" ? JSON.stringify(desc) : String(desc),
    type: raw.type || raw.category || raw.source || "content_indicator",
  };
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
    health: findingsCount > 0 ? Math.max(35, 100 - findingsCount * 15) : 100,
  };
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
  <div className="flex items-center gap-2">
    <span className="text-xs text-slate-500">Range</span>
    <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
      {["1h", "24h", "7d", "30d"].map((k) => (
        <button
          key={k}
          onClick={() => onRangeChange(k)}
          className={`px-2.5 py-1 text-xs rounded-md ${rangeKey === k ? "bg-sky-600 text-white" : "text-slate-400"}`}
        >
          Last {k}
        </button>
      ))}
    </div>
  </div>
);

const WaveChart = ({ data, height = 200 }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const width = 1000;
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  if (!data || data.length === 0) {
    return <div className="w-full h-48 flex items-center justify-center text-slate-500 text-sm">No timeline data available</div>;
  }

  const maxV = Math.max(1, ...data.map((d) => Number(d.v || 0)));
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const ratio = i / 4;
    return {
      value: Math.round(ratio * maxV),
      y: padding.t + innerH - ratio * innerH,
      ratio,
    };
  });

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

  const formatPointTime = (timestamp) =>
    new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="relative" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
        <defs>
          <linearGradient id="waveGradientFileScanner" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridLines.map((grid, idx) => (
          <g key={`grid-${idx}`}>
            <line
              x1={padding.l}
              y1={grid.y}
              x2={padding.l + innerW}
              y2={grid.y}
              stroke="#1e293b"
              strokeWidth="1"
              opacity={grid.ratio === 0 || grid.ratio === 1 ? "1" : "0.5"}
            />
            <text x={padding.l - 5} y={grid.y + 4} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="600">
              {grid.value}
            </text>
          </g>
        ))}

        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" strokeWidth="1.5" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="#334155" strokeWidth="1.5" />
        <path d={pathD} stroke="#ef4444" strokeWidth="2.5" fill="none" opacity="0.8" />
        <path
          d={`${pathD} L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`}
          fill="url(#waveGradientFileScanner)"
        />

        {data.map((d, i) => {
          const x = padding.l + i * pointSpacing;
          const y = padding.t + innerH - (Number(d.v || 0) / maxV) * innerH;
          const isSelected = selectedPoint?.index === i;
          const pointData = { index: i, x, y, value: d.v, time: d.t };
          return (
            <g key={`${d.t}-${i}`}>
              <circle
                cx={x}
                cy={y}
                r="10"
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setSelectedPoint(pointData)}
                onFocus={() => setSelectedPoint(pointData)}
              />
              <circle cx={x} cy={y} r={isSelected ? "5" : "3.5"} fill="#ef4444" stroke="#0f172a" strokeWidth="1.5" opacity="0.95" />
            </g>
          );
        })}
      </svg>

      {selectedPoint && (
        <div
          className="pointer-events-none absolute z-10 min-w-[130px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`,
            top: `${Math.max(((selectedPoint.y - 48) / height) * 100, 4)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-white">{selectedPoint.value} detections</div>
          <div className="mt-1 text-slate-400">{formatPointTime(selectedPoint.time)}</div>
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
  <div className="flex flex-col gap-1.5">
    {items.length === 0 ? (
      <div className="text-xs text-slate-500">No data available</div>
    ) : (
      items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
          <span className="truncate max-w-[120px]">{it.label}</span>
          <span className="text-slate-500 tabular-nums ml-auto">{it.value}</span>
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

const PaginationControls = ({ pagination, page, loading, onPageChange }) => {
  const totalPages = pagination?.totalPages || 1;
  const total = pagination?.total || 0;
  const start = total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
  const end = Math.min(page * PAGE_LIMIT, total);

  const pages = [];
  const first = Math.max(1, page - 2);
  const last = Math.min(totalPages, page + 2);
  for (let value = first; value <= last; value += 1) pages.push(value);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-900/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-slate-400">
        Showing <span className="font-semibold text-slate-200">{start}</span> - <span className="font-semibold text-slate-200">{end}</span> of{" "}
        <span className="font-semibold text-slate-200">{total}</span> records
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={loading || page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((value) => (
            <button
              key={value}
              onClick={() => onPageChange(value)}
              disabled={loading || value === page}
              className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${value === page ? "bg-sky-600 text-white" : "border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
            >
              {value}
            </button>
          ))}
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={loading || page >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
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
  const [activeTab, setActiveTab] = useState("suspicious");
  const [selectedFile, setSelectedFile] = useState(null);
  const [copiedText, setCopiedText] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [isScanning, setIsScanning] = useState(false);
  const [rangeKey, setRangeKey] = useState("24h");
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState([]);
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const listEndpoint = activeTab === "errors" ? "file-scans/errors" : "file-scans/suspicious";
      const listParams = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
      const minutes = rangeToMinutes[rangeKey] || 1440;

      const listResponse = await fetchJson(
        `${API_ROOT}/${listEndpoint}?${listParams.toString()}`
      );

      const statsResponse = await fetchJson(
        `${API_ROOT}/file-scans/stats`
      );

      const timelineResponse = await fetchJson(
        `${API_ROOT}/file-scans/timeline?minutes=${minutes}`
      );

      const normalizedList = (listResponse.data || []).map(normalizeFileScan);
      if (activeTab === "errors") {
        setErrors(normalizedList);
        setFiles([]);
      } else {
        setFiles(normalizedList);
        setErrors([]);
      }

      setStats(statsResponse.data || null);
      setTimeline(
        (timelineResponse.data || []).map((item) => ({
          t: item.timestamp,
          v: Number(item.suspicious ?? item.total ?? 0),
        }))
      );
      setPagination(listResponse.pagination || { page, limit: PAGE_LIMIT, total: normalizedList.length, totalPages: 1 });
    } catch (error) {
      console.error(error);
      setLoadError(error.message || "Failed to load file scan data");
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, rangeKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, rangeKey]);

  const visibleRows = activeTab === "errors" ? errors : files;

  const filteredFiles = useMemo(() => {
    let result = files;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((file) => `${file.fileName} ${file.filePath} ${file.sha256}`.toLowerCase().includes(q));
    }
    if (filterSeverity !== "all") {
      result = result.filter((file) => file.findings.some((finding) => finding.severity === filterSeverity));
    }
    return result;
  }, [files, searchQuery, filterSeverity]);

  const analytics = useMemo(() => {
    const fileTypes = (stats?.fileTypes || [])
      .map((item, i) => ({
        label: item.fileType || "unknown",
        value: item.count || 0,
        color: ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6"][i % 7],
      }))
      .slice(0, 7);

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

    const errorTypeMap = new Map();
    errors.forEach((error) => {
      const label = error.error ? String(error.error).split(":")[0] : "Scan Error";
      errorTypeMap.set(label, (errorTypeMap.get(label) || 0) + 1);
    });
    const errorTypes = Array.from(errorTypeMap.entries()).map(([label, value], i) => ({
      label,
      value,
      color: ["#f87171", "#fb923c", "#fbbf24", "#a78bfa"][i % 4],
    }));

    const folderMap = new Map();
    visibleRows.forEach((file) => folderMap.set(file.folder, (folderMap.get(file.folder) || 0) + 1));
    const topFolders = Array.from(folderMap.entries())
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const scannerMap = new Map();
    visibleRows.forEach((file) => scannerMap.set(file.scanner, (scannerMap.get(file.scanner) || 0) + 1));
    const topScanners = Array.from(scannerMap.entries())
      .map(([scanner, count]) => ({ scanner, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { fileTypes, severities, errorTypes, topFolders, topScanners };
  }, [stats, files, errors, visibleRows]);

  const health = useMemo(() => {
    const total = Number(stats?.totalEvents || 0);
    if (!total) return 100;
    const errorsCount = Number(stats?.totalErrorScans || 0);
    return Math.max(0, Number((((total - errorsCount) / total) * 100).toFixed(1)));
  }, [stats]);

  const detectionRate = useMemo(() => {
    const total = Number(stats?.totalSuccessScans || 0);
    if (!total) return "0.0";
    return ((Number(stats?.suspiciousScans || 0) / total) * 100).toFixed(1);
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
    setRangeKey(nextRange);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-4 md:p-6 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Bug className="h-6 w-6 text-red-400" />
                File Content Scanner
              </h1>
              <p className="text-sm text-slate-400">Data diambil langsung dari backend File Scan dan Elasticsearch</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isScanning || loading}
                className="disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 bg-sky-600 hover:bg-sky-700 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2"
              >
                {isScanning || loading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Refresh Data
                  </>
                )}
              </button>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-400 transition-colors border border-slate-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {loadError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{loadError}</div>}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Events</div>
              <div className="text-2xl font-black text-blue-400 mt-1">{stats?.totalEvents ?? 0}</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="text-[10px] text-red-400 uppercase font-semibold">Suspicious</div>
              <div className="text-2xl font-black text-red-300 mt-1">{stats?.suspiciousScans ?? 0}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              <div className="text-[10px] text-emerald-400 uppercase font-semibold">Clean</div>
              <div className="text-2xl font-black text-emerald-300 mt-1">{stats?.cleanScans ?? 0}</div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <div className="text-[10px] text-orange-400 uppercase font-semibold">Errors</div>
              <div className="text-2xl font-black text-orange-300 mt-1">{stats?.totalErrorScans ?? 0}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Health</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">{health}%</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
              <div className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Detection Timeline
              </div>
              <RangeFilter rangeKey={rangeKey} onRangeChange={handleRangeChange} />
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              <WaveChart data={timeline} />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl font-black text-red-400">{stats?.suspiciousScans ?? 0}</div>
              <div className="text-xs text-slate-400 uppercase font-semibold mt-1">Threats Detected</div>
              <div className="text-lg font-bold text-slate-300 mt-4">{detectionRate}%</div>
              <div className="text-xs text-slate-500">Detection Rate</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
            <div className="text-sm font-semibold text-slate-300 mb-4 w-full">File Type Distribution</div>
            <div className="flex items-center gap-4 justify-center w-full">
              <Donut items={analytics.fileTypes} size={120} centerLabelTop={stats?.totalSuccessScans ?? 0} centerLabelBottom="files" />
              <div className="flex-1 min-w-0"><Legend items={analytics.fileTypes} /></div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
            <div className="text-sm font-semibold text-slate-300 mb-4 w-full">Severity Distribution</div>
            <div className="flex items-center gap-4 justify-center w-full">
              <Donut items={analytics.severities} size={120} centerLabelTop={files.length} centerLabelBottom="page" />
              <div className="flex-1 min-w-0"><Legend items={analytics.severities} /></div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
            <div className="text-sm font-semibold text-slate-300 mb-4 w-full">Error Type Breakdown</div>
            <div className="flex items-center gap-4 justify-center w-full">
              <Donut items={analytics.errorTypes} size={120} centerLabelTop={errors.length} centerLabelBottom="page" />
              <div className="flex-1 min-w-0"><Legend items={analytics.errorTypes} /></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Network className="h-4 w-4 text-red-400" />
              <div>
                <div className="text-sm font-semibold text-slate-200">Top Scanner Sources</div>
                <div className="text-xs text-slate-500">Scanner frequency from the current table page</div>
              </div>
            </div>
            <CompactBarChart
              items={analytics.topScanners}
              getKey={(item) => item.scanner}
              getLabel={(item) => item.scanner}
              getValue={(item) => item.count}
              getBarColor={() => "linear-gradient(90deg, #0ea5e9 0%, #38bdf8 100%)"}
              secondaryValue={(item) => `${item.count} event(s)`}
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="h-4 w-4 text-amber-400" />
              <div>
                <div className="text-sm font-semibold text-slate-200">Top Scanned Folders</div>
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

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="flex border-b border-slate-800 bg-slate-800/50">
            <button
              onClick={() => setActiveTab("suspicious")}
              className={`flex-1 px-6 py-4 font-medium transition-all border-b-2 ${activeTab === "suspicious" ? "text-red-400 border-red-400 bg-slate-800/50" : "text-slate-400 border-transparent hover:text-slate-300"
                }`}
            >
              <span className="flex items-center gap-2 justify-center">
                <Bug className="h-4 w-4" />
                Suspicious Files ({activeTab === "suspicious" ? pagination.total : stats?.suspiciousScans ?? 0})
              </span>
            </button>
            <button
              onClick={() => setActiveTab("errors")}
              className={`flex-1 px-6 py-4 font-medium transition-all border-b-2 ${activeTab === "errors" ? "text-orange-400 border-orange-400 bg-slate-800/50" : "text-slate-400 border-transparent hover:text-slate-300"
                }`}
            >
              <span className="flex items-center gap-2 justify-center">
                <AlertCircle className="h-4 w-4" />
                Error Logs ({activeTab === "errors" ? pagination.total : stats?.totalErrorScans ?? 0})
              </span>
            </button>
          </div>

          <div className="p-6">
            {activeTab === "suspicious" && (
              <div className="mb-[12px] space-y-4">
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-64 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search current page by file name, path, or SHA-256..."
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

                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-800/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">File</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Scanner</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">File Path</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Severity</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Findings</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Detected</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <EmptyState message="Loading file scan data from backend..." />
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
                              <td className="px-4 py-3">
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
                              <td className="px-4 py-3 text-xs text-slate-400">{file.fileType}</td>
                              <td className="px-4 py-3 text-xs text-slate-400 font-mono">{file.scanner}</td>
                              <td className="px-4 py-3 max-w-[300px]">
                                <div className="font-mono text-xs text-amber-300 truncate" title={file.filePath}>{file.filePath || "-"}</div>
                              </td>
                              <td className="px-4 py-3"><RiskIndicator severity={maxSeverity?.severity || "HIGH"} /></td>
                              <td className="px-4 py-3 text-xs"><span className="text-slate-300 font-mono">{file.findingsCount} found</span></td>
                              <td className="px-4 py-3 text-xs text-slate-400">
                                {file.timestamp ? new Date(file.timestamp).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                              </td>
                              <td className="px-4 py-3">
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
            )}

            {activeTab === "errors" && (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">File Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Scanner</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">File Path</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Error Message</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Timestamp</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Loading error logs from backend...</td></tr>
                    ) : errors.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No file scan error data found.</td></tr>
                    ) : (
                      errors.map((error, idx) => (
                        <tr key={error.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${idx % 2 !== 0 ? "bg-slate-900/30" : ""}`}>
                          <td className="px-4 py-3 text-xs text-sky-300 font-mono truncate max-w-xs">{error.fileName}</td>
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono">{error.scanner}</td>
                          <td className="px-4 py-3 max-w-[300px]"><div className="font-mono text-xs text-amber-300 truncate" title={error.filePath}>{error.filePath || "-"}</div></td>
                          <td className="px-4 py-3 text-xs text-slate-400 max-w-[360px]"><div className="truncate" title={error.error}>{error.error || "Scan error"}</div></td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {error.timestamp ? new Date(error.timestamp).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedFile(error)}
                              className="px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                            >
                              <FileText className="h-3.5 w-3.5" /> Detail
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <PaginationControls pagination={pagination} page={page} loading={loading} onPageChange={setPage} />
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-700/30 rounded-lg p-4 border border-slate-700">
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">File Type</p><p className="text-sm text-slate-100">{selectedFile.fileType}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Size</p><p className="text-sm text-slate-100">{selectedFile.sizeLabel}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Scanner</p><p className="text-sm text-slate-100">{selectedFile.scanner}</p></div>
                  <div className="md:col-span-2"><p className="text-xs text-slate-400 uppercase font-semibold mb-1">File Path</p><p className="text-sm font-mono text-amber-300 break-all">{selectedFile.filePath || "-"}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Detected</p><p className="text-sm text-slate-100">{selectedFile.timestamp ? new Date(selectedFile.timestamp).toLocaleString() : "-"}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Action</p><p className="text-sm text-slate-100">{selectedFile.actionStatus}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Scan Health</p><HealthIndicator health={selectedFile.health} /></div>
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
