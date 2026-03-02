import React, { useEffect, useMemo, useState } from "react";

// ----------------------------
// Small, dependency-free charts (SVG)
// ----------------------------
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const formatBucketLabel = (ms, rangeKey) => {
  const d = new Date(ms);
  if (rangeKey === "1h")
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (rangeKey === "24h")
    return d.toLocaleTimeString("en-US", { hour: "2-digit" });
  if (rangeKey === "7d")
    return d.toLocaleString("en-US", { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

// ── Histogram (dipendekkan: height default 85) ────────────────────────────────
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
      {/* axes */}
      <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" />
      <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="#334155" />

      {/* bars */}
      {data.map((d, i) => {
        const h = (d.v / maxV) * innerH;
        const x = padding.l + i * barW;
        const y = padding.t + (innerH - h);
        return (
          <g key={d.t}>
            <rect
              x={x + 1} y={y}
              width={Math.max(1, barW - 2)} height={h}
              rx={2} fill="#38bdf8" opacity={0.75}
            >
              <title>{`${new Date(d.t).toLocaleString()} — ${d.v} events`}</title>
            </rect>
          </g>
        );
      })}

      {/* y labels */}
      <text x={padding.l - 5} y={padding.t + 8} textAnchor="end" fontSize="9" fill="#64748b">{maxV}</text>
      <text x={padding.l - 5} y={padding.t + innerH} textAnchor="end" fontSize="9" fill="#64748b">0</text>

      {/* x ticks */}
      {data.map((d, i) => {
        if (i % tickEvery !== 0) return null;
        const x = padding.l + i * barW + barW / 2;
        return (
          <g key={`tick-${d.t}`}>
            <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="#334155" />
            <text x={x} y={padding.t + innerH + 15} textAnchor="middle" fontSize="9" fill="#64748b">
              {formatBucketLabel(d.t, rangeKey)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Donut (dipendekkan: size default 100) ─────────────────────────────────────
const Donut = ({ items, size = 100, stroke = 12, centerLabelTop, centerLabelBottom }) => {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size / 2} ${size / 2})`}>
        {/* background ring */}
        <circle r={r} fill="transparent" stroke="#1e293b" strokeWidth={stroke} />

        {items.map((it) => {
          const dash = (it.value / total) * c;
          const el = (
            <circle
              key={it.label} r={r} fill="transparent"
              stroke={it.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt" transform="rotate(-90)"
            >
              <title>{`${it.label}: ${it.value}`}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}

        {/* center labels */}
        <text y={-3} textAnchor="middle" fontSize="12" fill="#f1f5f9" fontWeight="700">
          {centerLabelTop}
        </text>
        <text y={11} textAnchor="middle" fontSize="8" fill="#64748b">
          {centerLabelBottom}
        </text>
      </g>
    </svg>
  );
};

// ── Legend ────────────────────────────────────────────────────────────────────
const Legend = ({ items }) => (
  <div className="flex flex-col gap-1.5">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-2 text-xs text-slate-400">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
        <span className="truncate max-w-[200px]">{it.label}</span>
        <span className="ml-auto text-slate-500 tabular-nums">{it.value}</span>
      </div>
    ))}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
const FimEvents = ({ agentId = "001" }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rangeKey, setRangeKey] = useState("24h"); // '1h' | '24h' | '7d' | '30d'

  // ── fetch (tidak diubah) ──────────────────────────────────────────────────
  const fetchEvents = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3000/api/events/${agentId}`);
      const result = await response.json();
      if (result.success) setEvents(result.data);
      else setError(result.message);
    } catch (err) {
      console.error("Detail error:", err);
      setError("Gagal menghubungi backend API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvents(); }, [agentId]);

  // Auto-refresh setiap 15 detik
  useEffect(() => {
    const t = setInterval(() => { fetchEvents(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // ── format helpers (tidak diubah) ─────────────────────────────────────────
  const formatTime = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date
      .toLocaleString("en-US", {
        month: "short", day: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        fractionalSecondDigits: 3,
      })
      .replace(",", "").replace("AM", "").replace("PM", "");
  };

  // ── severity badge (dark variant) ────────────────────────────────────────
  const renderSeverityBadge = (level) => {
    if (level >= 12)
      return (
        <span className="bg-red-900/50 text-red-300 border border-red-700/50 px-2 py-0.5 rounded text-xs font-bold tracking-wide">
          Critical <span className="opacity-60">Lvl {level}</span>
        </span>
      );
    if (level >= 8)
      return (
        <span className="bg-orange-900/50 text-orange-300 border border-orange-700/50 px-2 py-0.5 rounded text-xs font-bold tracking-wide">
          High <span className="opacity-60">Lvl {level}</span>
        </span>
      );
    if (level >= 5)
      return (
        <span className="bg-yellow-900/50 text-yellow-300 border border-yellow-700/50 px-2 py-0.5 rounded text-xs font-bold tracking-wide">
          Medium <span className="opacity-60">Lvl {level}</span>
        </span>
      );
    return (
      <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-xs font-bold tracking-wide">
        Low <span className="opacity-60">Lvl {level}</span>
      </span>
    );
  };

  // ── derived (tidak diubah) ────────────────────────────────────────────────
  const derived = useMemo(() => {
    const now = Date.now();
    const rangeMsMap = {
      "1h":  60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d":  7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    const rangeMs = rangeMsMap[rangeKey] ?? rangeMsMap["24h"];
    const startMs = now - rangeMs;

    const filtered = events
      .map((e) => ({ ...e, _ms: e.timestamp ? new Date(e.timestamp).getTime() : NaN }))
      .filter((e) => Number.isFinite(e._ms) && e._ms >= startMs && e._ms <= now)
      .sort((a, b) => b._ms - a._ms);

    let stepMs = 60 * 60 * 1000;
    if (rangeKey === "1h")  stepMs = 5 * 60 * 1000;
    else if (rangeKey === "24h") stepMs = 60 * 60 * 1000;
    else if (rangeKey === "7d")  stepMs = 6 * 60 * 60 * 1000;
    else stepMs = 24 * 60 * 60 * 1000;

    const bucketStart = (ms) => Math.floor(ms / stepMs) * stepMs;
    const buckets = new Map();
    for (const e of filtered) {
      const b = bucketStart(e._ms);
      buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    const series = [];
    const first = bucketStart(startMs);
    const last = bucketStart(now);
    for (let t = first; t <= last; t += stepMs) {
      series.push({ t, v: buckets.get(t) || 0 });
    }

    const byEvent = new Map();
    const bySev = new Map();
    const sevLabel = (lvl) => {
      if (lvl >= 12) return "Critical";
      if (lvl >= 8)  return "High";
      if (lvl >= 5)  return "Medium";
      return "Low";
    };
    for (const e of filtered) {
      const k = e.syscheckEvent || "unknown";
      byEvent.set(k, (byEvent.get(k) || 0) + 1);
      const s = sevLabel(Number(e.ruleLevel ?? 0));
      bySev.set(s, (bySev.get(s) || 0) + 1);
    }

    const eventItemsAll = Array.from(byEvent.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    const eventTop = eventItemsAll.slice(0, 6);
    const eventOther = eventItemsAll.slice(6).reduce((a, b) => a + b.value, 0);
    if (eventOther > 0) eventTop.push({ label: "other", value: eventOther });

    const palette = ["#38bdf8", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6", "#9CA3AF"];
    const eventItems = eventTop.map((it, i) => ({ ...it, color: palette[i % palette.length] }));

    const sevOrder = ["Critical", "High", "Medium", "Low"];
    const sevColors = { Critical: "#EF4444", High: "#F97316", Medium: "#F59E0B", Low: "#22C55E" };
    const severityItems = sevOrder
      .filter((k) => bySev.get(k))
      .map((k) => ({ label: k, value: bySev.get(k), color: sevColors[k] }));

    const total = filtered.length;
    const eps = total ? total / (rangeMs / 1000) : 0;
    return { filtered, series, eventItems, severityItems, total, eps, startMs, now };
  }, [events, rangeKey]);

  // ── loading / error states ────────────────────────────────────────────────
  if (loading)
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">Loading Events Data...</span>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="bg-red-950/60 border border-red-800/60 rounded-xl px-6 py-4 text-red-300 text-sm">
          ⚠ Error: {error}
        </div>
      </div>
    );

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-5 py-3 flex items-center gap-3">
        <span className="font-black text-xl text-sky-400 tracking-tight mr-2">W.</span>
        <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs border border-slate-700">
          File Integrity M...
        </span>
        <span className="bg-sky-900/50 text-sky-400 px-3 py-1 rounded-full text-xs border border-sky-800/60">
          agent{agentId}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-4">

        {/* ── Controls + Charts wrapper ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-4">

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchEvents}
              className="text-sky-400 text-sm font-medium px-3 py-1.5 rounded-md border border-slate-700 hover:border-sky-700 hover:bg-sky-900/20 transition-colors"
            >
              ↻ Refresh Data
            </button>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500">Range</span>
              <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700 gap-0.5">
                {[
                  { k: "1h",  label: "Last 1h"  },
                  { k: "24h", label: "Last 24h" },
                  { k: "7d",  label: "Last 7d"  },
                  { k: "30d", label: "Last 30d" },
                ].map((r) => (
                  <button
                    key={r.k}
                    onClick={() => setRangeKey(r.k)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      rangeKey === r.k
                        ? "bg-sky-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title={`Filter events to ${r.label}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Bar Chart ── */}
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Events (filtered)</div>
                <div className="text-3xl font-black text-slate-100 tabular-nums leading-none">
                  {derived.total}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Rate</div>
                <div className="text-lg font-bold text-slate-200 tabular-nums">
                  {derived.eps.toFixed(2)}{" "}
                  <span className="text-xs font-normal text-slate-500">/ sec</span>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-600 mb-2">
              Window: {new Date(derived.startMs).toLocaleString()} →{" "}
              {new Date(derived.now).toLocaleString()}
            </div>

            <div className="border-t border-slate-700/60 pt-2">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Events over time
              </div>
              <SimpleBarHistogram data={derived.series} rangeKey={rangeKey} />
            </div>
          </div>

          {/* ── Donuts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Donut 1 – event types */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 flex gap-3">
              <div className="shrink-0 self-center">
                <Donut
                  items={derived.eventItems}
                  centerLabelTop={derived.eventItems.reduce((a, b) => a + b.value, 0)}
                  centerLabelBottom="syscheck.event"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Top event types
                </div>
                <Legend items={derived.eventItems} />
              </div>
            </div>

            {/* Donut 2 – severity */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 flex gap-3">
              <div className="shrink-0 self-center">
                <Donut
                  items={derived.severityItems}
                  centerLabelTop={derived.severityItems.reduce((a, b) => a + b.value, 0)}
                  centerLabelBottom="by severity"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Severity distribution
                </div>
                <Legend items={derived.severityItems} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              <span className="font-bold text-slate-200 text-sm">{events.length}</span> hits{" "}
              <span className="text-slate-600">(raw)</span>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  {[
                    "↓ timestamp",
                    "agent.name",
                    "username",
                    "syscheck.path",
                    "syscheck.event",
                    "payload",
                    "severity alert",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {derived.filtered.length > 0 ? (
                  derived.filtered.map((evt, idx) => (
                    <tr
                      key={evt.id}
                      className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${
                        idx % 2 !== 0 ? "bg-slate-900/60" : ""
                      }`}
                    >
                      {/* timestamp */}
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {formatTime(evt.timestamp)}
                      </td>

                      {/* agent.name */}
                      <td className="px-4 py-3 text-sky-400 font-medium">
                        {evt.agentName}
                      </td>

                      {/* username */}
                      <td className="px-4 py-3 text-violet-400 font-medium">
                        {evt.username}
                      </td>

                      {/* syscheck.path */}
                      <td className="px-4 py-3 text-emerald-400 font-mono text-xs">
                        {evt.syscheckPath}
                      </td>

                      {/* syscheck.event */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
                          evt.syscheckEvent === "deleted"
                            ? "text-red-400 bg-red-900/30 border-red-800/50"
                            : evt.syscheckEvent === "added"
                            ? "text-green-400 bg-green-900/30 border-green-800/50"
                            : "text-yellow-400 bg-yellow-900/30 border-yellow-800/50"
                        }`}>
                          {evt.syscheckEvent}
                        </span>
                      </td>

                      {/* payload */}
                      <td className="px-4 py-3 text-slate-300 align-top max-w-md">
                        <div className="font-semibold">{evt.ruleDescription}</div>

                        {evt.fileDiff && (
                          <div className="mt-2 p-2 bg-slate-950 text-slate-300 rounded-md overflow-x-auto text-xs font-mono border border-slate-700 shadow-inner">
                            {evt.fileDiff.split("\n").map((line, index) => {
                              if (line.startsWith(">"))
                                return (
                                  <div key={index} className="text-green-400 bg-green-950/50 px-1">
                                    + {line.substring(1)}
                                  </div>
                                );
                              if (line.startsWith("<"))
                                return (
                                  <div key={index} className="text-red-400 bg-red-950/50 px-1">
                                    - {line.substring(1)}
                                  </div>
                                );
                              if (line.match(/^\d+c\d+/))
                                return (
                                  <div key={index} className="text-sky-400 mt-1 mb-1">
                                    @@ {line} @@
                                  </div>
                                );
                              return (
                                <div key={index} className="px-1 text-slate-500">
                                  {line}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* severity */}
                      <td className="px-4 py-3">
                        {renderSeverityBadge(evt.ruleLevel)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-slate-600">
                      Tidak ada event FIM ditemukan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FimEvents;