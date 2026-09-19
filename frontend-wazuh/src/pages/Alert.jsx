import React, { useState, useEffect, useCallback } from "react";
import { Bell, Clock, Shield, Search, AlertTriangle, CalendarRange } from "lucide-react";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import PageLoader from "../components/PageLoader";
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
  critical: { label: "Critical", color: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/30", dot: "bg-red-400" },
  high: { label: "High", color: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30", dot: "bg-orange-400" },
  medium: { label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/30", dot: "bg-yellow-400" },
  low: { label: "Low", color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", dot: "bg-emerald-400" },
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
      const APP_BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
      const API_BASE = `${window.location.origin}${APP_BASE_PATH}`;
      const token = localStorage.getItem("token");
      const currentRange =
        filterMode === "custom"
          ? getIsoDateRange(normalizeDateRange(customDateRange))
          : rangeKeyToDateRange(rangeKey);
      const { start, end } = getIsoDateRange({
        start: currentRange.start,
        end: currentRange.end,
      });

      const [attackRes, fileRes, fimRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/linux-commands?suspicious=true&page=1&limit=50&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => (r.ok ? r.json() : { data: [] })),
        fetch(`${API_BASE}/api/file-scans/suspicious?page=1&limit=50&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => (r.ok ? r.json() : { data: [] })),
        fetch(`${API_BASE}/api/events?page=1&size=50&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => (r.ok ? r.json() : { content: [] })),
      ]);

      const attackData = attackRes.status === "fulfilled" ? attackRes.value?.data || [] : [];
      const fileData = fileRes.status === "fulfilled" ? fileRes.value?.data || [] : [];
      const fimData = fimRes.status === "fulfilled" ? fimRes.value?.content || [] : [];

      const allAlerts = [
        ...attackData.map((a, i) => ({
          id: `attack-${a.id || i}`,
          title: a.description || a.command || "Suspicious command detected",
          severity: a.risk_level === "high" ? "critical" : a.risk_level === "medium" ? "high" : "medium",
          source: "Host Monitoring",
          asset: a.hostname || a.host || "Unknown",
          reason: `User: ${a.username || "unknown"} | Command: ${(a.command || "").substring(0, 60)}`,
          timestamp: a.timestamp || a.created_at,
        })),
        ...fileData.map((f, i) => ({
          id: `file-${f.id || i}`,
          title: f.threat_name || f.file_name || "Suspicious file detected",
          severity: f.threat_level === "malicious" ? "critical" : f.threat_level === "suspicious" ? "high" : "medium",
          source: "File Scanner",
          asset: f.file_path || "Unknown",
          reason: `Action: ${f.action || "scanned"} | Hash: ${(f.hash || "").substring(0, 16)}...`,
          timestamp: f.scan_time || f.created_at,
        })),
        ...fimData.map((e, i) => ({
          id: `fim-${e.id || i}`,
          title: `${e.type || "File change"} detected`,
          severity: e.severity === "high" ? "high" : e.severity === "medium" ? "medium" : "low",
          source: "FIM",
          asset: e.file || e.path || "Unknown",
          reason: `Agent: ${e.agent_name || "unknown"} | Changes: ${e.changes || "modified"}`,
          timestamp: e.timestamp || e.created_at,
        })),
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      setAlerts(allAlerts);
    } catch (err) {
      console.error("Failed to load alerts", err);
    } finally {
      setLoading(false);
    }
  }, [rangeKey, filterMode, customDateRange]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleRangeChange = (key) => {
    setRangeKey(key);
    setFilterMode("range");
  };

  const handleCustomRangeChange = (range) => {
    setCustomDateRange(range);
    setFilterMode("custom");
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      !search ||
      alert.title.toLowerCase().includes(search.toLowerCase()) ||
      alert.source.toLowerCase().includes(search.toLowerCase()) ||
      alert.asset.toLowerCase().includes(search.toLowerCase()) ||
      alert.reason.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity =
      filterSeverity === "all" || alert.severity === filterSeverity;
    const matchesSource =
      filterSource === "all" || alert.source === filterSource;
    return matchesSearch && matchesSeverity && matchesSource;
  });

  const severityCounts = alerts.reduce(
    (acc, alert) => {
      const key = alert.severity || "medium";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );

  return (
    <div className="flex flex-col w-full min-w-0 gap-4">
      {/* Header */}
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">
            Security Alerts
          </h1>
          <p className="text-[11px] text-[var(--soc-text-muted)] mt-0.5">
            Monitor and investigate security events across all sources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RangeFilter
            rangeKey={rangeKey}
            onRangeChange={handleRangeChange}
          />
          <DateRangeFilter
            value={customDateRange}
            onChange={handleCustomRangeChange}
          />
        </div>
      </div>

      {/* Severity Cards */}
      <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-3">
        {[
          { key: "critical", label: "Critical", count: severityCounts.critical, color: "text-red-400", icon: AlertTriangle },
          { key: "high", label: "High", count: severityCounts.high, color: "text-orange-400", icon: AlertTriangle },
          { key: "medium", label: "Medium", count: severityCounts.medium, color: "text-yellow-400", icon: AlertTriangle },
          { key: "low", label: "Low", count: severityCounts.low, color: "text-emerald-400", icon: AlertTriangle },
        ].map((s, i) => (
          <button
            key={s.key}
            onClick={() => setFilterSeverity(filterSeverity === s.key ? "all" : s.key)}
            className={`kpi-modern animate-fadeInUp text-left ${filterSeverity === s.key ? "ring-1 ring-purple-500/30" : ""}`}
            style={{ opacity: 0, animationDelay: `${i * 0.05}s` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">{s.label}</span>
              <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
            </div>
            <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
          </button>
        ))}
      </div>

      {/* Search + Source Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--soc-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alerts by title, source, asset, or reason..."
            className="w-full pl-10 pr-4 py-2 bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg text-[11px] text-[var(--soc-text-primary)] placeholder-[var(--soc-text-muted)] focus:outline-none focus:border-purple-500/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {["all", "Host Monitoring", "File Scanner", "FIM"].map((source) => (
            <button
              key={source}
              onClick={() => setFilterSource(source)}
              className={`px-2.5 py-1.5 text-[10px] whitespace-nowrap rounded-lg font-medium transition-all ${
                filterSource === source
                  ? "bg-purple-500/15 text-purple-400 border border-purple-500/25"
                  : "bg-[var(--soc-card)] text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] border border-[var(--soc-border)]"
              }`}
            >
              {source === "all" ? "All Sources" : source}
            </button>
          ))}
        </div>
      </div>

      {/* Alert Feed */}
      <div className="chart-card overflow-hidden">
        {loading ? (
          <PageLoader message="Loading..." />
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-[var(--soc-elevated)] mb-4">
              <Shield className="h-8 w-8 text-[var(--soc-text-muted)]" />
            </div>
            <p className="text-sm font-medium text-[var(--soc-text-secondary)]">No alerts found</p>
            <p className="text-[11px] text-[var(--soc-text-muted)] mt-1">
              {alerts.length === 0
                ? "No security events detected in the monitored sources."
                : "Try adjusting your search or filters."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--soc-border)]">
            {filteredAlerts.map((alert, idx) => {
              const severityKey = alert.severity || "medium";
              const sev = SEVERITY_CONFIG[severityKey] || SEVERITY_CONFIG.medium;

              return (
                <div
                  key={alert.id}
                  className="px-4 py-3 hover:bg-[var(--soc-elevated)]/50 transition-colors animate-fadeInUp"
                  style={{ opacity: 0, animationDelay: `${idx * 0.03}s` }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${sev.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[9px] font-semibold rounded-full border ${sev.bg} ${sev.color} ${sev.border}`}>
                          {sev.label}
                        </span>
                        <span className="text-[10px] text-[var(--soc-text-muted)] font-medium">{alert.source}</span>
                        <span className="text-[10px] text-[var(--soc-text-muted)]">·</span>
                        <span className="text-[10px] text-[var(--soc-text-muted)]">{alert.asset}</span>
                      </div>
                      <p className="text-[12px] text-[var(--soc-text-primary)] mt-1 truncate font-medium">{alert.title}</p>
                      <p className="text-[10px] text-[var(--soc-text-muted)] mt-0.5 truncate">{alert.reason}</p>
                    </div>
                    <div className="text-[9px] text-[var(--soc-text-muted)] shrink-0 flex items-center gap-1">
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
