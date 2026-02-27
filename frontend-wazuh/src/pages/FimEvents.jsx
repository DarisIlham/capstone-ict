import React, { useEffect, useMemo, useState } from "react";

// ----------------------------
// Small, dependency-free charts (SVG)
// ----------------------------
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

const formatBucketLabel = (ms, rangeKey) => {
  const d = new Date(ms);
  // Keep labels compact like a Wazuh/Kibana histogram.
  if (rangeKey === "1h")
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (rangeKey === "24h")
    return d.toLocaleTimeString("en-US", { hour: "2-digit" });
  if (rangeKey === "7d")
    return d.toLocaleString("en-US", { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

const SimpleBarHistogram = ({ data, width = 980, height = 140, rangeKey }) => {
  // data: [{ t: bucketStartMs, v: count }]
  const maxV = Math.max(1, ...data.map((d) => d.v));
  const padding = { l: 26, r: 10, t: 12, b: 26 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const barW = data.length ? innerW / data.length : innerW;

  // Choose a few x tick labels.
  const tickCount = clamp(Math.floor(innerW / 160), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
      {/* axes */}
      <line
        x1={padding.l}
        y1={padding.t}
        x2={padding.l}
        y2={padding.t + innerH}
        stroke="#E5E7EB"
      />
      <line
        x1={padding.l}
        y1={padding.t + innerH}
        x2={padding.l + innerW}
        y2={padding.t + innerH}
        stroke="#E5E7EB"
      />

      {/* bars */}
      {data.map((d, i) => {
        const h = (d.v / maxV) * innerH;
        const x = padding.l + i * barW;
        const y = padding.t + (innerH - h);
        return (
          <g key={d.t}>
            <rect
              x={x + 1}
              y={y}
              width={Math.max(1, barW - 2)}
              height={h}
              rx={2}
              fill="#60A5FA" /* blue-400 */
              opacity={0.85}
            >
              <title>{`${new Date(d.t).toLocaleString()} — ${d.v} events`}</title>
            </rect>
          </g>
        );
      })}

      {/* y labels (0 and max) */}
      <text
        x={padding.l - 6}
        y={padding.t + 10}
        textAnchor="end"
        fontSize="10"
        fill="#6B7280"
      >
        {maxV}
      </text>
      <text
        x={padding.l - 6}
        y={padding.t + innerH}
        textAnchor="end"
        fontSize="10"
        fill="#6B7280"
      >
        0
      </text>

      {/* x ticks */}
      {data.map((d, i) => {
        if (i % tickEvery !== 0) return null;
        const x = padding.l + i * barW + barW / 2;
        return (
          <g key={`tick-${d.t}`}>
            <line
              x1={x}
              y1={padding.t + innerH}
              x2={x}
              y2={padding.t + innerH + 4}
              stroke="#E5E7EB"
            />
            <text
              x={x}
              y={padding.t + innerH + 16}
              textAnchor="middle"
              fontSize="10"
              fill="#6B7280"
            >
              {formatBucketLabel(d.t, rangeKey)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const Donut = ({
  items,
  size = 150,
  stroke = 16,
  centerLabelTop,
  centerLabelBottom,
}) => {
  // items: [{ label, value, color }]
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size / 2} ${size / 2})`}>
        {/* background ring */}
        <circle
          r={r}
          fill="transparent"
          stroke="#F3F4F6"
          strokeWidth={stroke}
        />

        {items.map((it) => {
          const dash = (it.value / total) * c;
          const el = (
            <circle
              key={it.label}
              r={r}
              fill="transparent"
              stroke={it.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90)"
            >
              <title>{`${it.label}: ${it.value}`}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}

        {/* center labels */}
        <text
          y={-2}
          textAnchor="middle"
          fontSize="14"
          fill="#111827"
          fontWeight="700"
        >
          {centerLabelTop}
        </text>
        <text y={16} textAnchor="middle" fontSize="10" fill="#6B7280">
          {centerLabelBottom}
        </text>
      </g>
    </svg>
  );
};

const Legend = ({ items }) => (
  <div className="flex flex-col gap-1">
    {items.map((it) => (
      <div
        key={it.label}
        className="flex items-center gap-2 text-xs text-gray-700"
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm"
          style={{ background: it.color }}
        />
        <span className="truncate max-w-[240px]">{it.label}</span>
        <span className="ml-auto text-gray-500 tabular-nums">{it.value}</span>
      </div>
    ))}
  </div>
);

const FimEvents = ({ agentId = "001" }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rangeKey, setRangeKey] = useState("24h"); // '1h' | '24h' | '7d' | '30d'

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:3000/api/events/${agentId}`,
      );
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

  useEffect(() => {
    fetchEvents();
  }, [agentId]);

  // Auto refresh (lightweight) to feel "realtime" like Wazuh events.
  useEffect(() => {
    const t = setInterval(() => {
      fetchEvents();
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const formatTime = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date
      .toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
      })
      .replace(",", "")
      .replace("AM", "")
      .replace("PM", "");
  };

  // --- FUNGSI BARU: Menerjemahkan Angka ke Teks Kategori (Severity) ---
  const renderSeverityBadge = (level) => {
    if (level >= 12)
      return (
        <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">
          Critical (Lvl {level})
        </span>
      );
    if (level >= 8)
      return (
        <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold">
          High (Lvl {level})
        </span>
      );
    if (level >= 5)
      return (
        <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold">
          Medium (Lvl {level})
        </span>
      );
    return (
      <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">
        Low (Lvl {level})
      </span>
    );
  };

  const derived = useMemo(() => {
    const now = Date.now();
    const rangeMsMap = {
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    const rangeMs = rangeMsMap[rangeKey] ?? rangeMsMap["24h"];
    const startMs = now - rangeMs;

    const filtered = events
      .map((e) => ({
        ...e,
        _ms: e.timestamp ? new Date(e.timestamp).getTime() : NaN,
      }))
      .filter((e) => Number.isFinite(e._ms) && e._ms >= startMs && e._ms <= now)
      .sort((a, b) => b._ms - a._ms);

    // Bucket size based on selected range
    let stepMs = 60 * 60 * 1000; // default 1h
    if (rangeKey === "1h") stepMs = 5 * 60 * 1000;
    else if (rangeKey === "24h") stepMs = 60 * 60 * 1000;
    else if (rangeKey === "7d") stepMs = 6 * 60 * 60 * 1000;
    else stepMs = 24 * 60 * 60 * 1000;

    const bucketStart = (ms) => Math.floor(ms / stepMs) * stepMs;
    const buckets = new Map();
    for (const e of filtered) {
      const b = bucketStart(e._ms);
      buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    // Build contiguous bucket series so histogram doesn't look "broken".
    const series = [];
    const first = bucketStart(startMs);
    const last = bucketStart(now);
    for (let t = first; t <= last; t += stepMs) {
      series.push({ t, v: buckets.get(t) || 0 });
    }

    // Group by syscheck.event (top 6 + other)
    const byEvent = new Map();
    const bySev = new Map();
    const sevLabel = (lvl) => {
      if (lvl >= 12) return "Critical";
      if (lvl >= 8) return "High";
      if (lvl >= 5) return "Medium";
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

    // fixed colors so legends are stable
    const palette = [
      "#60A5FA",
      "#34D399",
      "#FBBF24",
      "#F87171",
      "#A78BFA",
      "#F472B6",
      "#9CA3AF",
    ];
    const eventItems = eventTop.map((it, i) => ({
      ...it,
      color: palette[i % palette.length],
    }));

    const sevOrder = ["Critical", "High", "Medium", "Low"];
    const sevColors = {
      Critical: "#EF4444",
      High: "#F97316",
      Medium: "#F59E0B",
      Low: "#22C55E",
    };
    const severityItems = sevOrder
      .filter((k) => bySev.get(k))
      .map((k) => ({ label: k, value: bySev.get(k), color: sevColors[k] }));

    const total = filtered.length;
    const eps = total ? total / (rangeMs / 1000) : 0;
    return {
      filtered,
      series,
      eventItems,
      severityItems,
      total,
      eps,
      startMs,
      now,
    };
  }, [events, rangeKey]);

  if (loading)
    return (
      <div className="p-8 text-center text-gray-600">
        Loading Events Data...
      </div>
    );
  if (error)
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans">
      <div className="border-b border-gray-200 px-4 pt-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold text-lg mr-4">W.</span>
          <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full">
            File Integrity M...
          </span>
          <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
            agent{agentId}
          </span>
        </div>
      </div>

      <div className="p-4 bg-gray-50 flex flex-col gap-4">
        {/* Tombol Refresh */}
        <div className="flex flex-col gap-2 bg-white p-3 border border-gray-300 rounded shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchEvents}
              className="text-blue-600 text-sm font-medium px-3 py-1 rounded hover:bg-blue-50 border border-transparent hover:border-blue-100"
            >
              Refresh Data
            </button>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">Range</span>
              <div className="flex bg-gray-100 rounded p-0.5 border border-gray-200">
                {[
                  { k: "1h", label: "Last 1h" },
                  { k: "24h", label: "Last 24h" },
                  { k: "7d", label: "Last 7d" },
                  { k: "30d", label: "Last 30d" },
                ].map((r) => (
                  <button
                    key={r.k}
                    onClick={() => setRangeKey(r.k)}
                    className={`px-2.5 py-1 text-xs rounded ${rangeKey === r.k ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
                    title={`Filter events to ${r.label}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary + charts (Wazuh-like) */}
          {/* ===== CHART SECTION ===== */}
          <div className="space-y-3">
            {/* ===== BAR CHART (FULL WIDTH) ===== */}
            <div className="bg-white border border-gray-200 rounded p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-gray-500">Events (filtered)</div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums">
                    {derived.total}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Rate</div>
                  <div className="text-sm font-semibold text-gray-800 tabular-nums">
                    {derived.eps.toFixed(2)} / sec
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-gray-500">
                Window: {new Date(derived.startMs).toLocaleString()} →{" "}
                {new Date(derived.now).toLocaleString()}
              </div>

              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="text-xs font-semibold text-gray-700">
                  Events over time
                </div>
                <div className="mt-2">
                  <SimpleBarHistogram
                    data={derived.series}
                    rangeKey={rangeKey}
                  />
                </div>
              </div>
            </div>

            {/* ===== DONUT SECTION (2 COLUMN) ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Donut 1 */}
              <div className="bg-white border border-gray-200 rounded p-3 flex gap-3">
                <div className="shrink-0">
                  <Donut
                    items={derived.eventItems}
                    centerLabelTop={derived.eventItems.reduce(
                      (a, b) => a + b.value,
                      0,
                    )}
                    centerLabelBottom="by syscheck.event"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    Top event types
                  </div>
                  <Legend items={derived.eventItems} />
                </div>
              </div>

              {/* Donut 2 */}
              <div className="bg-white border border-gray-200 rounded p-3 flex gap-3">
                <div className="shrink-0">
                  <Donut
                    items={derived.severityItems}
                    centerLabelTop={derived.severityItems.reduce(
                      (a, b) => a + b.value,
                      0,
                    )}
                    centerLabelBottom="by severity"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    Severity distribution
                  </div>
                  <Legend items={derived.severityItems} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabel Area */}
        <div className="bg-white border border-gray-200 mt-2">
          <div className="text-center py-2 border-b border-gray-200 text-sm">
            <span className="font-bold">{events.length}</span> hits{" "}
            <span className="text-gray-500">(raw)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-100 text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 font-semibold">↓ timestamp</th>
                  <th className="px-3 py-2 font-semibold">agent.name</th>
                  <th className="px-3 py-2 font-semibold">username</th>
                  <th className="px-3 py-2 font-semibold">syscheck.path</th>
                  <th className="px-3 py-2 font-semibold">syscheck.event</th>
                  <th className="px-3 py-2 font-semibold">payload</th>{" "}
                  {/* Ini tadinya rule.description */}
                  <th className="px-3 py-2 font-semibold">
                    severity alert
                  </th>{" "}
                  {/* Ini sekarang mengecek level */}
                </tr>
              </thead>
              <tbody>
                {derived.filtered.length > 0 ? (
                  derived.filtered.map((evt) => (
                    <tr
                      key={evt.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 text-gray-600">
                        {formatTime(evt.timestamp)}
                      </td>
                      <td className="px-3 py-2 text-blue-600">
                        {evt.agentName}
                      </td>
                      <td className="px-3 py-2 text-purple-600 font-medium">
                        {evt.username}
                      </td>
                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                        {evt.syscheckPath}
                      </td>
                      <td className="px-3 py-2">{evt.syscheckEvent}</td>
                      {/* --- KOLOM PAYLOAD (Menampilkan Deskripsi & Diff ala GitHub) --- */}
                      <td className="px-3 py-2 text-gray-600 align-top max-w-md">
                        <div className="font-semibold">
                          {evt.ruleDescription}
                        </div>

                        {/* Jika ada perubahan isi file (diff), tampilkan kotak kode */}
                        {evt.fileDiff && (
                          <div className="mt-2 p-2 bg-gray-900 text-gray-300 rounded overflow-x-auto text-xs font-mono border border-gray-700 shadow-inner">
                            {/* Memisahkan baris agar bisa diberi warna ala GitHub */}
                            {evt.fileDiff.split("\n").map((line, index) => {
                              // Baris yang ditambah (hijau)
                              if (line.startsWith(">")) {
                                return (
                                  <div
                                    key={index}
                                    className="text-green-400 bg-green-900/30 px-1"
                                  >
                                    + {line.substring(1)}
                                  </div>
                                );
                              }
                              // Baris yang dihapus (merah)
                              if (line.startsWith("<")) {
                                return (
                                  <div
                                    key={index}
                                    className="text-red-400 bg-red-900/30 px-1"
                                  >
                                    - {line.substring(1)}
                                  </div>
                                );
                              }
                              // Baris informasi baris (biru)
                              if (line.match(/^\d+c\d+/)) {
                                return (
                                  <div
                                    key={index}
                                    className="text-blue-400 mt-1 mb-1"
                                  >
                                    @@ {line} @@
                                  </div>
                                );
                              }
                              // Teks biasa
                              return (
                                <div key={index} className="px-1">
                                  {line}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* --- Menampilkan Kategori Severity dengan Warna --- */}
                      <td className="px-3 py-2">
                        {renderSeverityBadge(evt.ruleLevel)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-3 py-4 text-center text-gray-500"
                    >
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
