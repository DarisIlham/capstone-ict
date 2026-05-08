import React, { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import { Activity, FileText } from "lucide-react";
import { API_BASE_URL } from "../config/Api";

// ----------------------------
// Small, dependency-free charts (SVG Components)
// ----------------------------
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const formatBucketLabel = (ms, rangeKey) => {
  const d = new Date(ms);
  if (rangeKey === "1h") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (rangeKey === "24h") return d.toLocaleTimeString("en-US", { hour: "2-digit" });
  if (rangeKey === "7d") return d.toLocaleString("en-US", { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
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

const WaveChart = ({ data, color = "#10b981", height = 80, rangeKey }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const width = 800;
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  if (!data || data.length === 0) {
    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="12" fill="#64748b">No data</text>
      </svg>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => d.v));
  const pointSpacing = data.length ? innerW / (data.length - 1) : innerW;

  const gridSteps = 5;
  const gridLines = [];
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
      pathD += ` C ${controlX} ${prevY}, ${controlX} ${y}, ${x} ${y}`;
    }
  }

  const tickCount = clamp(Math.floor(innerW / 160), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div className="relative" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
        {gridLines.map((gl) => (
          <g key={`grid-${gl.ratio}`}>
            <line x1={padding.l} y1={gl.y} x2={padding.l + innerW} y2={gl.y} stroke="#334155" strokeDasharray="2,2" opacity="0.5" />
            <text x={padding.l - 5} y={gl.y + 3} textAnchor="end" fontSize="8" fill="#64748b">{gl.value}</text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="#334155" />
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
          const isSelected = selectedPoint?.index === i;

          return (
            <g key={`point-${d.t}`}>
              <circle
                cx={x}
                cy={y}
                r={isSelected ? "7" : "10"}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setSelectedPoint({ index: i, x, y, value: d.v, time: d.t })}
                onMouseLeave={() => setSelectedPoint(null)}
              />
              <circle
                cx={x}
                cy={y}
                r={isSelected ? "5" : "3.5"}
                fill={color}
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
                y={padding.t + innerH + 14}
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
          className="pointer-events-none absolute z-10 min-w-[120px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`,
            top: `${Math.max(((selectedPoint.y - 40) / height) * 100, 6)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-white">{selectedPoint.value} events</div>
          <div className="mt-1 text-slate-400">{formatDetailedTimestamp(selectedPoint.time)}</div>
        </div>
      )}
    </div>
  );
};

const SimpleBarHistogram = ({ data, width = 800, height = 65, rangeKey }) => {
  const maxV = Math.max(1, ...data.map((d) => d.v));
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const barW = data.length ? innerW / data.length : innerW;
  const tickCount = clamp(Math.floor(innerW / 160), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
      <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" />
      <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="#334155" />
      {data.map((d, i) => {
        const h = (d.v / maxV) * innerH;
        const x = padding.l + i * barW;
        const y = padding.t + (innerH - h);
        return (
          <g key={d.t}>
            <rect x={x + 1} y={y} width={Math.max(1, barW - 2)} height={h} rx={2} fill="#38bdf8" opacity={0.75}>
              <title>{`${new Date(d.t).toLocaleString()} — ${d.v} events`}</title>
            </rect>
          </g>
        );
      })}
      <text x={padding.l - 5} y={padding.t + 8} textAnchor="end" fontSize="9" fill="#64748b">{maxV}</text>
      <text x={padding.l - 5} y={padding.t + innerH} textAnchor="end" fontSize="9" fill="#64748b">0</text>
      {data.map((d, i) => {
        if (i % tickEvery !== 0) return null;
        const x = padding.l + i * barW + barW / 2;
        return (
          <g key={`tick-${d.t}`}>
            <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="#334155" />
            <text x={x} y={padding.t + innerH + 15} textAnchor="middle" fontSize="9" fill="#64748b">{formatBucketLabel(d.t, rangeKey)}</text>
          </g>
        );
      })}
    </svg>
  );
};

const Donut = ({ items, size = 140, stroke = 14, centerLabelTop, centerLabelBottom }) => {
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
        <text y={-3} textAnchor="middle" fontSize="12" fill="#f1f5f9" fontWeight="700">{centerLabelTop}</text>
        <text y={11} textAnchor="middle" fontSize="8" fill="#64748b">{centerLabelBottom}</text>
      </g>
    </svg>
  );
};

const Legend = ({ items }) => (
  <div className="flex flex-col gap-1.5">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
        <span className="truncate max-w-[100px]">{it.label}</span>
        <span className="text-slate-500 tabular-nums">{it.value}</span>
      </div>
    ))}
  </div>
);

// ── Domain Colors ────────────────────────────────────────────────────────────
const DOMAIN_COLORS = ["#f472b6", "#38bdf8", "#4ade80", "#a78bfa", "#fb923c", "#34d399", "#f87171", "#facc15", "#60a5fa", "#e879f9"];

// ── Domain Horizontal Bar Chart (Modern Design) ────
const DomainBarChart = ({ domains }) => {
  if (!domains || domains.length === 0) return <div className="flex items-center justify-center h-full text-slate-600 text-xs">No domain data</div>;

  const maxCount = Math.max(...domains.map(d => d.count), 1);
  const barGap = 12;
  const barHeight = 10;
  const rowHeight = barHeight + barGap;
  const chartHeight = barHeight * domains.length + barGap * Math.max(0, domains.length - 1);
  const CHART_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#8b5cf6", "#d946ef"];

  const truncateDomain = (name, maxChars = 26) => (name.length > maxChars ? name.substring(0, maxChars - 3) + "..." : name);

  const labelX = 18;
  const barX = 180;
  const rightPad = 20;
  const maxBarArea = 950 - barX - rightPad;

  return (
    <svg width="100%" viewBox={`0 0 1000 ${chartHeight}`} className="block" style={{ minHeight: chartHeight }}>
      {domains.map((domain, i) => {
        const barWidth = Math.max(6, Math.round((domain.count / maxCount) * maxBarArea));
        const y = i * (barHeight + barGap);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const name = truncateDomain(domain.name);

        return (
          <g key={domain.name}>
            <text x={labelX} y={y + barHeight / 2 + 3} fontSize="8px" fill="#cbd5e1" textAnchor="start" fontWeight="600" fontFamily="monospace">
              {name}
            </text>
            <rect x={barX} y={y} width={barWidth} height={barHeight} fill={color} opacity="0.92" rx="4" />
            <text x={barX + barWidth + 8} y={y + barHeight / 2 + 3} fontSize="7px" fill="#94a3b8" fontWeight="700">
              {domain.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Top 5 Domains Card (Modern Design) ────────────────────────────────────
const Top5DomainsCard = ({ domains }) => {
  const top5 = domains.slice(0, 5);

  return (
    <div className="flex flex-col gap-2">
      {top5.map((domain, idx) => {
        const badgeColors = ["#34d399", "#fbbf24", "#f97316", "#06b6d4", "#a78bfa"];
        const badgeColor = badgeColors[idx];

        return (
          <div key={domain.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-slate-400 font-bold text-right w-5">{idx + 1}</span>
              <span className="text-sky-300 font-mono truncate text-xs">{domain.name}</span>
            </div>
            <span className="font-bold ml-2 text-xs" style={{ color: badgeColor }}>{domain.count}</span>
          </div>
        );
      })}
    </div>
  );
};

const WORD_COLORS = ["#f472b6", "#38bdf8", "#4ade80", "#a78bfa", "#fb923c", "#34d399", "#f87171", "#facc15", "#60a5fa", "#e879f9"];

const PayloadWordCloud = ({ words }) => {
  if (!words || words.length === 0) return <div className="flex items-center justify-center h-full text-slate-600 text-xs">No payload data</div>;
  const W = 620, H = 200;
  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const range = Math.max(1, maxCount - minCount);
  const fontSize = (count) => Math.round(11 + ((count - minCount) / range) * 31);
  const estWidth = (text, fs) => text.length * fs * 0.6;
  const placed = [];
  const rects = [];
  const overlaps = (nx, ny, nw, nh) => {
    const pad = 4;
    return rects.some(r => nx - nw / 2 - pad < r.x + r.w / 2 && nx + nw / 2 + pad > r.x - r.w / 2 && ny - nh / 2 - pad < r.y + r.h / 2 && ny + nh / 2 + pad > r.y - r.h / 2);
  };
  for (let i = 0; i < words.length; i++) {
    const { text, count } = words[i];
    const fs = fontSize(count);
    const tw = estWidth(text, fs);
    const th = fs * 1.2;
    let placed_x = W / 2, placed_y = H / 2, found = false;
    for (let step = 0; step < 800; step++) {
      const angle = step * 0.35, radius = step * 0.8;
      const cx = W / 2 + radius * Math.cos(angle), cy = H / 2 + radius * Math.sin(angle) * 0.6;
      if (cx - tw / 2 > 2 && cx + tw / 2 < W - 2 && cy - th / 2 > 2 && cy + th / 2 < H - 2 && !overlaps(cx, cy, tw, th)) {
        placed_x = cx; placed_y = cy; found = true; break;
      }
    }
    if (found || i === 0) {
      rects.push({ x: placed_x, y: placed_y, w: tw, h: th });
      placed.push({ text, fs, color: WORD_COLORS[i % WORD_COLORS.length], opacity: 0.65 + ((count - minCount) / range) * 0.35, x: placed_x, y: placed_y, count });
    }
  }
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ minHeight: 140 }}>
      <defs><radialGradient id="wcGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0f172a" stopOpacity="0" /><stop offset="100%" stopColor="#020617" stopOpacity="0.6" /></radialGradient></defs>
      <rect width={W} height={H} fill="url(#wcGlow)" rx={8} />
      {placed.map((w) => (
        <text key={w.text} x={w.x} y={w.y} textAnchor="middle" dominantBaseline="middle" fontSize={w.fs} fontWeight={w.fs > 26 ? "800" : w.fs > 18 ? "700" : "500"} fill={w.color} opacity={w.opacity} style={{ cursor: "default", fontFamily: "monospace" }}>
          <title>{`${w.text}: ${w.count} occurrences`}</title>{w.text}
        </text>
      ))}
    </svg>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const FimEvents = ({ agentId = "all" }) => {
  const [events, setEvents] = useState([]);
  const [aggregatedEvents, setAggregatedEvents] = useState([]);
  const [domainData, setDomainData] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState("30d");
  const [lastUpdated, setLastUpdated] = useState(null);

  const USE_STATIC = false;

  const MOCK_EVENTS = [
    {
      id: "evt-1",
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      agentName: "agent-1",
      username: "root",
      syscheckPath: "/etc/passwd",
      syscheckEvent: "modified",
      fileDiff: ">-line removed\n>+line added",
      ruleDescription: "Example rule description",
      ruleLevel: 5,
    },
    {
      id: "evt-2",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      agentName: "agent-2",
      username: "admin",
      syscheckPath: "/var/log/auth.log",
      syscheckEvent: "deleted",
      fileDiff: ">-sensitive line removed",
      ruleDescription: "Deleted file detected",
      ruleLevel: 8,
    },
  ];

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalHits, setTotalHits] = useState(0);
  const pageSize = 100;

  const getRangeWindow = (key) => {
    const end = new Date();
    const start = new Date(end);

    switch (key) {
      case "1h":
        start.setHours(start.getHours() - 1);
        break;
      case "24h":
        start.setHours(start.getHours() - 24);
        break;
      case "7d":
        start.setDate(start.getDate() - 7);
        break;
      case "30d":
      default:
        start.setDate(start.getDate() - 30);
        break;
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  };

  const fetchEvents = useCallback(async (page = 1, rk) => {
    try {
      setLoading(true);
      setError(null);

      const effectiveRange = rk || rangeKey;
      const { start, end } = getRangeWindow(effectiveRange);

      const baseEndpoint =
        agentId === "all"
          ? `${API_BASE_URL}/api/events`
          : `${API_BASE_URL}/api/events/${agentId}`;

      const endpoint =
        `${baseEndpoint}?page=${page}&size=${pageSize}` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`;

      console.log("Fetching Page:", page, endpoint);

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`API Error ${response.status}`);

      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Gagal mengambil data");

      setEvents(Array.isArray(result.data) ? result.data : []);
      setTotalHits(Number(result.total_hits) || 0);
      setTotalPages(Number(result.total_pages) || 1);
      setCurrentPage(Number(result.current_page) || page);
      return result;
    } catch (err) {
      console.error("❌ Fetch Error:", err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [agentId, pageSize]);

  const fetchAggregated = useCallback(async (size = 1000, rk) => {
    try {
      const effectiveRange = rk || rangeKey;
      const { start, end } = getRangeWindow(effectiveRange);

      const baseEndpoint =
        agentId === "all"
          ? `${API_BASE_URL}/api/events`
          : `${API_BASE_URL}/api/events/${agentId}`;

      const endpoint =
        `${baseEndpoint}?page=1&size=${size}` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`;

      const resp = await fetch(endpoint);
      if (!resp.ok) throw new Error(`API Error ${resp.status}`);
      const r = await resp.json();
      if (!r.success) throw new Error(r.message || "Gagal mengambil data (aggregated)");
      setAggregatedEvents(Array.isArray(r.data) ? r.data : []);
      return r;
    } catch (err) {
      console.error("❌ Fetch Aggregated Error:", err.message);
      return null;
    }
  }, [agentId, rangeKey]);

  const fetchDomains = useCallback(async (rk) => {
    try {
      const effectiveRange = rk || rangeKey;
      const { start, end } = getRangeWindow(effectiveRange);

      const baseEndpoint =
        agentId === "all"
          ? `${API_BASE_URL}/api/fim/domains`
          : `${API_BASE_URL}/api/fim/${agentId}/domains`;

      const endpoint =
        `${baseEndpoint}?size=1000` +
        `&range=${encodeURIComponent(effectiveRange)}` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`API Error ${response.status}`);

      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Gagal mengambil data domain");

      setDomainData(Array.isArray(result.data) ? result.data : []);
      return result;
    } catch (err) {
      console.error("Domain fetch error:", err.message);
      setDomainData([]);
      return null;
    }
  }, [agentId, rangeKey]);

  const refreshAllData = useCallback(async (page = 1, rk) => {
    const result = await fetchEvents(page, rk);
    const sampleSize = Math.min(1000, Number(result?.total_hits) || 1000);

    await Promise.all([
      fetchAggregated(sampleSize, rk),
      fetchDomains(rk),
    ]);

    if (result) {
      setLastUpdated(new Date().toISOString());
    }

    return result;
  }, [fetchAggregated, fetchDomains, fetchEvents]);

  useEffect(() => {
    if (!USE_STATIC) return;
    setEvents(MOCK_EVENTS);
    setAggregatedEvents(MOCK_EVENTS);
    setDomainData([]);
    setTotalHits(MOCK_EVENTS.length);
    setTotalPages(1);
    setCurrentPage(1);
    setLastUpdated(new Date().toISOString());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (USE_STATIC) return;
    let cancelled = false;

    (async () => {
      const targetPage = currentPage > 1 ? currentPage : 1;
      await refreshAllData(targetPage, rangeKey);
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [agentId, currentPage, rangeKey, refreshAllData]);

  useEffect(() => {
    if (USE_STATIC) return;
    const interval = setInterval(() => {
      refreshAllData(currentPage, rangeKey);
    }, 30000);

    return () => clearInterval(interval);
  }, [currentPage, rangeKey, refreshAllData]);

  const now = Date.now();

  const formatTime = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }).replace(",", "").replace("AM", "").replace("PM", "");
  };

  const formatRate = (eps) => {
    if (!eps || Number.isNaN(eps) || eps <= 0) return "0.00 / sec";
    if (eps >= 0.01) return `${eps.toFixed(2)} / sec`;
    const perMin = eps * 60;
    if (perMin >= 0.01) return `${perMin.toFixed(2)} / min`;
    const perHour = eps * 3600;
    if (perHour >= 0.01) return `${perHour.toFixed(2)} / hour`;
    return `${eps.toExponential(2)} / sec`;
  };

  const formatLiveTimestamp = (isoString) => {
    if (!isoString) return "-";
    return new Date(isoString).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const renderSeverityBadge = (level) => {
    if (level >= 12) return <span className="bg-red-900/50 text-red-300 border border-red-700/50 px-2 py-0.5 rounded text-xs font-bold">Critical Lvl {level}</span>;
    if (level >= 8) return <span className="bg-orange-900/50 text-orange-300 border border-orange-700/50 px-2 py-0.5 rounded text-xs font-bold">High Lvl {level}</span>;
    if (level >= 5) return <span className="bg-yellow-900/50 text-yellow-300 border border-yellow-700/50 px-2 py-0.5 rounded text-xs font-bold">Medium Lvl {level}</span>;
    return <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-xs font-bold">Low Lvl {level}</span>;
  };

  const derived = useMemo(() => {
    const rangeMsMap = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
    const rangeMs = rangeMsMap[rangeKey] ?? 86400000;
    const startMs = now - rangeMs;

    const sourceEvents = (aggregatedEvents && aggregatedEvents.length) ? aggregatedEvents : events;

    const filtered = sourceEvents
      .map((e) => ({ ...e, _ms: e.timestamp ? new Date(e.timestamp).getTime() : NaN }))
      .filter((e) => Number.isFinite(e._ms) && e._ms >= startMs && e._ms <= now)
      .sort((a, b) => b._ms - a._ms);

    let stepMs = rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000;
    const bucketStart = (ms) => Math.floor(ms / stepMs) * stepMs;
    const buckets = new Map();
    for (const e of filtered) {
      const b = bucketStart(e._ms);
      buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    const series = [];
    for (let t = bucketStart(startMs); t <= bucketStart(now); t += stepMs) {
      series.push({ t, v: buckets.get(t) || 0 });
    }

    const byEvent = new Map();

    for (const e of filtered) {
      const k = e.syscheckEvent || "unknown";
      byEvent.set(k, (byEvent.get(k) || 0) + 1);
    }

    const eventItemsAll = Array.from(byEvent.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const eventTop = eventItemsAll.slice(0, 6);
    const eventItems = eventTop.map((it, i) => ({ ...it, color: ["#38bdf8", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6", "#9CA3AF"][i % 7] }));

    const byPayload = new Map();
    const STOP = new Set(["", "---", "@@", "+", "-", "//", "#", "the", "is", "to", "and"]);
    for (const e of filtered) {
      if (!e.fileDiff) continue;
      for (const line of e.fileDiff.split("\n")) {
        if (!line.startsWith(">") && !line.startsWith("<")) continue;
        const tokens = line.substring(1).trim().split(/[\s/=:;,'"(){}[\]<>|&!?@#%^*`~]+/).map(t => t.toLowerCase()).filter(t => t.length >= 2 && !STOP.has(t));
        for (const token of tokens) byPayload.set(token, (byPayload.get(token) || 0) + 1);
      }
    }
    const payloadWords = Array.from(byPayload.entries()).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 40);

    const bySeverity = new Map();
    for (const e of filtered) {
      const level = e.ruleLevel || 0;
      let severityLabel = "Low";
      if (level >= 12) severityLabel = "Critical";
      else if (level >= 8) severityLabel = "High";
      else if (level >= 5) severityLabel = "Medium";
      bySeverity.set(severityLabel, (bySeverity.get(severityLabel) || 0) + 1);
    }
    const severityItemsAll = Array.from(bySeverity.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const severityItems = severityItemsAll.map((it) => {
      const colorMap = { "Critical": "#ef4444", "High": "#f97316", "Medium": "#eab308", "Low": "#3b82f6" };
      return { ...it, color: colorMap[it.label] || "#64748b" };
    });
    const totalForUI = Number(totalHits) || filtered.length;
    const eps = totalForUI ? totalForUI / (rangeMs / 1000) : 0;

    return {
      filtered,
      series,
      eventItems,
      severityItems,
      payloadWords,
      total: totalForUI,
      eps,
      startMs,
      now,
    };
  }, [events, rangeKey, totalHits, aggregatedEvents, now]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-sky-400 gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400"></div>
        <div className="text-sm font-medium">Memuat data</div>
      </div>
    );
  }

  if (error) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="bg-red-950/60 border border-red-800/60 rounded-xl px-6 py-4 text-red-300 text-sm">⚠ Error: {error}</div></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-2 md:p-4 flex flex-col gap-3 md:gap-4">
        {/* FIM Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl p-3 md:p-4 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <FileText className="h-5 md:h-6 w-5 md:w-6 text-emerald-400" />
                File Integrity Monitoring
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-1">Real-time file changes monitoring</p>
            </div>
          </div>
        </div>

        {/* FIM Data Container */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl p-2 md:p-4 shadow-lg flex flex-col gap-3 md:gap-4">
          <div className="flex flex-col xs:flex-row xs:flex-wrap items-start xs:items-center gap-1 md:gap-2">
            <button
              onClick={async () => {
                await refreshAllData(currentPage, rangeKey);
              }}
              className="px-2 md:px-4 py-1 md:py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs md:text-sm text-slate-300 transition-colors border border-slate-700 flex items-center gap-1"
            >↻ Refresh</button>
            <div className="ml-auto flex items-center gap-1 md:gap-2">
              <span className="text-xs text-slate-500 hidden sm:inline">Range</span>
              <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700 gap-0.5">
               {["1h", "24h", "7d", "30d"].map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    if (rangeKey !== k) {
                      setRangeKey(k);
                      setCurrentPage(1);
                    }
                  }}
                  className={`px-1.5 md:px-2.5 py-0.5 md:py-1 text-xs rounded-sm ${rangeKey === k ? "bg-sky-600 text-white" : "text-slate-400"}`}
                >
                  {k}
                </button>
              ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className="bg-slate-800/50 border border-slate-700/60 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-slate-500 uppercase font-semibold">Events</div>
              <div className="text-lg md:text-2xl font-black text-sky-400 mt-0.5 md:mt-1">{derived.total}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-slate-500 uppercase font-semibold">Rate</div>
              <div className="text-lg md:text-2xl font-black text-white mt-0.5 md:mt-1 truncate text-xs md:text-base">{formatRate(derived.eps)}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-emerald-400 uppercase font-semibold">Types</div>
              <div className="text-lg md:text-2xl font-black text-emerald-300 mt-0.5 md:mt-1">{derived.eventItems.length}</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-amber-400 uppercase font-semibold">Severity</div>
              <div className="text-lg md:text-2xl font-black text-amber-300 mt-0.5 md:mt-1">{derived.severityItems.length}</div>
            </div>
          </div>

          <div className="bg-slate-800/30 border border-slate-800/50 rounded-lg p-4 md:p-6">
            <div className="flex justify-between items-center mb-4 md:mb-6 gap-2">
              <div className="text-xs md:text-sm font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                <Activity className="h-3 md:h-4 w-3 md:w-4 text-sky-400" />
                Timeline
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Last {rangeKey}</div>
                <div className="text-[11px] text-slate-600">Updated {formatLiveTimestamp(lastUpdated)}</div>
              </div>
            </div>
            <WaveChart data={derived.series} color="#10b981" height={110} rangeKey={rangeKey} />
          </div>

          {/* Frequently Visited Domains - Full Width */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-lg">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs md:text-sm font-semibold text-slate-300">Frequently Visited Domains</div>
            </div>
            <div className="bg-slate-800/30 rounded-lg px-0 py-4 border border-slate-800/50" style={{ minHeight: "280px" }}>
              <DomainBarChart domains={domainData} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            {/* Kotak 1: Event + Severity Chart (Berdampingan & Centered) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-lg flex flex-col md:flex-row gap-4 md:gap-6 items-center justify-center">
              {/* Event Chart */}
              <div className="flex items-center gap-2 md:gap-3">
                <Donut items={derived.eventItems} size={280} stroke={24} centerLabelTop={derived.total} centerLabelBottom="events" />
                <div className="w-24 md:w-32 text-xs"><Legend items={derived.eventItems} /></div>
              </div>
              {/* Severity Chart */}
              <div className="flex items-center gap-2 md:gap-3">
                <Donut items={derived.severityItems} size={280} stroke={24} centerLabelTop={derived.total} centerLabelBottom="severity" />
                <div className="w-24 md:w-32 text-xs"><Legend items={derived.severityItems} /></div>
              </div>
            </div>
            {/* Kotak 2: Word Cloud */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-lg flex flex-col gap-2 items-center justify-center">
              <div className="w-full text-xs md:text-sm font-semibold text-slate-300">Payload Pattern Cloud</div>
              <div className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 md:p-4">
                <PayloadWordCloud words={derived.payloadWords} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  {["↓ time", "agent", "user", "path", "event", "payload", "severity"].map(h => (
                    <th key={h} className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((evt, idx) => (
                  <tr
                    key={evt.id}
                    className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${
                      idx % 2 !== 0 ? "bg-slate-900/60" : ""
                    }`}
                  >
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-500 text-xs">{formatTime(evt.timestamp)}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-sky-400 font-medium text-xs">{evt.agentName}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-violet-400 font-medium text-xs">{evt.username}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-emerald-400 font-mono text-xs truncate">{evt.syscheckPath}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3">
                      <span
                        className={`text-xs px-1 md:px-2 py-0.5 rounded border ${
                          evt.syscheckEvent === "deleted"
                            ? "text-red-400 bg-red-900/30"
                            : "text-green-400 bg-green-900/30"
                        }`}
                      >
                        {evt.syscheckEvent}
                      </span>
                    </td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-300 max-w-xs md:max-w-md text-xs">
                      {(() => {
                        const diffData = evt.fileDiff || evt.file_diff;

                        if (diffData) {
                          return (
                            <div className="mb-2">
                              <div className="text-[8px] md:text-[9px] text-sky-500 uppercase font-bold mb-1 tracking-tight">
                                Changes:
                              </div>
                              <pre className="p-1 md:p-2 bg-black/60 text-[8px] md:text-[10px] rounded border border-slate-700/50 font-mono text-emerald-400 overflow-x-auto leading-normal whitespace-pre-wrap">
                                {String(diffData)
                                  .replace(/\\n/g, "\n")
                                  .replace(/\\u003e/g, "→")
                                  .replace(/["']/g, "")}
                              </pre>
                            </div>
                          );
                        }
                      })()}

                      <div className="text-xs font-semibold text-slate-100 opacity-80 border-t border-slate-800/50 pt-1">
                        {evt.ruleDescription || evt.rule_description}
                      </div>
                    </td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3">{renderSeverityBadge(evt.ruleLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* --- TOMBOL NAVIGASI --- */}
            <div className="p-2 md:p-4 border-t border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0 bg-slate-900/50 rounded-b-lg md:rounded-b-xl">
              <div className="text-xs text-slate-500 font-mono">
                <span className="hidden md:inline">SHOWING </span>
                <span className="text-sky-400 font-bold">
                  {totalHits === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </span>
                <span className="hidden md:inline">{" - "}</span>
                <span className="md:hidden">-</span>
                <span className="text-sky-400 font-bold">
                  {Math.min(currentPage * pageSize, totalHits)}
                </span>
                <span className="hidden md:inline">{" OF "}</span>
                <span className="md:hidden"> / </span>
                <span className="text-sky-400 font-bold">{totalHits}</span>
                <span className="hidden md:inline"> EVENTS</span>
              </div>

              <div className="flex flex-wrap gap-1 md:gap-2 items-center">
                <button
                  disabled={currentPage === 1 || loading}
                  onClick={() => setCurrentPage(1)}
                  className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                >
                  <span className="hidden md:inline">FIRST</span>
                  <span className="md:hidden">«</span>
                </button>

                <button
                  disabled={currentPage === 1 || loading}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                >
                  <span className="hidden md:inline">← PREV</span>
                  <span className="md:hidden">‹</span>
                </button>

                <span className="text-xs font-black text-slate-400 px-1 md:px-2">
                  <span className="hidden md:inline">PAGE </span><span className="text-white">{currentPage}</span> / {totalPages}
                </span>

                <button
                  disabled={currentPage === totalPages || loading}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                >
                  <span className="hidden md:inline">NEXT →</span>
                  <span className="md:hidden">›</span>
                </button>

                <button
                  disabled={currentPage === totalPages || loading}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                >
                  <span className="hidden md:inline">LAST</span>
                  <span className="md:hidden">»</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FimEvents;
