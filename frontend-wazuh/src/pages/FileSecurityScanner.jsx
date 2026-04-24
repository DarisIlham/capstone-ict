import React, { useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import { API_BASE_URL } from "../config/Api";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
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
} from "lucide-react";

// ========================================
// Range Filter Component
// ========================================
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

// ========================================
// SVG Chart Components
// ========================================

const WaveChart = ({ data, height = 200 }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const width = 1000;
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-48 flex items-center justify-center text-slate-500 text-sm">
        No data available
      </div>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => d.v));
  const pointSpacing = data.length ? innerW / (data.length - 1) : innerW;

  // Calculate grid intervals
  const gridSteps = 5;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i++) {
    const ratio = i / (gridSteps - 1);
    const value = Math.round(ratio * maxV);
    const y = padding.t + innerH - (ratio * innerH);
    gridLines.push({ value, y, ratio });
  }

  // Generate smooth curve path using cubic bezier
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

  const formatPointTime = (timestamp) =>
    new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="relative" onMouseLeave={() => setSelectedPoint(null)}>
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
      {/* Grid lines */}
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

      {/* Y-axis */}
      <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" strokeWidth="1.5" />

      {/* X-axis */}
      <line
        x1={padding.l}
        y1={padding.t + innerH}
        x2={padding.l + innerW}
        y2={padding.t + innerH}
        stroke="#334155"
        strokeWidth="1.5"
      />

      {/* Wave line */}
      <path d={pathD} stroke="#ef4444" strokeWidth="2.5" fill="none" opacity="0.8" />

      {/* Gradient fill under curve */}
      <defs>
        <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`}
        fill="url(#waveGradient)"
      />

      {/* Data points (dots) */}
      {data.map((d, i) => {
        const x = padding.l + i * pointSpacing;
        const y = padding.t + innerH - (d.v / maxV) * innerH;
        const isSelected = selectedPoint?.index === i;
        const pointData = { index: i, x, y, value: d.v, time: d.t };
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={isSelected ? "7" : "10"}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setSelectedPoint(pointData)}
              onMouseLeave={() => setSelectedPoint(null)}
              onFocus={() => setSelectedPoint(pointData)}
              onBlur={() => setSelectedPoint(null)}
            />
            <circle
              cx={x}
              cy={y}
              r={isSelected ? "5" : "3.5"}
              fill="#ef4444"
              stroke="#0f172a"
              strokeWidth="1.5"
              opacity="0.95"
              className="pointer-events-none"
            />
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
          const strokeDashoffset = -currentOffset;

          return (
            <circle
              key={it.label}
              r={r}
              fill="transparent"
              stroke={it.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={strokeDashoffset}
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
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
        <span className="truncate max-w-[120px]">{it.label}</span>
        <span className="text-slate-500 tabular-nums ml-auto">{it.value}</span>
      </div>
    ))}
  </div>
);

const CompactBarChart = ({
  items,
  getKey,
  getLabel,
  getValue,
  getBarColor = () => "#38bdf8",
  formatValue = (value) => value,
  secondaryValue,
}) => {
  const maxValue = Math.max(...items.map((item) => getValue(item)), 1);

  if (!items.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-800/20 text-sm text-slate-500">
        No destination data available
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
              style={{
                width: `${(getValue(item) / maxValue) * 100}%`,
                background: getBarColor(item),
              }}
            />
            {secondaryValue ? (
              <div className="absolute inset-y-0 right-2 flex items-center text-[10px] font-semibold text-slate-100">
                {secondaryValue(item)}
              </div>
            ) : null}
          </div>
          <div className="w-10 text-right text-xs font-bold text-slate-200">{formatValue(getValue(item), item)}</div>
        </div>
      ))}
    </div>
  );
};

const RiskIndicator = ({ severity }) => {
  const colors = {
    CRITICAL: "text-red-400 bg-red-500/20",
    HIGH: "text-orange-400 bg-orange-500/20",
    MEDIUM: "text-yellow-400 bg-yellow-500/20",
    LOW: "text-blue-400 bg-blue-500/20",
  };
  const color = colors[severity] || "text-slate-400 bg-slate-500/20";
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold ${color}`}>
      {severity}
    </span>
  );
};

