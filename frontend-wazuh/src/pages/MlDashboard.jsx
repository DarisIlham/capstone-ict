import React, { useEffect, useMemo, useState } from 'react';
import Navbar from '../components/Navbar';
import { BrainCircuit } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
} from 'recharts';
import mlApi from '../services/mlApi';

// ========================================
// SVG Chart Components
// ========================================

// Horizontal bar chart untuk Source IPs dengan gradient color, dashed pattern, dan UI yang lebih bagus
const HorizontalBarChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-slate-500">No data</div>;
  }
  
  const maxCount = Math.max(1, ...data.map(d => d.count));
  const rowHeight = 62;
  const chartHeight = data.length * rowHeight + 24;
  const labelWidth = 220;
  const barStartX = 240;
  const barMaxWidth = 860;
  const rankX = 1160;
  
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
      <svg width="100%" height={chartHeight} viewBox={`0 0 1200 ${chartHeight}`} className="block w-full">
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
              <rect x={barStartX} y={y + 2} width={barMaxWidth} height="42" fill="#0f172a" rx="8" opacity="0.3" />
              
              {/* Background bar container */}
              <rect x={barStartX} y={y} width={barMaxWidth} height="42" fill="#1e293b" rx="8" strokeWidth="0.5" stroke="#334155" />
              
              {/* Solid bar with smooth edges */}
              <rect 
                x={barStartX} y={y} width={barWidth} height="42" 
                fill={color}
                rx="8"
                filter="url(#barGlow)"
              />
              
              {/* Bar border - outline untuk edge yang lebih tajam */}
              <rect 
                x={barStartX} y={y} width={barWidth} height="42" 
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
                  x={barStartX + barWidth - 12} y={y + 28} 
                  textAnchor="end" 
                  fontSize="16" 
                  fill="white" 
                  fontWeight="700"
                  fontFamily="'Courier New', monospace"
                >
                  {item.count}
                </text>
              ) : (
                <text 
                  x={barStartX + barWidth + 12} y={y + 28} 
                  textAnchor="start" 
                  fontSize="16" 
                  fill={color} 
                  fontWeight="700"
                  fontFamily="'Courier New', monospace"
                >
                  {item.count}
                </text>
              )}
              
              {/* IP Label - dengan background subtle */}
              <rect x="8" y={y + 4} width={labelWidth} height="34" fill="#1e293b" rx="6" opacity="0.7" />
              <text 
                x={labelWidth / 2 + 8} y={y + 26} 
                textAnchor="middle"
                fontSize="18" 
                fill="white" 
                fontWeight="700" 
                fontFamily="'Courier New', monospace"
              >
                {item.label}
              </text>
              
              {/* Rank - dengan styling yang lebih baik */}
              <circle cx={rankX} cy={y + 21} r="13" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
              <text 
                x={rankX} y={y + 27} 
                textAnchor="middle" 
                fontSize="16" 
                fill="white" 
                fontWeight="700"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
        
        {/* Separator line */}
        <line x1="0" y1={chartHeight - 10} x2="1200" y2={chartHeight - 10} stroke="#334155" strokeWidth="0.5" opacity="0.5" />
      </svg>
    </div>
  );
};

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const WORD_COLORS = ['#f472b6', '#38bdf8', '#4ade80', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#facc15', '#60a5fa', '#e879f9'];
const COLORS = ['#10b981', '#ef4444', '#f97316', '#3b82f6', '#a78bfa', '#ec4899', '#14b8a6', '#8b5cf6'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const formatTime = (isoString) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(',', '').replace('AM', '').replace('PM', '').trim();
};

const formatConfidenceValue = (score) => {
  if (score === undefined || score === null || score === '') return '-';
  const value = typeof score === 'number' ? score : parseFloat(score);
  if (Number.isNaN(value)) return '-';
  return value.toFixed(2);
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
        <text y={-3} textAnchor="middle" fontSize="11" fill="#f1f5f9" fontWeight="700">{centerLabelTop}</text>
        <text y={10} textAnchor="middle" fontSize="8" fill="#64748b">{centerLabelBottom}</text>
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
        <span className="text-slate-500 tabular-nums">{it.value}</span>
      </div>
    ))}
  </div>
);

