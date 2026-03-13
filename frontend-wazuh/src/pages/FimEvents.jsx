import React, { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";

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

const SimpleBarHistogram = ({ data, width = 980, height = 85, rangeKey }) => {
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

const Donut = ({ items, size = 100, stroke = 12, centerLabelTop, centerLabelBottom }) => {
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
const FimEvents = ({ agentId = "003" }) => {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState("30d");

  // ── 1) Fetch Awal (Historical Data) ───────────────────────────────────────
  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`http://localhost:5000/api/events/${agentId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      if (result.success) {
        setEvents(result.data);
      } else {
        setError(result.message || "Gagal mengambil data dari API");
      }
    } catch (err) {
      console.error("❌ Fetch Error:", err);
      const errorMessage = err.message.includes("Failed to fetch") 
        ? "Gagal terhubung ke backend. Pastikan server berjalan di http://localhost:5000"
        : err.message;
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [agentId]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchEvents();
    }, 30000); // Poll every 5 seconds for updates

    return () => clearInterval(interval);
  }, [agentId]);

  // ── Helpers & Formatting ─────────────────────────────────────────────────
  const now = Date.now();
  
  const formatTime = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }).replace(",", "").replace("AM", "").replace("PM", "");
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

    const filtered = events
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
        // Penghapusan escape character berlebih pada '/'
        const tokens = line.substring(1).trim().split(/[\s/=:;,'"(){}[\]<>|&!?@#%^*`~]+/).map(t => t.toLowerCase()).filter(t => t.length >= 2 && !STOP.has(t));
        for (const token of tokens) byPayload.set(token, (byPayload.get(token) || 0) + 1);
      }
    }
    const payloadWords = Array.from(byPayload.entries()).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 40);

    // Severity breakdown calculation
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

    return { filtered, series, eventItems, severityItems, payloadWords, total: filtered.length, eps: filtered.length ? filtered.length / (rangeMs / 1000) : 0, startMs, now };
  }, [events, rangeKey]);

  // ── loading / error states ────────────────────────────────────────────────
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

      <div className="p-4 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={fetchEvents} className="text-sky-400 text-sm font-medium px-3 py-1.5 rounded-md border border-slate-700 hover:bg-sky-900/20">↻ Refresh Data</button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500">Range</span>
              <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                {["1h", "24h", "7d", "30d"].map((k) => (
                  <button key={k} onClick={() => setRangeKey(k)} className={`px-2.5 py-1 text-xs rounded-md ${rangeKey === k ? "bg-sky-600 text-white" : "text-slate-400"}`}>Last {k}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
            <div className="flex justify-between mb-2">
              <div><div className="text-[11px] text-slate-500 uppercase">Events (filtered)</div><div className="text-3xl font-black">{derived.total}</div></div>
              <div className="text-right"><div className="text-[11px] text-slate-500 uppercase">Rate</div><div className="text-lg font-bold">{derived.eps.toFixed(2)} / sec</div></div>
            </div>
            <SimpleBarHistogram data={derived.series} rangeKey={rangeKey} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Kotak 1: Event + Severity Chart (Berdampingan & Centered) */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-2 flex gap-4 items-center justify-center">
              {/* Event Chart */}
              <div className="flex items-center gap-3">
                <Donut items={derived.eventItems} size={160} centerLabelTop={derived.total} centerLabelBottom="events" />
                <div className="w-32"><Legend items={derived.eventItems} /></div>
              </div>
              {/* Severity Chart */}
              <div className="flex items-center gap-3">
                <Donut items={derived.severityItems} size={160} centerLabelTop={derived.total} centerLabelBottom="severity" />
                <div className="w-32"><Legend items={derived.severityItems} /></div>
              </div>
            </div>
            {/* Kotak 2: Word Cloud */}
            <div className="bg-slate-950 border border-slate-700/60 rounded-lg p-3 flex flex-col gap-2 items-center justify-center">
              <PayloadWordCloud words={derived.payloadWords} />
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  {["↓ timestamp", "agent.name", "username", "syscheck.path", "syscheck.event", "payload", "severity"].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {derived.filtered.map((evt, idx) => (
                  <tr key={evt.id} className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${idx % 2 !== 0 ? "bg-slate-900/60" : ""}`}>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatTime(evt.timestamp)}</td>
                    <td className="px-4 py-3 text-sky-400 font-medium">{evt.agentName}</td>
                    <td className="px-4 py-3 text-violet-400 font-medium">{evt.username}</td>
                    <td className="px-4 py-3 text-emerald-400 font-mono text-xs">{evt.syscheckPath}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded border ${evt.syscheckEvent === "deleted" ? "text-red-400 bg-red-900/30" : "text-green-400 bg-green-900/30"}`}>{evt.syscheckEvent}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-md">
                        <div className="font-semibold">{evt.ruleDescription}</div>
                        {evt.fileDiff && <pre className="mt-2 p-2 bg-black text-[10px] rounded">{evt.fileDiff}</pre>}
                    </td>
                    <td className="px-4 py-3">{renderSeverityBadge(evt.ruleLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FimEvents;