const HealthIndicator = ({ health }) => {
  const tone =
    health >= 90
      ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
      : health >= 75
      ? "text-amber-300 bg-amber-500/15 border-amber-500/30"
      : "text-red-300 bg-red-500/15 border-red-500/30";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {health}%
    </span>
  );
};

// ========================================
// Main Component
// ========================================
const FileSecurityScanner = () => {
  const [activeTab, setActiveTab] = useState("suspicious");
  const [selectedFile, setSelectedFile] = useState(null);
  const [copiedText, setCopiedText] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [isScanning, setIsScanning] = useState(false);
  const [rangeKey, setRangeKey] = useState("24h");

  // Generate comprehensive mock data
  const mockData = useMemo(() => {
    const fileTypes = ["PDF", "DOCX", "XLSX", "PNG", "JPG", "ZIP", "EXE"];
    const destinationIps = [
      "10.20.14.11",
      "10.20.14.24",
      "172.16.5.34",
      "172.16.5.77",
      "192.168.10.18",
      "192.168.10.44",
      "203.0.113.7",
      "203.0.113.29",
      "198.51.100.15",
      "198.51.100.48",
    ];
    const destinationFolders = [
      "/srv/uploads/hr",
      "/srv/uploads/finance",
      "/srv/uploads/engineering",
      "/var/quarantine/incoming",
      "/mnt/share/legal",
      "/mnt/share/operations",
      "/opt/archive/review",
      "/data/staging/contracts",
      "/data/staging/images",
      "/home/shared/reports",
    ];
    const indicators = [
      { type: "php_open_tag", name: "PHP Open Tag", desc: "PHP code detected in file", severity: "HIGH" },
      { type: "embedded_javascript", name: "Embedded JavaScript", desc: "Executable JavaScript found", severity: "CRITICAL" },
      { type: "suspicious_macro", name: "Suspicious Macro", desc: "Macro that performs unauthorized actions", severity: "HIGH" },
      { type: "malware_signature", name: "Malware Signature", desc: "Known malware pattern detected", severity: "CRITICAL" },
      { type: "obfuscated_code", name: "Obfuscated Code", desc: "Hidden or encoded executable code", severity: "HIGH" },
      { type: "url_indicator", name: "URL Indicator", desc: "Suspicious external URL references", severity: "MEDIUM" },
    ];

    const suspiciousFiles = Array.from({ length: 12 }, (_, i) => {
      const indicatorData = indicators[Math.floor(Math.random() * indicators.length)];
      const fileType = fileTypes[i % fileTypes.length];
      const findings = [indicatorData];
      if (Math.random() > 0.6) findings.push(indicators[Math.floor(Math.random() * indicators.length)]);

      return {
        id: `scan-${i + 1}`,
        fileName: `document_${i + 1}.${fileType.toLowerCase()}`,
        fileType,
        size: Math.floor(Math.random() * 5000) + 100,
        timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        sha256: Math.random().toString(16).substring(2).padEnd(64, "0").substring(0, 64),
        md5: Math.random().toString(16).substring(2).padEnd(32, "0").substring(0, 32),
        findings,
        extractedUrls: Math.random() > 0.5
          ? ["http://malicious-domain.com/payload", "https://phishing.site/login", "http://c2-server.ru/beacon"].slice(
              0,
              Math.floor(Math.random() * 3) + 1
            )
          : [],
        matchedMetadata: Math.random() > 0.6
          ? [
              "eval() function detected",
              "Base64 encoded shellcode",
              "Command execution attempt",
              "Network communication code",
            ].slice(0, Math.floor(Math.random() * 4) + 1)
          : [],
        destinationIp: destinationIps[i % destinationIps.length],
        destinationFolder: destinationFolders[i % destinationFolders.length],
        actionStatus: i % 3 === 0 ? "Analyze then Block" : "Analyze then Proceed",
        destinationHealth: Number((72 + Math.random() * 26).toFixed(1)),
        scannerInfo: { name: ["python-tika-scanner", "virustotal-api", "clamav-engine"][Math.floor(Math.random() * 3)], version: "1.2.3" },
      };
    });

    const errors = Array.from({ length: 5 }, (_, i) => ({
      id: `err-${i + 1}`,
      fileName: `failed_${i + 1}.${fileTypes[i % fileTypes.length].toLowerCase()}`,
      timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      errorType: ["FILE_TOO_LARGE", "CORRUPTED_FILE", "TIMEOUT", "PERMISSION_DENIED"][Math.floor(Math.random() * 4)],
      destinationIp: destinationIps[(i + 2) % destinationIps.length],
      destinationFolder: destinationFolders[(i + 2) % destinationFolders.length],
      errorMessage:
        i === 0
          ? "File size exceeds maximum limit of 100MB"
          : i === 1
          ? "File header is corrupted or unrecognized"
          : i === 2
          ? "Scan operation exceeded time limit (30 seconds)"
          : "Insufficient permissions to read file",
    }));

    const now = Date.now();
    const events = Array.from({ length: 24 }, (_, i) => ({
      t: now - (23 - i) * 3600000,
      v: Math.floor(Math.random() * 12) + 2,
    }));

    return {
      stats: { totalScanned: 287, suspiciousFiles: 12, cleanFiles: 270, errorCount: 5, scanHealth: 94.2 },
      suspiciousFiles,
      errors,
      events,
    };
  }, []);

  // Calculate derived analytics
  const analytics = useMemo(() => {
    // File type distribution
    const fileTypeMap = new Map();
    mockData.suspiciousFiles.forEach((f) => {
      fileTypeMap.set(f.fileType, (fileTypeMap.get(f.fileType) || 0) + 1);
    });
    const fileTypes = Array.from(fileTypeMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .map((it, i) => ({
        ...it,
        color: ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6"][i % 7],
      }));

    // Risk severity distribution
    const severityMap = new Map();
    mockData.suspiciousFiles.forEach((f) => {
      const maxSev = f.findings.reduce((max, finding) => {
        const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return order[finding.severity] > order[max] ? finding.severity : max;
      }, "LOW");
      severityMap.set(maxSev, (severityMap.get(maxSev) || 0) + 1);
    });
    const severities = Array.from(severityMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return order[a.label] - order[b.label];
      })
      .map((it) => {
        const colorMap = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#3b82f6" };
        return { ...it, color: colorMap[it.label] };
      });

    // Error type distribution
    const errorTypeMap = new Map();
    mockData.errors.forEach((e) => {
      errorTypeMap.set(e.errorType, (errorTypeMap.get(e.errorType) || 0) + 1);
    });
    const errorTypes = Array.from(errorTypeMap.entries())
      .map(([label, value]) => ({ label, value }))
      .map((it, i) => ({
        ...it,
        color: ["#f87171", "#fb923c", "#fbbf24", "#a78bfa"][i % 4],
      }));

    const destinationIpMap = new Map();
    const destinationFolderMap = new Map();
    const destinationHealthMap = new Map();

    mockData.suspiciousFiles.forEach((f) => {
      destinationIpMap.set(f.destinationIp, (destinationIpMap.get(f.destinationIp) || 0) + 1);
      destinationFolderMap.set(f.destinationFolder, (destinationFolderMap.get(f.destinationFolder) || 0) + 1);

      if (!destinationHealthMap.has(f.destinationIp)) {
        destinationHealthMap.set(f.destinationIp, []);
      }
      destinationHealthMap.get(f.destinationIp).push(f.destinationHealth);
    });

    const topDestinationIps = Array.from(destinationIpMap.entries())
      .map(([ip, count]) => {
        const values = destinationHealthMap.get(ip) || [];
        const avgHealth = values.length
          ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
          : 0;
        return { ip, count, health: avgHealth };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topDestinationFolders = Array.from(destinationFolderMap.entries())
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { fileTypes, severities, errorTypes, topDestinationIps, topDestinationFolders };
  }, [mockData]);

  // Filter suspicious files
  const filteredFiles = useMemo(() => {
    let result = mockData.suspiciousFiles;
    if (searchQuery) result = result.filter((f) => f.fileName.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filterSeverity !== "all") result = result.filter((f) => f.findings.some((finding) => finding.severity === filterSeverity));
    return result;
  }, [searchQuery, filterSeverity, mockData.suspiciousFiles]);

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getVirusTotalLink = (sha256) => `https://www.virustotal.com/gui/file/${sha256}`;

  const handleStartScan = async () => {
    setIsScanning(true);
    try {
      // Simulate scan process
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // In real scenario, would call: POST /api/file-scans/start
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-4 md:p-6 flex flex-col gap-4">
        {/* Header & Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Bug className="h-6 w-6 text-red-400" />
                File Content Scanner
              </h1>
              <p className="text-sm text-slate-400">Real-time detection of malicious content and indicators of compromise</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleStartScan}
                disabled={isScanning}
                className="disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 bg-sky-600 hover:bg-sky-700 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2"
              >
                {isScanning ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Start Scan
                  </>
                )}
              </button>
              <button className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-400 transition-colors border border-slate-700">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Scanned</div>
              <div className="text-2xl font-black text-blue-400 mt-1">{mockData.stats.totalScanned}</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="text-[10px] text-red-400 uppercase font-semibold">Suspicious</div>
              <div className="text-2xl font-black text-red-300 mt-1">{mockData.stats.suspiciousFiles}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              <div className="text-[10px] text-emerald-400 uppercase font-semibold">Clean</div>
              <div className="text-2xl font-black text-emerald-300 mt-1">{mockData.stats.cleanFiles}</div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <div className="text-[10px] text-orange-400 uppercase font-semibold">Errors</div>
              <div className="text-2xl font-black text-orange-300 mt-1">{mockData.stats.errorCount}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Health</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">{mockData.stats.scanHealth}%</div>
            </div>
          </div>
        </div>

        {/* Row 1: Detection Timeline + Total Detections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Detection Timeline (Wave Chart) */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Detection Timeline (Last 24 Hours)
              </div>
              <RangeFilter rangeKey={rangeKey} onRangeChange={setRangeKey} />
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              <WaveChart data={mockData.events} />
            </div>
          </div>

          {/* Total Detections Stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl font-black text-red-400">{mockData.stats.suspiciousFiles}</div>
              <div className="text-xs text-slate-400 uppercase font-semibold mt-1">Threats Detected</div>
              <div className="text-lg font-bold text-slate-300 mt-4">
                {((mockData.stats.suspiciousFiles / mockData.stats.totalScanned) * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">Detection Rate</div>
            </div>
          </div>
        </div>

        {/* Row 2: Distribution Donuts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* File Type Distribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
            <div className="text-sm font-semibold text-slate-300 mb-4 w-full">File Type Distribution</div>
            <div className="flex items-center gap-4 justify-center w-full">
              <Donut items={analytics.fileTypes} size={120} centerLabelTop={mockData.stats.suspiciousFiles} centerLabelBottom="files" />
              <div className="flex-1 min-w-0">
                <Legend items={analytics.fileTypes} />
              </div>
            </div>
          </div>

          {/* Risk Severity Distribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
            <div className="text-sm font-semibold text-slate-300 mb-4 w-full">Severity Distribution</div>
            <div className="flex items-center gap-4 justify-center w-full">
              <Donut items={analytics.severities} size={120} centerLabelTop={mockData.stats.suspiciousFiles} centerLabelBottom="cases" />
              <div className="flex-1 min-w-0">
                <Legend items={analytics.severities} />
              </div>
            </div>
          </div>

          {/* Error Type Distribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
            <div className="text-sm font-semibold text-slate-300 mb-4 w-full">Error Type Breakdown</div>
            <div className="flex items-center gap-4 justify-center w-full">
              <Donut items={analytics.errorTypes} size={120} centerLabelTop={mockData.stats.errorCount} centerLabelBottom="errors" />
              <div className="flex-1 min-w-0">
                <Legend items={analytics.errorTypes} />
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Destination Overview */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Network className="h-4 w-4 text-red-400" />
              <div>
                <div className="text-sm font-semibold text-slate-200">Top 10 Destination IP</div>
                <div className="text-xs text-slate-500">Frequency and average health by destination</div>
              </div>
            </div>
            <CompactBarChart
              items={analytics.topDestinationIps}
              getKey={(item) => item.ip}
              getLabel={(item) => item.ip}
              getValue={(item) => item.count}
              getBarColor={() => "linear-gradient(90deg, #0ea5e9 0%, #38bdf8 100%)"}
              secondaryValue={(item) => `${item.health}%`}
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="h-4 w-4 text-amber-400" />
              <div>
                <div className="text-sm font-semibold text-slate-200">Top 10 Destination Folders</div>
                <div className="text-xs text-slate-500">Most targeted folders for suspicious file delivery</div>
              </div>
            </div>
            <CompactBarChart
              items={analytics.topDestinationFolders}
              getKey={(item) => item.folder}
              getLabel={(item) => item.folder}
              getValue={(item) => item.count}
              getBarColor={() => "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)"}
            />
          </div>
        </div>

        {/* Row 4: Suspicious Files & Errors Tabs */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-slate-800 bg-slate-800/50">
            <button
              onClick={() => setActiveTab("suspicious")}
              className={`flex-1 px-6 py-4 font-medium transition-all border-b-2 ${
                activeTab === "suspicious"
                  ? "text-red-400 border-red-400 bg-slate-800/50"
                  : "text-slate-400 border-transparent hover:text-slate-300"
              }`}
            >
              <span className="flex items-center gap-2 justify-center">
                <Bug className="h-4 w-4" />
                Suspicious Files ({filteredFiles.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab("errors")}
              className={`flex-1 px-6 py-4 font-medium transition-all border-b-2 ${
                activeTab === "errors"
                  ? "text-orange-400 border-orange-400 bg-slate-800/50"
                  : "text-slate-400 border-transparent hover:text-slate-300"
              }`}
            >
              <span className="flex items-center gap-2 justify-center">
                <AlertCircle className="h-4 w-4" />
                Error Logs ({mockData.errors.length})
              </span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === "suspicious" && (
              <div className="mb-[12px] space-y-4">
                {/* Filters */}
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-64 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search file name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    {["all", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((severity) => (
                      <button
                        key={severity}
                        onClick={() => setFilterSeverity(severity)}
                        className={`px-3 py-2 text-xs rounded-lg font-medium transition-colors ${
                          filterSeverity === severity
                            ? "bg-red-600 text-white"
                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                        }`}
                      >
                        {severity}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-800/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">File</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Destination IP</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Destination Folder</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Severity</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Findings</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Detected</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Response Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFiles.map((file, idx) => {
                        const maxSeverity = file.findings.reduce((max, f) => {
                          const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
                          return order[f.severity] > order[max.severity] ? f : max;
                        });
                        return (
                          <tr
                            key={file.id}
                            className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${idx % 2 !== 0 ? "bg-slate-900/30" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-xs font-bold text-slate-300">
                                  {file.fileType.charAt(0)}
                                </div>
                                <span className="font-mono text-sky-300 text-xs truncate max-w-xs">{file.fileName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">{file.fileType}</td>
                            <td className="px-4 py-3">
                              <div className="font-mono text-xs text-sky-300">{file.destinationIp}</div>
                              <div className="mt-1">
                                <HealthIndicator health={file.destinationHealth} />
                              </div>
                            </td>
                            <td className="px-4 py-3 max-w-[240px]">
                              <div className="font-mono text-xs text-amber-300 truncate">{file.destinationFolder}</div>
                            </td>
                            <td className="px-4 py-3">
                              <RiskIndicator severity={maxSeverity.severity} />
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <span className="text-slate-300 font-mono">{file.findings.length} found</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">
                              {new Date(file.timestamp).toLocaleString("en-US", {
                                month: "short",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setSelectedFile(file)}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                                  file.actionStatus === "Analyze then Block"
                                    ? "bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                    : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                                }`}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                {file.actionStatus}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "errors" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">File Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Error Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Destination IP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Destination Folder</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Message</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockData.errors.map((error, idx) => (
                      <tr
                        key={error.id}
                        className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${idx % 2 !== 0 ? "bg-slate-900/30" : ""}`}
                      >
                        <td className="px-4 py-3 text-xs text-sky-300 font-mono truncate max-w-xs">{error.fileName}</td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-400">{error.errorType}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-sky-300 font-mono">{error.destinationIp}</td>
                        <td className="px-4 py-3 max-w-[240px]">
                          <div className="font-mono text-xs text-amber-300 truncate">{error.destinationFolder}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{error.errorMessage}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(error.timestamp).toLocaleString("en-US", {
                            month: "short",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========== FORENSIC DETAIL MODAL ========== */}
      {selectedFile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-4xl w-full max-h-[95vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-700 rounded flex items-center justify-center text-sm font-bold text-slate-300">
                  {selectedFile.fileType.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">{selectedFile.fileName}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Forensic Analysis Report</p>
                </div>
              </div>
              <button onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-slate-200 text-2xl">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* File Metadata */}
              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  File Metadata
                </h3>
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-700 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">File Type</p>
                    <p className="text-sm text-slate-100">{selectedFile.fileType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">File Size</p>
                    <p className="text-sm text-slate-100">{selectedFile.size} KB</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Scanner</p>
                    <p className="text-sm text-slate-100">
                      {selectedFile.scannerInfo.name} v{selectedFile.scannerInfo.version}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Destination IP</p>
                    <p className="text-sm font-mono text-sky-300">{selectedFile.destinationIp}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Destination Folder</p>
                    <p className="text-sm font-mono text-amber-300 break-all">{selectedFile.destinationFolder}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Detected</p>
                    <p className="text-sm text-slate-100">{new Date(selectedFile.timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Response Action</p>
                    <p className="text-sm text-slate-100">{selectedFile.actionStatus}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Destination Health</p>
                    <div>
                      <HealthIndicator health={selectedFile.destinationHealth} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Hash for Forensics */}
              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  File Hashes (Forensic Verification)
                </h3>
                <div className="space-y-3 bg-slate-700/30 rounded-lg p-4 border border-slate-700">
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-2">SHA-256</p>
                    <div className="flex items-center gap-2 bg-slate-800/50 rounded p-2">
                      <code className="text-xs text-slate-300 font-mono flex-1 break-all">{selectedFile.sha256}</code>
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyToClipboard(selectedFile.sha256, "sha256")}
                          className={`p-1.5 rounded transition-colors ${
                            copiedText === "sha256"
                              ? "bg-green-500/30 text-green-300"
                              : "bg-slate-600/30 text-slate-400 hover:bg-slate-600"
                          }`}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <a
                          href={getVirusTotalLink(selectedFile.sha256)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded bg-slate-600/30 text-slate-400 hover:text-sky-400 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-2">MD5</p>
                    <div className="flex items-center gap-2 bg-slate-800/50 rounded p-2">
                      <code className="text-xs text-slate-300 font-mono flex-1 break-all">{selectedFile.md5}</code>
                      <button
                        onClick={() => copyToClipboard(selectedFile.md5, "md5")}
                        className={`p-1.5 rounded transition-colors ${
                          copiedText === "md5"
                            ? "bg-green-500/30 text-green-300"
                            : "bg-slate-600/30 text-slate-400 hover:bg-slate-600"
                        }`}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Threat Indicators */}
              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Detected Indicators ({selectedFile.findings.length})
                </h3>
                <div className="space-y-3">
                  {selectedFile.findings.map((finding, idx) => (
                    <div key={idx} className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-100">{finding.name}</p>
                            <RiskIndicator severity={finding.severity} />
                          </div>
                          <p className="text-sm text-slate-400 mt-1">{finding.desc}</p>
                          <p className="text-xs text-slate-500 mt-2 font-mono">{finding.type}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Extracted URLs */}
              {selectedFile.extractedUrls.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Extracted URLs ({selectedFile.extractedUrls.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedFile.extractedUrls.map((url, idx) => (
                      <div key={idx} className="bg-slate-700/30 rounded-lg p-3 border border-slate-700 flex items-center justify-between gap-3">
                        <code className="text-xs text-slate-300 font-mono flex-1 break-all">{url}</code>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-slate-400 hover:text-sky-400 transition-colors flex-shrink-0"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Metadata */}
              {selectedFile.matchedMetadata.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Matched Metadata ({selectedFile.matchedMetadata.length})</h3>
                  <div className="space-y-2">
                    {selectedFile.matchedMetadata.map((metadata, idx) => (
                      <div key={idx} className="bg-slate-700/30 rounded-lg p-3 border border-slate-700">
                        <p className="text-sm text-slate-300 font-mono">{metadata}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis Actions */}
              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-3">Recommended Actions</h3>
                <div className="grid grid-cols-3 gap-3">
                  <a
                    href={getVirusTotalLink(selectedFile.sha256)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    VirusTotal
                  </a>
                  <button className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                    <Copy className="h-4 w-4" />
                    Export
                  </button>
                  <button
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      selectedFile.actionStatus === "Analyze then Block"
                        ? "bg-red-600/20 hover:bg-red-600/30 text-red-300"
                        : "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {selectedFile.actionStatus}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileSecurityScanner;
