import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

function toLocalInputValue(date) {
  // yyyy-MM-ddTHH:mm (for datetime-local)
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromPreset(preset) {
  const now = new Date();
  const end = now;
  const start = new Date(now);
  if (preset === "1h") start.setHours(now.getHours() - 1);
  if (preset === "24h") start.setHours(now.getHours() - 24);
  if (preset === "7d") start.setDate(now.getDate() - 7);
  if (preset === "30d") start.setDate(now.getDate() - 30);
  return { start, end };
}

function fmt(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

function renderSeverityBadge(level) {
  const lv = Number(level);
  if (!Number.isFinite(lv)) return <div className="w-full bg-gray-100 text-gray-700 px-3 py-2 rounded text-xs font-bold text-center">-</div>;
  if (lv >= 12) return <div className="w-full bg-red-100 text-red-700 px-3 py-2 rounded text-xs font-bold text-center">Critical (Lvl {lv})</div>;
  if (lv >= 8) return <div className="w-full bg-orange-100 text-orange-700 px-3 py-2 rounded text-xs font-bold text-center">High (Lvl {lv})</div>;
  if (lv >= 5) return <div className="w-full bg-yellow-100 text-yellow-700 px-3 py-2 rounded text-xs font-bold text-center">Medium (Lvl {lv})</div>;
  return <div className="inline-block bg-green-100 text-green-700 px-3 py-2 rounded text-xs font-bold">Low (Lvl {lv})</div>;
}

export default function ThreadHuntingEvents() {
  // filters
  const [q, setQ] = useState("");
  const [desc, setDesc] = useState("");
  const [agentId, setAgentId] = useState("");
  const [group, setGroup] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [levelGte, setLevelGte] = useState("");
  const [levelLte, setLevelLte] = useState("");
  const [preset, setPreset] = useState("24h");

  // date range
  const initialRange = useMemo(() => fromPreset("24h"), []);
  const [start, setStart] = useState(toLocalInputValue(initialRange.start));
  const [end, setEnd] = useState(toLocalInputValue(initialRange.end));
  const [showDates, setShowDates] = useState(false);

  // paging
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);

  // data
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => {
    const t = Number(total) || 0;
    return Math.max(Math.ceil(t / size), 1);
  }, [total, size]);

  useEffect(() => {
    // update date range when preset changes (kecuali custom)
    if (preset === "custom") return;
    const r = fromPreset(preset);
    setStart(toLocalInputValue(r.start));
    setEnd(toLocalInputValue(r.end));
  }, [preset]);

  // Debounce fetch when filters change
  useEffect(() => {
    const t = setTimeout(() => {
      fetchData(1);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, desc, agentId, group, ruleId, levelGte, levelLte, start, end, size, preset]);

  async function fetchData(nextPage = page) {
    setLoading(true);
    setErr("");
    try {
      const params = {
        q: q.trim() || undefined,
        desc: desc.trim() || undefined,
        agent_id: agentId.trim() || undefined,
        group: group.trim() || undefined,
        rule_id: ruleId.trim() || undefined,
        level_gte: levelGte !== "" ? levelGte : undefined,
        level_lte: levelLte !== "" ? levelLte : undefined,
        start: start ? new Date(start).toISOString() : undefined,
        end: end ? new Date(end).toISOString() : undefined,
        page: nextPage,
        size,
        sort: "desc",
      };

      const res = await axios.get("/api/hunting", { params });
      const payload = res.data;
      if (!payload?.success) throw new Error(payload?.message || "Request failed");

      setRows(payload.data || []);
      setTotal(payload.total || 0);
      setPage(payload.page || nextPage);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Gagal mengambil data");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  function onRefresh() {
    fetchData(1);
  }

  function clampPage(n) {
    return Math.min(Math.max(n, 1), totalPages);
  }

  const hitsLabel = useMemo(() => {
    const t = Number(total) || 0;
    return `${t.toLocaleString()} hits`;
  }, [total]);

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Thread Hunting</div>
            <div className="text-sm text-gray-500">Events</div>
          </div>

          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={loading}
            title="Refresh"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {/* Search Bar + Time */}
        <div className="flex flex-col gap-3 rounded-lg border bg-white p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search (q) — contoh: agent3 sudo root"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 md:max-w-md"
            />

            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (desc) — contoh: Login session"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 md:max-w-md"
            />

            <div className="flex gap-2">
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
                title="Time range preset"
              >
                <option value="1h">Last 1 hour</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="custom">Custom</option>
              </select>

              <button
                onClick={() => setShowDates((v) => !v)}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              >
                {showDates ? "Hide dates" : "Show dates"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-gray-600">Size</label>
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="rounded-md border px-2 py-2 text-sm"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        {/* Optional date inputs */}
        {showDates && (
          <div className="rounded-lg border bg-white p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Start</label>
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => {
                    setPreset("custom");
                    setStart(e.target.value);
                  }}
                  className="rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">End</label>
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => {
                    setPreset("custom");
                    setEnd(e.target.value);
                  }}
                  className="rounded-md border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Filters row (agent/group/rule/level) */}
        <div className="rounded-lg border bg-white p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="agent_id (exact)"
              className="rounded-md border px-3 py-2 text-sm"
            />
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="group (rule.groups)"
              className="rounded-md border px-3 py-2 text-sm"
            />
            <input
              value={ruleId}
              onChange={(e) => setRuleId(e.target.value)}
              placeholder="rule_id"
              className="rounded-md border px-3 py-2 text-sm"
            />
            <input
              value={levelGte}
              onChange={(e) => setLevelGte(e.target.value)}
              placeholder="level_gte"
              className="rounded-md border px-3 py-2 text-sm"
            />
            <input
              value={levelLte}
              onChange={(e) => setLevelLte(e.target.value)}
              placeholder="level_lte"
              className="rounded-md border px-3 py-2 text-sm"
            />
            <button
              onClick={() => {
                setQ("");
                setDesc("");
                setAgentId("");
                setGroup("");
                setRuleId("");
                setLevelGte("");
                setLevelLte("");
                setPreset("24h");
                const r = fromPreset("24h");
                setStart(toLocalInputValue(r.start));
                setEnd(toLocalInputValue(r.end));
              }}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Hits + Errors */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{hitsLabel}</div>
          {err ? <div className="text-sm text-red-600">{err}</div> : null}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border bg-white">
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">timestamp</th>
                  <th className="px-4 py-3">agent.name</th>
                  <th className="px-4 py-3">rule.description</th>
                  <th className="px-4 py-3 text-center">severity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{fmt(r.timestamp)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-blue-700">
                      {r.agentName || "-"}
                    </td>
                    <td className="min-w-[420px] px-4 py-3 text-gray-800">{r.ruleDescription || "-"}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-2 items-center justify-center">
                        {renderSeverityBadge(r.ruleLevel)}
                        
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-gray-500" colSpan={4}>
                      No data
                    </td>
                  </tr>
                ) : null}
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-gray-500" colSpan={4}>
                      Loading...
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-white px-4 py-3">
            <div className="text-xs text-gray-500">
              Page <span className="font-medium text-gray-800">{page}</span> /{" "}
              <span className="font-medium text-gray-800">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
                onClick={() => fetchData(1)}
                disabled={loading || page <= 1}
              >
                First
              </button>
              <button
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
                onClick={() => fetchData(clampPage(page - 1))}
                disabled={loading || page <= 1}
              >
                Prev
              </button>
              <button
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
                onClick={() => fetchData(clampPage(page + 1))}
                disabled={loading || page >= totalPages}
              >
                Next
              </button>
              <button
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
                onClick={() => fetchData(totalPages)}
                disabled={loading || page >= totalPages}
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}