const WaveChart = ({ data, width = 1000, height = 500, rangeKey }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const maxV = Math.max(1, ...data.map((d) => d.v));
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const pointSpacing = data.length ? innerW / (data.length - 1) : innerW;

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

  const formatPointTime = (timestamp) =>
    new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="relative" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
        {gridLines.map((grid, idx) => (
          <g key={`grid-${idx}`}>
            <line x1={padding.l} y1={grid.y} x2={padding.l + innerW} y2={grid.y} stroke="#1e293b" strokeWidth="1" opacity={grid.ratio === 0 || grid.ratio === 1 ? "1" : "0.5"} />
            <text x={padding.l - 5} y={grid.y + 4} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="600">{grid.value}</text>
          </g>
        ))}

        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" strokeWidth="1.5" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="#334155" strokeWidth="1.5" />

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
          const isSelected = selectedPoint?.index === i;
          const pointData = { index: i, x, y, value: d.v, time: d.t };
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r="10"
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
                fill="#a78bfa"
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
          <div className="font-semibold text-white">{selectedPoint.value} predictions</div>
          <div className="mt-1 text-slate-400">{formatPointTime(selectedPoint.time)}</div>
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
    <span className={`text-xs px-2 py-1 rounded border font-semibold inline-block ${bg} ${text}`}>
      {pct}%
    </span>
  );
};

