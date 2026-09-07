import React, { useState, useEffect, useCallback } from "react";
import { Bell, Clock, Shield, Search, CalendarRange } from "lucide-react";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import {
  createDefaultDateRange,
  normalizeDateRange,
  getIsoDateRange,
} from "../utils/dateRange";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function rangeKeyToDateRange(rangeKey) {
  const end = new Date();
  const backMs =
    rangeKey === "1h"
      ? HOUR_MS
      : rangeKey === "7d"
      ? 7 * DAY_MS
      : rangeKey === "30d"
      ? 30 * DAY_MS
      : DAY_MS;
  const start = new Date(end.getTime() - backMs);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

const SEVERITY_CONFIG = {
  critical: { label: "Critical", bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-400" },
  high: { label: "High", bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-400" },
  medium: { label: "Medium", bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30", dot: "bg-yellow-400" },
  low: { label: "Low", bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  info: { label: "Info", bg: "bg-sky-500/15", text: "text-sky-400", border: "border-sky-500/30", dot: "bg-sky-400" },
};

export default function Alert() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [rangeKey, setRangeKey] = useState("24h");
  const [filterMode, setFilterMode] = useState("range");
  const [filterSource, setFilterSource] = useState("all");
  const [customDateRange, setCustomDateRange] = useState(() =>
    createDefaultDateRange(1)
  );

  const effectiveRange =
    filterMode === "custom"
      ? getIsoDateRange(normalizeDateRange(customDateRange))
      : rangeKeyToDateRange(rangeKey);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const API_BASE = "http://127.0.0.1:5000";
      const token = localStorage.getItem("token");
      const currentRange =
        filterMode === "custom"
          ? getIsoDateRange(normalizeDateRange(customDateRange))
          : rangeKeyToDateRange(rangeKey);
      const { start, end } = getIsoDateRange({
        start: currentRange.start,
        end: currentRange.end,
      });

      // Fetch from multiple sources to build alert feed
      const [attackRes, fileRes, fimRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/linux-commands?suspicious=true&page=1&limit=50&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => (r.ok ? r.json() : { data: [] })),
        fetch(`${API_BASE}/api/file-scans/suspicious?page=1&limit=50&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => (r.ok ? r.json() : { data: [] })),
        fetch(`${API_BASE}/api/events?page=1&size=50&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => (r.ok ? r.json() : { data: [] })),
      ]);

      const combined = [];

      if (attackRes.status === "fulfilled" && attackRes.value?.data) {
        attackRes.value.data.slice(0, 20).forEach((item) => {
          combined.push({
            id: `attack-${item.id}`,
            severity: item.suspicious ? "high" : "info",
            source: "Host Monitoring",
            asset: item.agentName || item.hostName || "Unknown",
            title: `Suspicious command: ${item.commandName || "unknown"}`,
            reason: item.riskIndicators?.join(", ") || "Flagged by rule engine",
            timestamp: item.timestamp,
            type: "command",
          });
        });
      }

      if (fileRes.status === "fulfilled" && fileRes.value?.data) {
        fileRes.value.data.slice(0, 20).forEach((item) => {
          combined.push({
            id: `file-${item.id}`,
            severity: "critical",
            source: "File Scanner",
            asset: item.agentName || "Unknown",
            title: `Suspicious file: ${item.fileName || item.filePath || "unknown"}`,
            reason: item.findings?.map((f) => f.description).join("; ") || "Flagged by scanner",
            timestamp: item.timestamp,
            type: "file",
          });
        });
      }

      if (fimRes.status === "fulfilled" && fimRes.value?.data) {
        fimRes.value.data.slice(0, 20).forEach((item) => {
          combined.push({
            id: `fim-${item.id}`,
            severity: Number(item.ruleLevel) >= 12 ? "critical" : Number(item.ruleLevel) >= 8 ? "high" : "medium",
            source: "FIM",
            asset: item.agentName || "Unknown",
            title: `File changed: ${item.syscheck?.path || item.filePath || "unknown"}`,
            reason: item.syscheck?.event || item.eventType || "File integrity change detected",
            timestamp: item.timestamp,
            type: "fim",
          });
        });
      }

      combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setAlerts(combined);
    } catch (err) {
      console.error("Failed to load alerts:", err);
    } finally {
      setLoading(false);
    }
  }, [rangeKey, filterMode, customDateRange]);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(() => loadAlerts(), 60_000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const filteredAlerts = alerts.filter((alert) => {
    if (filterSeverity !== "all" && alert.severity !== filterSeverity) return false;
    if (filterSource !== "all" && alert.source !== filterSource) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        alert.title.toLowerCase().includes(q) ||
        alert.source.toLowerCase().includes(q) ||
        alert.asset.toLowerCase().includes(q) ||
        alert.reason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    critical: alerts.filter((a) => a.severity === "critical").length,
    high: alerts.filter((a) => a.severity === "high").length,
    medium: alerts.filter((a) => a.severity === "medium").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };

  return (
    <div className="p-4 md:p-5 flex flex-col gap-4 w-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <Bell className="h-4 w-4 text-sky-400" />
            Security Alerts Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Aggregated security alerts from all monitoring sources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RangeFilter
            rangeKey={rangeKey}
            onRangeChange={(k) => {
              setRangeKey(k);
              setFilterMode("range");
            }}
            dimmed={filterMode === "custom"}
          />
          <DateRangeFilter
            value={customDateRange}
            onChange={(range) => {
              setCustomDateRange(range);
              setFilterMode("custom");
            }}
            className={filterMode === "range" ? "opacity-50" : ""}
          />
          <span className="hidden lg:flex items-center gap-1 text-[11px] text-slate-600">
            <CalendarRange className="h-3 w-3" />
            {filterMode === "custom"
              ? new Date(effectiveRange.start).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) +
                " - " +
                new Date(effectiveRange.end).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
              : rangeKey}
          </span>
        </div>
      </div>

      {/* Severity Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Critical", count: counts.critical, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
          { label: "High", count: counts.high, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
          { label: "Medium", count: counts.medium, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
          { label: "Info", count: counts.info, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => setFilterSeverity(filterSeverity === s.label.toLowerCase() ? "all" : s.label.toLowerCase())}
            className={`rounded-lg border p-3 text-left transition-all ${
              filterSeverity === s.label.toLowerCase()
                ? `${s.bg} ring-1 ring-white/5`
                : "bg-[var(--soc-card)] border-[var(--soc-border)] hover:border-slate-700"
            }`}
          >
            <div className="text-[10px] text-slate-500 uppercase font-semibold">{s.label}</div>
            <div className={`text-lg md:text-2xl font-black ${s.color} mt-1`}>{s.count}</div>
          </button>
        ))}
      </div>

      {/* Search + Source Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alerts by title, source, asset, or reason..."
            className="w-full pl-10 pr-4 py-2 bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg text-xs text-[var(--soc-text-primary)] placeholder-slate-600 focus:outline-none focus:border-sky-500/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {["all", "Host Monitoring", "File Scanner", "FIM"].map((source) => (
            <button
              key={source}
              onClick={() => setFilterSource(source)}
              className={`px-2.5 py-1.5 text-[11px] whitespace-nowrap rounded-md font-medium transition-colors ${
                filterSource === source
                  ? "bg-sky-600/20 text-sky-400 border border-sky-600/30"
                  : "bg-[var(--soc-card)] text-slate-500 hover:text-slate-300 border border-[var(--soc-border)]"
              }`}
            >
              {source === "all" ? "All" : source}
            </button>
          ))}
        </div>
      </div>

      {/* Alert Feed */}
      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-400 border-t-transparent" />
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 font-medium">No alerts found</p>
            <p className="text-xs text-slate-600 mt-1">
              {alerts.length === 0
                ? "No security events detected in the monitored sources."
                : "Try adjusting your search or filters."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--soc-border)]">
            {filteredAlerts.map((alert) => {
              const severityKey = alert.severity || "info";
              const sev = SEVERITY_CONFIG[severityKey] || SEVERITY_CONFIG.info;

              return (
                <div
                  key={alert.id}
                  className="px-4 py-3 hover:bg-[var(--soc-elevated)]/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${sev.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full border ${sev.bg} ${sev.text} ${sev.border}`}>
                          {sev.label}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">{alert.source}</span>
                        <span className="text-[11px] text-slate-600">-</span>
                        <span className="text-[11px] text-slate-500">{alert.asset}</span>
                      </div>
                      <p className="text-[13px] text-slate-200 mt-1 truncate">{alert.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{alert.reason}</p>
                    </div>
                    <div className="text-[10px] text-slate-600 shrink-0 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(alert.timestamp).toLocaleString("en-US", {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
