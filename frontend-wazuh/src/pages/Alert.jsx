import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronDown, Clock, Shield, Search, AlertTriangle, CalendarRange, SlidersHorizontal } from "lucide-react";
import DateRangeFilter from "../components/DateRangeFilter";
import RangeFilter from "../components/RangeFilter";
import PageLoader from "../components/PageLoader";
import { fetchAllEvents } from "../utils/fetchAllEvents";
import {
  createDefaultDateRange,
  normalizeDateRange,
  getIsoDateRange,
} from "../utils/dateRange";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [rangeKey, setRangeKey] = useState("24h");
  const [filterMode, setFilterMode] = useState("range");
  const [filterSource, setFilterSource] = useState("all");
  const [customDateRange, setCustomDateRange] = useState(() =>
    createDefaultDateRange(1)
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [agentFilter, setAgentFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const APP_BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
      const API_BASE = `${window.location.origin}${APP_BASE_PATH}`;
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const currentRange =
        filterMode === "custom"
          ? getIsoDateRange(normalizeDateRange(customDateRange))
          : rangeKeyToDateRange(rangeKey);
      const { start, end } = getIsoDateRange({
        start: currentRange.start,
        end: currentRange.end,
      });
      const buildAlertLink = (path, params = {}) => {
        const query = new URLSearchParams({ start, end, focus: "logs", ...params });
        return `${path}?${query.toString()}`;
      };
      const fetchAlertSource = (url) => fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Alert source returned ${response.status}`);
        return response.json();
      });

      // Ambil SEMUA halaman tiap sumber (tanpa batas 50).
      // Sumber events memakai util paralel search_after agar cepat & lolos jendela 10000 ES.
      const ES_MAX_WINDOW = 10000;
      const fetchAllPages = async (baseUrl, { sizeKey = "limit", pageSize = 1000, getRows, getTotalPages }) => {
        const rows = [];
        let page = 1;
        for (;;) {
          const body = await fetchAlertSource(`${baseUrl}&page=${page}&${sizeKey}=${pageSize}`);
          const batch = getRows(body);
          if (batch.length > 0) rows.push(...batch);
          const totalPages = getTotalPages(body);
          if (!totalPages || page >= totalPages || batch.length === 0) break;
          if ((page + 1) * pageSize > ES_MAX_WINDOW) break;
          page += 1;
        }
        return rows;
      };

      const esRows = (body) => {
        if (Array.isArray(body?.data)) return body.data;
        if (Array.isArray(body?.content)) return body.content;
        if (Array.isArray(body?.hits)) return body.hits;
        return [];
      };
      const esTotalPages = (body) => Number(body?.pagination?.totalPages || 0);

      const rangeQs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      const [attackRes, fileRes, fimRes, mlRes] = await Promise.allSettled([
        fetchAllPages(`${API_BASE}/api/linux-commands?suspicious=true&${rangeQs}`, { pageSize: 1000, getRows: esRows, getTotalPages: esTotalPages }),
        fetchAllPages(`${API_BASE}/api/file-scans/suspicious?${rangeQs}`, { pageSize: 100, getRows: esRows, getTotalPages: esTotalPages }),
        fetchAllEvents(fetchAlertSource, {
          baseUrl: `${API_BASE}/api/events`,
          start, end, slices: 6, pageSize: 1000,
        }).then((r) => r.rows),
        fetchAllPages(`${API_BASE}/api/ml/predictions?${rangeQs}`, { pageSize: 1000, getRows: esRows, getTotalPages: esTotalPages }),
      ]);

      const getResponseRows = (result) => (result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);

      // Ambil nilai pertama yang terisi (lewati "-", "unknown", string kosong)
      const pick = (...vals) => {
        for (const v of vals) {
          const s = String(v ?? "").trim();
          if (s && s !== "-" && s.toLowerCase() !== "unknown") return v;
        }
        return undefined;
      };

      const attackData = getResponseRows(attackRes);
      const fileData = getResponseRows(fileRes);
      const fimData = getResponseRows(fimRes);
      const mlData = getResponseRows(mlRes);
      const failedSources = [
        attackRes.status !== "fulfilled" ? "host monitoring" : "",
        fileRes.status !== "fulfilled" ? "file scanner" : "",
        fimRes.status !== "fulfilled" ? "file integrity monitoring" : "",
        mlRes.status !== "fulfilled" ? "ml predictions" : "",
      ].filter(Boolean);

      if (failedSources.length > 0) {
        setLoadError(`Some alert sources could not be loaded: ${failedSources.join(", ")}.`);
      }

      const allAlerts = [
        ...attackData.map((a, i) => ({
          id: `attack-${a.id || i}`,
          title: a.description || a.command || "Suspicious command detected",
          severity: String(a.risk_level || a.riskLevel || "medium").toLowerCase() === "high" ? "critical" : String(a.risk_level || a.riskLevel || "medium").toLowerCase() === "medium" ? "high" : "medium",
          source: "Host Monitoring",
          asset: pick(a.hostName, a.hostname, a.host, a.agentName, a.agent_name) || "Unknown",
          agent: pick(a.agentName, a.agent_name) || "-",
          user: pick(a.user, a.username) || "-",
          reason: `User: ${pick(a.user, a.username) || "unknown"} | Command: ${(a.command || "").substring(0, 60)}`,
          timestamp: a.timestamp || a.created_at,
          link: buildAlertLink("/attack-dashboard", {
            status: "suspicious",
            ...(pick(a.agentName, a.agent_name) ? { agent: pick(a.agentName, a.agent_name) } : {}),
          }),
        })),
        ...fileData.map((f, i) => {
          const findings = Array.isArray(f.findings) ? f.findings : [];
          const topFinding = findings.map((x) => String(x?.indicator || x?.name || x || "")).filter(Boolean).slice(0, 2).join(", ");
          const count = Number(f.findingsCount ?? findings.length ?? 0);
          return {
            id: `file-${f.id || i}`,
            title: pick(f.fileName, f.threat_name, f.file_name) || "Suspicious file detected",
            severity: count >= 5 ? "critical" : count >= 2 ? "high" : "medium",
            source: "File Scanner",
            asset: pick(f.filePath, f.file_path) || "Unknown",
            agent: pick(f.agentName, f.agent_name) || "-",
            user: "-",
            reason: `Scanner: ${pick(f.scanner) || "file-scan"} | Findings: ${count || "-"}${topFinding ? ` | ${topFinding}` : ""} | SHA256: ${String(f.sha256 || f.hash || "").substring(0, 16)}${f.sha256 || f.hash ? "..." : "-"}`,
            timestamp: f.timestamp || f.scan_time || f.created_at,
            link: buildAlertLink("/file-security", {
              ...(pick(f.agentName, f.agent_name) ? { agent: pick(f.agentName, f.agent_name) } : {}),
            }),
          };
        }),
        ...fimData.map((e, i) => {
          const ruleLevel = Number(e.ruleLevel ?? e.rule_level ?? e.level ?? e.severity ?? 0);
          return {
            id: `fim-${e.id || i}`,
            title: `${e.syscheckEvent && e.syscheckEvent !== "-" ? e.syscheckEvent : e.type || "File change"} detected`,
            severity: ruleLevel >= 10 ? "critical" : ruleLevel >= 7 ? "high" : ruleLevel >= 4 ? "medium" : "low",
            source: "FIM",
            asset: pick(e.syscheckPath, e.file, e.path, e.filePath) || "Unknown",
            agent: pick(e.agentName, e.agent_name, e.agent?.name) || "-",
            user: pick(e.username) || "-",
            reason: `Agent: ${pick(e.agentName, e.agent_name, e.agent?.name) || "unknown"} | Rule: ${pick(e.ruleDescription, e.rule_description) || "-"} (level ${Number.isNaN(ruleLevel) ? "-" : ruleLevel})`,
            timestamp: e.timestamp || e.created_at || e.createdAt || e["@timestamp"],
            link: buildAlertLink("/fim-events", {
              ...(pick(e.agentName, e.agent_name, e.agent?.name) ? { agent: pick(e.agentName, e.agent_name, e.agent?.name) } : {}),
              ...(pick(e.syscheckPath, e.file, e.path, e.filePath) ? { path: pick(e.syscheckPath, e.file, e.path, e.filePath) } : {}),
            }),
          };
        }),
        ...mlData
          .filter((p) => {
            const label = String(p.predictedLabel || p.label || "").toLowerCase();
            return label && !label.includes("benign") && !label.includes("normal");
          })
          .map((p, i) => {
            const rawConf = typeof p.confidence === "number" ? p.confidence : parseFloat(p.confidence);
            const conf = Number.isNaN(rawConf) ? null : Math.min(Math.max(rawConf > 1 ? rawConf : rawConf * 100, 0), 100);
            return {
              id: `ml-${p.id || i}`,
              title: `${p.predictedLabel || p.label || "Threat"} detected by ML`,
              severity: conf === null ? "medium" : conf >= 80 ? "critical" : conf >= 60 ? "high" : conf >= 40 ? "medium" : "low",
              source: "ML Predictions",
              asset: p.agent || "Unknown",
              agent: p.agent || "-",
              user: "-",
              reason: `Service: ${p.service || "-"} | ${p.sourceIp || "-"} → ${p.destinationIp || "-"}${conf === null ? "" : ` | Confidence: ${Math.round(conf)}%`}`,
              timestamp: p.timestamp || p.created_at || p.createdAt || p["@timestamp"],
              link: buildAlertLink("/ml-dashboard", {
                ...(p.agent ? { agent: p.agent } : {}),
              }),
            };
          }),
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      setAlerts(allAlerts);
    } catch (err) {
      console.error("Failed to load alerts", err);
      setLoadError("Security alert data is currently unavailable.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [rangeKey, filterMode, customDateRange]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleRangeChange = (key) => {
    setPage(1);
    setRangeKey(key);
    setFilterMode("range");
  };

  const handleCustomRangeChange = (range) => {
    setPage(1);
    setCustomDateRange(range);
    setFilterMode("custom");
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      !search ||
      alert.title.toLowerCase().includes(search.toLowerCase()) ||
      alert.source.toLowerCase().includes(search.toLowerCase()) ||
      alert.asset.toLowerCase().includes(search.toLowerCase()) ||
      String(alert.user || "").toLowerCase().includes(search.toLowerCase()) ||
      alert.reason.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity =
      filterSeverity === "all" || alert.severity === filterSeverity;
    const matchesSource =
      filterSource === "all" || alert.source === filterSource;
    const matchesAgent =
      agentFilter === "all" || alert.agent === agentFilter;
    const matchesUser =
      userFilter === "all" || alert.user === userFilter;
    return matchesSearch && matchesSeverity && matchesSource && matchesAgent && matchesUser;
  });

  const agentOptions = useMemo(() => {
    const set = new Set();
    for (const a of alerts) {
      const v = String(a.agent || "").trim();
      if (v && v !== "-") set.add(v);
    }
    return Array.from(set).sort();
  }, [alerts]);

  const userOptions = useMemo(() => {
    const set = new Set();
    for (const a of alerts) {
      const v = String(a.user || "").trim();
      if (v && v !== "-") set.add(v);
    }
    return Array.from(set).sort();
  }, [alerts]);

  const activeFilterCount = [
    filterSource !== "all",
    agentFilter !== "all",
    userFilter !== "all",
  ].filter(Boolean).length;

  useEffect(() => {
    if (!filtersOpen) return;
    const handleClick = (e) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target)) setFiltersOpen(false);
    };
    const handleKey = (e) => { if (e.key === "Escape") setFiltersOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [filtersOpen]);

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / pageSize));
  const activePage = page > totalPages ? 1 : page;
  const pagedAlerts = filteredAlerts.slice(
    (activePage - 1) * pageSize,
    activePage * pageSize
  );

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
          <div className="relative flex items-center bg-[var(--soc-card)] rounded-lg border border-[var(--soc-border)]">
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
              }}
              aria-label="Rows per page"
              className="appearance-none bg-transparent py-2 pl-2.5 pr-5 text-[11px] font-medium leading-tight text-[var(--soc-text-primary)] focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (<option key={size} value={size} className="bg-[var(--soc-card)] text-[var(--soc-text-primary)]">{size}</option>))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--soc-text-muted)]" />
          </div>
        </div>
      </div>

      {/* Severity Cards */}
      {loadError && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-[10px] text-yellow-300">
          {loadError}
        </div>
      )}
      <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-3">
        {[
          { key: "critical", label: "Critical", count: severityCounts.critical, color: "text-red-400", icon: AlertTriangle },
          { key: "high", label: "High", count: severityCounts.high, color: "text-orange-400", icon: AlertTriangle },
          { key: "medium", label: "Medium", count: severityCounts.medium, color: "text-yellow-400", icon: AlertTriangle },
          { key: "low", label: "Low", count: severityCounts.low, color: "text-emerald-400", icon: AlertTriangle },
        ].map((s, i) => (
          <button
            key={s.key}
            onClick={() => { setPage(1); setFilterSeverity(filterSeverity === s.key ? "all" : s.key); }}
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

      {/* Search + Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--soc-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search alerts by title, source, asset, or reason..."
            className="w-full pl-10 pr-4 py-2 bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg text-[11px] text-[var(--soc-text-primary)] placeholder-[var(--soc-text-muted)] focus:outline-none focus:border-purple-500/50 transition-colors"
          />
        </div>
        <div ref={filtersRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFiltersOpen((c) => !c)}
            className="flex items-center gap-2 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-2.5 text-[11px] text-[var(--soc-text-primary)] focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-colors hover:bg-[var(--soc-elevated)]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--soc-text-muted)]" />
            <span className="font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-purple-500/20 text-purple-300 text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 text-[var(--soc-text-muted)] transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
          {filtersOpen && (
            <div className="absolute right-0 top-full mt-1 z-[100] w-[240px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--soc-border)]">
                <span className="text-[10px] font-semibold text-[var(--soc-text-primary)]">Filter Options</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setPage(1); setFilterSource("all"); setAgentFilter("all"); setUserFilter("all"); }}
                    className="text-[9px] font-semibold text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="divide-y divide-[var(--soc-border)] max-h-[300px] overflow-y-auto">
                <div className="px-3 py-2">
                  <div className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider mb-1.5">Source</div>
                  <div className="flex flex-wrap gap-1">
                    {["all", "Host Monitoring", "File Scanner", "FIM", "ML Predictions"].map((source) => (
                      <button
                        key={source}
                        onClick={() => { setPage(1); setFilterSource(filterSource === source ? "all" : source); }}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${filterSource === source ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}
                      >
                        {source === "all" ? "All Sources" : source}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider mb-1.5">Agent</div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => { setPage(1); setAgentFilter("all"); }}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${agentFilter === "all" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}
                    >
                      All agents
                    </button>
                    {agentOptions.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setPage(1); setAgentFilter(agentFilter === opt ? "all" : opt); }}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${agentFilter === opt ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider mb-1.5">User</div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => { setPage(1); setUserFilter("all"); }}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${userFilter === "all" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}
                    >
                      All users
                    </button>
                    {userOptions.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setPage(1); setUserFilter(userFilter === opt ? "all" : opt); }}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${userFilter === opt ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
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
            {pagedAlerts.map((alert, idx) => {
              const severityKey = alert.severity || "medium";
              const sev = SEVERITY_CONFIG[severityKey] || SEVERITY_CONFIG.medium;

              return (
                <div
                  key={alert.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(alert.link)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(alert.link);
                    }
                  }}
                  className="cursor-pointer px-4 py-3 hover:bg-[var(--soc-elevated)]/50 transition-colors animate-fadeInUp"
                  style={{ opacity: 0, animationDelay: `${idx * 0.03}s` }}
                  title="Open related log"
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
                        {alert.user && alert.user !== "-" && (
                          <>
                            <span className="text-[10px] text-[var(--soc-text-muted)]">·</span>
                            <span className="text-[10px] text-[var(--soc-text-muted)]">User: {alert.user}</span>
                          </>
                        )}
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
        {filteredAlerts.length > 0 && (
          <div className="border-t border-[var(--soc-border)] bg-[var(--soc-elevated)]/50 px-2 md:px-4 py-3">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0">
              <div className="text-[10px] md:text-[11px] font-mono text-[var(--soc-text-muted)]">
                <span className="hidden md:inline">SHOWING </span>
                <span className="font-bold text-[var(--soc-text-primary)]">{(activePage - 1) * pageSize + 1}</span>
                <span className="hidden md:inline"> - </span><span className="md:hidden">-</span>
                <span className="font-bold text-[var(--soc-text-primary)]">{Math.min(activePage * pageSize, filteredAlerts.length)}</span>
                <span className="hidden md:inline"> OF </span><span className="md:hidden"> / </span>
                <span className="font-bold text-[var(--soc-text-primary)]">{filteredAlerts.length}</span>
                <span className="hidden md:inline"> ALERTS</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={activePage === 1 || loading} onClick={() => setPage(1)} className="rounded border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-[var(--soc-text-secondary)] transition-all hover:border-purple-500/50 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-20">FIRST</button>
                <button disabled={activePage === 1 || loading} onClick={() => setPage(Math.max(1, activePage - 1))} className="rounded border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-[var(--soc-text-secondary)] transition-all hover:border-purple-500/50 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-20">PREV</button>
                <span className="px-1 text-[10px] md:text-[11px] font-black text-[var(--soc-text-muted)]"><span className="hidden md:inline">PAGE </span><span className="text-[var(--soc-text-primary)]">{activePage}</span> / {totalPages}</span>
                <button disabled={activePage >= totalPages || loading} onClick={() => setPage(Math.min(totalPages, activePage + 1))} className="rounded border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-[var(--soc-text-secondary)] transition-all hover:border-purple-500/50 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-20">NEXT</button>
                <button disabled={activePage >= totalPages || loading} onClick={() => setPage(totalPages)} className="rounded border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-[var(--soc-text-secondary)] transition-all hover:border-purple-500/50 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-20">LAST</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