const PredictionBadge = ({ label }) => {
  const isBenign = String(label).toLowerCase().includes('benign');
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${
      isBenign
        ? 'bg-green-900/30 text-green-400 border-green-700/50'
        : 'bg-red-900/30 text-red-400 border-red-700/50'
    }`}>
      {label || 'unknown'}
    </span>
  );
};

const StatCard = ({ label, value, unit = '' }) => (
  <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
    <div className="text-[10px] text-slate-500 uppercase font-semibold">{label}</div>
    <div className="text-2xl font-black text-sky-400 mt-1">{value}</div>
    {unit && <div className="text-xs text-slate-500 mt-1">{unit}</div>}
  </div>
);

export default function MlDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingMockData, setUsingMockData] = useState(false);

  const [predictions, setPredictions] = useState([]);
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);

  const [filters, setFilters] = useState({ label: '', sourceIp: '', destinationIp: '', service: '' });
  const [timeRange, setTimeRange] = useState('60');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100); // Default to 100 rows per page

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [predsResp, statsResp, timelineResp] = await Promise.all([
        mlApi.getPredictions(),
        mlApi.getStats(),
        mlApi.getTimelineMock(parseInt(timeRange)), // Use mock for now
      ]);
      
      const preds = predsResp.data || [];
      setPredictions(Array.isArray(preds) ? preds : []);
      setStats(statsResp.data || null);
      
      const tl = timelineResp.data || [];
      setTimeline(Array.isArray(tl) ? tl : []);
      setUsingMockData(false);
    } catch (err) {
      console.error('ML API error:', err);
      // Fallback to frontend-generated dummy data so page remains accessible
      setUsingMockData(true);
      // generate mock predictions
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
      setStats(genMockStats());
      setTimeline(genMockTimeline(parseInt(timeRange)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => loadAll(), 60_000);
    return () => clearInterval(interval);
  }, [timeRange]);

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
    return predictions.filter((p) => {
      if (filters.label && String(p.predictedLabel) !== String(filters.label)) return false;
      if (filters.sourceIp && !String(p.sourceIp || '').includes(filters.sourceIp)) return false;
      if (filters.destinationIp && !String(p.destinationIp || '').includes(filters.destinationIp)) return false;
      if (filters.service && !String(p.service || '').includes(filters.service)) return false;
      return true;
    });
  }, [predictions, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages]);

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
      value,
      color: COLORS[i % COLORS.length],
    }));
  }, [filtered]);

  const topSourceIps = useMemo(() => {
    const map = new Map();
    for (const p of predictions) { // Use ALL predictions, not filtered
      const ip = p.sourceIp || 'unknown';
      map.set(ip, (map.get(ip) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 source IPs
  }, [predictions]);

  const waveData = useMemo(() => {
    if (!timeline || timeline.length === 0) {
      return [];
    }

    // Aggregate data: group by timestamp, sum the counts
    const map = new Map();
    let minTs = Infinity;
    let maxTs = -Infinity;
    
    for (const t of timeline) {
      if (!t) continue;
      const ts = new Date(t.timestamp || t.ts).getTime();
      if (isNaN(ts)) continue;
      
      minTs = Math.min(minTs, ts);
      maxTs = Math.max(maxTs, ts);
      
      const count = parseInt(t.total || t.count || 0);
      const key = ts; // Use exact timestamp as key
      map.set(key, (map.get(key) || 0) + count);
    }
    
    if (minTs === Infinity) {
      return [];
    }
    
    // Convert to sorted array of data points (only existing data, no sparse buckets)
    const data = Array.from(map.entries())
      .map(([ts, count]) => ({ t: ts, v: count }))
      .sort((a, b) => a.t - b.t);
    
    return data;
  }, [timeline, timeRange]);

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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Navbar />
        <div className="mt-20 bg-red-950/60 border border-red-800/60 rounded-xl px-6 py-4 text-red-300 text-sm max-w-md">
          ⚠ Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-4 md:p-6 flex flex-col gap-4">
        {/* Header & Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <BrainCircuit className="h-6 w-6 text-violet-400" />
                ML Predictions Dashboard
              </h1>
              <p className="text-sm text-slate-400">Real-time machine learning threat detection</p>

            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadAll()}
                className="text-sky-400 text-sm font-medium px-3 py-1.5 rounded-md border border-slate-700 hover:bg-sky-900/20 transition-all"
              >
                ↻ Refresh
              </button>
              <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700 gap-1">
                {[
                  { label: '30m', value: '30' },
                  { label: '1h', value: '60' },
                  { label: '6h', value: '360' },
                  { label: '12h', value: '720' },
                  { label: '24h', value: '1440' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeRange(opt.value)}
                    className={`px-2.5 py-1 text-xs rounded-md font-semibold transition-all ${
                      timeRange === opt.value
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Predictions" value={predictions.length} />
            <StatCard label="Shown (Filtered)" value={filtered.length} />
            <StatCard label="Distinct Labels" value={uniqueOptions.labels.length} />
            <StatCard label="Timeline Points" value={waveData.length} />
          </div>
        </div>

        {/* Timeline Wave Chart + Top Source IPs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Timeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-semibold text-slate-300">ML Predictions Timeline</div>
              <div className="text-xs text-slate-500">Last {timeRange} minutes</div>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              {waveData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-500">No timeline data</div>
              ) : (
                <WaveChart data={waveData} rangeKey={timeRange} />
              )}
            </div>
          </div>

          {/* Top Source IPs Bar Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
            <div className="text-lg font-bold text-slate-200 mb-4">Top 10 Source IPs</div>
            {topSourceIps.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500">No data</div>
            ) : (
              <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-800/50 min-h-[100px] flex items-center">
                <HorizontalBarChart data={topSourceIps} />
              </div>
            )}
          </div>
        </div>

        {/* Label Distribution + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Distribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
            <div className="text-sm font-semibold text-slate-300 mb-4 w-full">Label Distribution</div>
            {distribution.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-500">No data</div>
            ) : (
              <div className="flex items-center gap-4 justify-center w-full">
                <Donut items={distribution} size={140} centerLabelTop={filtered.length} centerLabelBottom="predictions" />
                <div className="flex-1">
                  <Legend items={distribution} />
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-around">
            <div className="text-sm font-semibold text-slate-300 mb-4">Key Statistics</div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Total Predictions:</span>
                <span className="text-lg font-bold text-sky-400">{predictions.length}</span>
              </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Average Confidence:</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatConfidenceValue(stats?.overallAvgConfidence)}
                  </span>
                </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Unique IPs:</span>
                <span className="text-lg font-bold text-violet-400">{uniqueOptions.srcs.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Services Detected:</span>
                <span className="text-lg font-bold text-orange-400">{uniqueOptions.services.length}</span>
              </div>
            </div>
          </div>

          {/* Top Labels */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3">Top Labels</div>
            <div className="space-y-2">
              {distribution.slice(0, 5).map((item, i) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-slate-400 font-bold w-5 text-right">{i + 1}</span>
                    <span className="text-sky-300 truncate text-sm font-mono">{item.name}</span>
                  </div>
                  <span className="font-bold ml-2" style={{ color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>



        {/* Filter & Table Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
          {/* Filter Bar */}
          <div className="border-b border-slate-800 bg-slate-800/50 p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">Label:</span>
                <select
                  value={filters.label}
                  onChange={(e) => {
                    setFilters((s) => ({ ...s, label: e.target.value }));
                    setPage(1);
                  }}
                  className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-sky-500"
                >
                  <option value="">All</option>
                  {uniqueOptions.labels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">Source IP:</span>
                <input
                  value={filters.sourceIp}
                  onChange={(e) => {
                    setFilters((s) => ({ ...s, sourceIp: e.target.value }));
                    setPage(1);
                  }}
                  placeholder="partial match"
                  className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 w-32 focus:outline-none focus:border-sky-500"
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">Dest IP:</span>
                <input
                  value={filters.destinationIp}
                  onChange={(e) => {
                    setFilters((s) => ({ ...s, destinationIp: e.target.value }));
                    setPage(1);
                  }}
                  placeholder="partial match"
                  className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 w-32 focus:outline-none focus:border-sky-500"
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">Service:</span>
                <input
                  value={filters.service}
                  onChange={(e) => {
                    setFilters((s) => ({ ...s, service: e.target.value }));
                    setPage(1);
                  }}
                  placeholder="e.g. http"
                  className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 w-24 focus:outline-none focus:border-sky-500"
                />
              </label>

              <button
                onClick={() => {
                  setFilters({ label: '', sourceIp: '', destinationIp: '', service: '' });
                  setPage(1);
                }}
                className="ml-auto text-xs font-bold text-slate-400 px-3 py-1 rounded border border-slate-600 hover:text-white hover:border-slate-500 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <div className="text-sm">No predictions match current filters.</div>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/70">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">↓ Timestamp</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Label</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Source IP</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dest IP</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Confidence</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Meaning</th>
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
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {formatTime(p.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <PredictionBadge label={p.predictedLabel} />
                      </td>
                      <td className="px-4 py-3 text-emerald-400 font-mono text-xs">
                        {p.sourceIp || '-'}
                      </td>
                      <td className="px-4 py-3 text-violet-400 font-mono text-xs">
                        {p.destinationIp || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {p.service || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <ConfidenceBadge score={p.confidence} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
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
            <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-800/50">
              <div className="text-xs text-slate-500 font-mono">
                SHOWING{' '}
                <span className="text-sky-400 font-bold">
                  {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}
                </span>
                {' - '}
                <span className="text-sky-400 font-bold">
                  {Math.min(page * pageSize, filtered.length)}
                </span>
                {' OF '}
                <span className="text-sky-400 font-bold">{filtered.length}</span> PREDICTIONS
              </div>

              <div className="flex gap-2 items-center">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(1)}
                  className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                >
                  FIRST
                </button>

                <button
                  disabled={page === 1}
                  onClick={() => setPage((v) => Math.max(1, v - 1))}
                  className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                >
                  ← PREV
                </button>

                <span className="text-xs font-black text-slate-400 px-2">
                  Page <span className="text-white">{page}</span> / {totalPages}
                </span>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
                  className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                >
                  NEXT →
                </button>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                >
                  LAST
                </button>

                <div className="ml-4 flex items-center gap-2">
                  <span className="text-xs text-slate-400">Page size:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-sky-500"
                  >
                    {PAGE_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

