import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  ExternalLink,
  Eye,
  FileSearch,
  Globe,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Navbar from "../components/Navbar";
import {
  createWebDefacementEndpoint,
  fetchWebDefacementEndpoints,
  removeWebDefacementEndpoint,
  scanWebDefacementEndpoint,
} from "../services/webDefacementApi";

function normalizeEndpoint(url = "") {
  const trimmed = String(url).trim();
  if (!trimmed) return "";

  try {
    const parsedUrl = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const pathname =
      parsedUrl.pathname && parsedUrl.pathname !== "/"
        ? parsedUrl.pathname.replace(/\/+$/, "")
        : "";

    return `${parsedUrl.host.toLowerCase()}${pathname}${parsedUrl.search}`;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
}

function toHref(url = "") {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function formatBytes(size) {
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0));
}

function formatPercentage(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function summarizeMatches(page) {
  return Number(page?.matches || 0);
}

function hasFetchedSnapshot(endpoint = {}) {
  if (endpoint.error) return true;
  if (endpoint.lastScan) return true;
  if (endpoint.finalUrl || endpoint.httpStatus || endpoint.responseTimeMs || endpoint.htmlSize) return true;
  if (endpoint.pageTitle || endpoint.metaDescription) return true;
  if (typeof endpoint.totalResults === "number") return true;
  if (typeof endpoint.scannedPagesCount === "number") return true;
  if (Array.isArray(endpoint.scanResults) && endpoint.scanResults.length > 0) return true;
  return false;
}

const STATUS_META = {
  safe: {
    label: "HTML aman",
    shortLabel: "Aman",
    badgeLabel: "HTML AMAN",
    badgeClassName: "bg-emerald-950/50 text-emerald-400 border border-emerald-900/50",
    dotClassName: "bg-emerald-400",
    color: "#34d399",
    chipClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  review: {
    label: "Perlu tinjau",
    shortLabel: "Tinjau",
    badgeLabel: "PERLU TINJAU",
    badgeClassName: "bg-amber-950/50 text-amber-400 border border-amber-900/50",
    dotClassName: "bg-amber-400",
    color: "#f59e0b",
    chipClassName: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  detected: {
    label: "Terindikasi",
    shortLabel: "Terdeteksi",
    badgeLabel: "TERINDIKASI",
    badgeClassName: "bg-red-950/50 text-red-400 border border-red-900/50",
    dotClassName: "bg-red-400",
    color: "#f87171",
    chipClassName: "border-red-500/30 bg-red-500/10 text-red-300",
  },
  error: {
    label: "Fetch error",
    shortLabel: "Error",
    badgeLabel: "FETCH ERROR",
    badgeClassName: "bg-rose-950/50 text-rose-400 border border-rose-900/50",
    dotClassName: "bg-rose-400",
    color: "#fb7185",
    chipClassName: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  },
  unfetched: {
    label: "Belum fetch",
    shortLabel: "Belum",
    badgeLabel: "BELUM FETCH",
    badgeClassName: "bg-slate-800 text-slate-300 border border-slate-700",
    dotClassName: "bg-slate-400",
    color: "#64748b",
    chipClassName: "border-slate-700 bg-slate-800/80 text-slate-300",
  },
};

const STATUS_ORDER = ["safe", "review", "detected", "error", "unfetched"];

function getEndpointStatusKey(endpoint = {}) {
  if (!hasFetchedSnapshot(endpoint)) return "unfetched";
  if (endpoint.error) return "error";
  if (endpoint.status === "safe") return "safe";
  if (endpoint.status === "detected") return "detected";
  return "review";
}

function buildStatusBadge(endpoint) {
  const meta = STATUS_META[getEndpointStatusKey(endpoint)];

  return {
    label: meta.badgeLabel,
    className: meta.badgeClassName,
    dot: meta.dotClassName,
  };
}

const StatsCards = ({ analytics }) => {
  const riskAttention = analytics.detected + analytics.review + analytics.errorCount;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      <div className="bg-slate-800/50 border border-slate-700/60 rounded p-2 md:p-3">
        <div className="text-[8px] md:text-[10px] text-slate-500 uppercase font-semibold">Total Endpoint</div>
        <div className="text-lg md:text-2xl font-black text-white mt-0.5 md:mt-1">{formatNumber(analytics.total)}</div>
        <div className="text-[8px] md:text-[9px] text-slate-500 mt-1">{formatNumber(analytics.redirectedCount)} redirect</div>
      </div>
      <div className="bg-sky-500/10 border border-sky-500/30 rounded p-2 md:p-3">
        <div className="text-[8px] md:text-[10px] text-sky-400 uppercase font-semibold">Sudah Difetch</div>
        <div className="text-lg md:text-2xl font-black text-sky-300 mt-0.5 md:mt-1">{formatNumber(analytics.scannedCount)}</div>
        <div className="text-[8px] md:text-[9px] text-sky-300/60 mt-1">{formatPercentage(analytics.coverage)} coverage</div>
      </div>
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 md:p-3">
        <div className="text-[8px] md:text-[10px] text-emerald-400 uppercase font-semibold">HTML Aman</div>
        <div className="text-lg md:text-2xl font-black text-emerald-300 mt-0.5 md:mt-1">{formatNumber(analytics.safe)}</div>
        <div className="text-[8px] md:text-[9px] text-emerald-300/60 mt-1">{formatPercentage(analytics.safeRate)} rate</div>
      </div>
      <div className="bg-red-500/10 border border-red-500/30 rounded p-2 md:p-3">
        <div className="text-[8px] md:text-[10px] text-red-400 uppercase font-semibold">Risiko Aktif</div>
        <div className="text-lg md:text-2xl font-black text-red-300 mt-0.5 md:mt-1">{formatNumber(riskAttention)}</div>
        <div className="text-[8px] md:text-[9px] text-red-300/60 mt-1">{formatNumber(analytics.detected)} terdeteksi</div>
      </div>
    </div>
  );
};

const InsightBars = ({ items, emptyLabel, valueSuffix = "x" }) => {
  if (!items.length) {
    return (
      <div className="flex min-h-40 items-center justify-center text-xs text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-2.5">
      {items.map((item, index) => (
        <div key={item.key || item.label} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-6">
              <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-slate-300 truncate" title={item.label}>
                {item.label}
              </p>
            </div>
            <span className="text-xs font-bold text-slate-300">{formatNumber(item.value)}{valueSuffix}</span>
          </div>
          <div className="flex items-center gap-2 ml-6">
            <div
              className="flex-1 bg-slate-800/50 rounded-full h-4 overflow-hidden border border-slate-700/30"
              title={`${item.label}: ${item.value}`}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: item.color,
                  opacity: 0.85,
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const PriorityEndpointList = ({ items }) => {
  if (!items.length) {
    return (
      <div className="flex min-h-40 items-center justify-center text-xs text-slate-600">
        Belum ada endpoint yang perlu diprioritaskan.
      </div>
    );
  }

  const peakRiskScore = Math.max(...items.map((item) => item.riskScore), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, idx) => {
        const statusMeta = STATUS_META[item.statusKey];
        const fillWidth = Math.max(10, Math.round((item.riskScore / peakRiskScore) * 100));

        return (
          <div key={item.id} className="rounded-lg border border-slate-700/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
                  style={{ backgroundColor: `${statusMeta.color}1f`, color: statusMeta.color }}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100" title={item.url}>{item.url}</div>
                  <div className="text-[11px] text-slate-500">
                    {formatNumber(item.matches)} match â€¢ {formatNumber(item.pages)} halaman
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-black" style={{ color: statusMeta.color }}>{formatNumber(item.riskScore)}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">risk</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${fillWidth}%`,
                  background: statusMeta.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HighlightedKeywordText = ({ text, keyword, className = "" }) => {
  const content = String(text || "");
  const searchKeyword = String(keyword || "").trim();

  if (!searchKeyword) {
    return <span className={className}>{content}</span>;
  }

  const pattern = new RegExp(`(${escapeRegExp(searchKeyword)})`, "gi");
  const parts = content.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isMatch = part.toLowerCase() === searchKeyword.toLowerCase();
        return isMatch ? (
          <mark key={`${part}-${index}`} className="bg-transparent px-0 text-red-400 font-semibold">
            {part}
          </mark>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        );
      })}
    </span>
  );
};

const KeywordDetectionPanel = ({ scanResults = [], className = "" }) => {
  const [expandedResults, setExpandedResults] = useState({});

  if (!scanResults.length) return null;

  return (
    <div className={`rounded-lg border border-slate-700/50 bg-gradient-to-br from-slate-800/40 to-slate-900/20 p-4 md:p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <div className="h-1 w-1 rounded-full bg-red-400"></div>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-300">Keyword Terdeteksi</div>
      </div>

      <div className="space-y-3">
        {scanResults.map((result, index) => {
          const resultKey = `${result.keyword}-${index}`;
          const contexts = Array.isArray(result.context) ? result.context.filter(Boolean) : [];
          const isExpanded = Boolean(expandedResults[resultKey]);
          const hiddenCount = Math.max(contexts.length - 2, 0);
          const visibleContexts = isExpanded ? contexts : contexts.slice(0, 2);

          return (
            <div
              key={resultKey}
              className="rounded-lg border border-slate-700/50 bg-slate-950/55 p-3.5 transition-colors hover:border-slate-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-bold text-red-400">"{result.keyword}"</div>
                </div>
                <div className="inline-flex shrink-0 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-200">
                  {result.count}x
                </div>
              </div>

              {contexts.length > 0 && (
                <div className="mt-3 border-t border-slate-800/80 pt-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Lokasi
                  </div>
                  <div className="space-y-2">
                    {visibleContexts.map((contextItem, contextIndex) => (
                      <div
                        key={`${resultKey}-${contextIndex}`}
                        className="break-words font-mono text-[11px] leading-5 text-slate-300"
                        title={contextItem}
                      >
                        <HighlightedKeywordText text={contextItem} keyword={result.keyword} />
                      </div>
                    ))}
                  </div>

                  {hiddenCount > 0 && !isExpanded && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedResults((current) => ({
                          ...current,
                          [resultKey]: true,
                        }))
                      }
                      className="mt-3 text-[11px] font-semibold text-sky-300 transition-colors hover:text-sky-200"
                    >
                      See more (+{hiddenCount} lokasi lain)
                    </button>
                  )}

                  {hiddenCount > 0 && isExpanded && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedResults((current) => ({
                          ...current,
                          [resultKey]: false,
                        }))
                      }
                      className="mt-3 text-[11px] font-semibold text-slate-400 transition-colors hover:text-slate-200"
                    >
                      See less
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const EndpointDetailModal = ({ endpoint, onClose }) => {
  if (!endpoint) return null;

  const headerIcon = endpoint.error ? (
    <AlertTriangle className="h-5 w-5 text-red-400" />
  ) : endpoint.status === "detected" ? (
    <ShieldAlert className="h-5 w-5 text-red-400" />
  ) : endpoint.status === "review" ? (
    <AlertTriangle className="h-5 w-5 text-amber-400" />
  ) : (
    <ShieldCheck className="h-5 w-5 text-emerald-400" />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full overflow-auto rounded-none border-0 bg-slate-900 md:max-h-[95vh] md:w-[98vw] md:rounded-xl md:border md:border-slate-700 md:shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-3 md:px-6 md:py-4 backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {headerIcon}
            <div className="min-w-0">
              <div className="text-base font-bold text-white">Detail HTML Fetch</div>
              <div className="break-all text-xs md:text-sm text-slate-400">{endpoint.url}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="p-4 md:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
            <div className="space-y-5">
              {/* Key Metrics Grid - Compact */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                <div className="rounded-lg border border-slate-700/40 bg-gradient-to-br from-slate-800/60 to-slate-800/30 p-3 hover:bg-slate-800/50 transition-colors">
                  <div className="text-lg md:text-xl font-black text-white">{endpoint.httpStatus || "-"}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">HTTP Status</div>
                </div>
                <div className="rounded-lg border border-slate-700/40 bg-gradient-to-br from-slate-800/60 to-slate-800/30 p-3 hover:bg-slate-800/50 transition-colors">
                  <div className="text-lg md:text-xl font-black text-white">{endpoint.responseTimeMs || "-"}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Response ms</div>
                </div>
                <div className="rounded-lg border border-slate-700/40 bg-gradient-to-br from-slate-800/60 to-slate-800/30 p-3 hover:bg-slate-800/50 transition-colors">
                  <div className="text-lg md:text-xl font-black text-white">{formatBytes(endpoint.htmlSize)}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ukuran HTML</div>
                </div>
                <div className="rounded-lg border border-slate-700/40 bg-gradient-to-br from-slate-800/60 to-slate-800/30 p-3 hover:bg-slate-800/50 transition-colors">
                  <div className="text-lg md:text-xl font-black text-white">{endpoint.totalResults || 0}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Match</div>
                </div>
                <div className="rounded-lg border border-slate-700/40 bg-gradient-to-br from-slate-800/60 to-slate-800/30 p-3 hover:bg-slate-800/50 transition-colors">
                  <div className="text-lg md:text-xl font-black text-white">{endpoint.scannedPagesCount || 0}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Halaman</div>
                </div>
                {endpoint.failedPagesCount ? (
                  <div className="rounded-lg border border-red-700/40 bg-gradient-to-br from-red-900/40 to-red-900/20 p-3 hover:bg-red-900/30 transition-colors">
                    <div className="text-lg md:text-xl font-black text-red-300">{endpoint.failedPagesCount}</div>
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-red-400">Gagal</div>
                  </div>
                ) : null}
              </div>

              {/* Page Metadata */}
              <div className="rounded-lg border border-slate-700/50 bg-gradient-to-br from-slate-800/40 to-slate-900/20 p-4 md:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-sky-400"></div>
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-300">Informasi Halaman</div>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title Halaman</div>
                    <div className="mt-2 break-words text-sm text-slate-100 font-medium">
                      {endpoint.pageTitle || <span className="text-slate-500 italic">-</span>}
                    </div>
                  </div>
                  <div className="border-t border-slate-700/30"></div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meta Description</div>
                    <div className="mt-2 break-words text-sm text-slate-200">
                      {endpoint.metaDescription || <span className="text-slate-500 italic">-</span>}
                    </div>
                  </div>
                  <div className="border-t border-slate-700/30"></div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Final URL</div>
                    <div className="mt-2 break-all font-mono text-xs md:text-sm text-sky-300 bg-slate-900/50 rounded p-2">
                      {endpoint.finalUrl || <span className="text-slate-500 italic">-</span>}
                    </div>
                  </div>
                  {endpoint.lastScan && (
                    <>
                      <div className="border-t border-slate-700/30"></div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waktu Scan Terakhir</div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                          <Clock className="h-3.5 w-3.5 text-slate-500" />
                          {formatDate(endpoint.lastScan)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Error Alert */}
              {endpoint.error && (
                <div className="rounded-lg border border-red-900/50 bg-gradient-to-br from-red-950/40 to-red-950/20 p-4 md:p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    Fetch Error
                  </div>
                  <div className="break-all font-mono text-xs text-red-300 bg-red-950/50 rounded p-3">{endpoint.error}</div>
                </div>
              )}

              {/* Scanned Pages List */}
              {endpoint.scannedPages?.length > 0 && (
                <div className="rounded-lg border border-slate-700/50 bg-gradient-to-br from-slate-800/40 to-slate-900/20 p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-1 rounded-full bg-emerald-400"></div>
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-300">Halaman Dipindai</div>
                    </div>
                    <div className="inline-flex rounded-full bg-slate-700/60 px-3 py-1 text-xs font-semibold text-slate-300">
                      {endpoint.scannedPagesCount || endpoint.scannedPages.length}
                      {endpoint.crawlLimit ? ` / ${endpoint.crawlLimit}` : ""}
                    </div>
                  </div>
                  <div className="max-h-96 space-y-2 overflow-y-auto">
                    {endpoint.scannedPages.map((page, index) => (
                      <div
                        key={`${page.url}-${index}`}
                        className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3 hover:bg-slate-900 transition-colors group"
                      >
                        <div className="break-all text-xs md:text-sm text-slate-200 font-mono group-hover:text-sky-300 transition-colors">
                          {page.url}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {page.pageTitle && (
                            <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300">
                              {page.pageTitle}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-slate-800/60">HTTP {page.httpStatus || "-"}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-800/60">{summarizeMatches(page)} match</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
              {endpoint.scanResults?.length > 0 ? (
                <KeywordDetectionPanel
                  key={`${endpoint.id}-${endpoint.lastScan || "no-scan"}`}
                  scanResults={endpoint.scanResults}
                />
              ) : !endpoint.error ? (
                <div className="rounded-lg border border-emerald-900/40 bg-gradient-to-br from-emerald-950/30 to-emerald-950/10 p-4 md:p-5 text-sm text-emerald-300 flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 shrink-0" />
                  <span>Tidak ditemukan keyword indikator pada HTML yang berhasil di-fetch.</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function WebDefacement() {
  const [endpoints, setEndpoints] = useState([]);
  const [newEndpoint, setNewEndpoint] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingEndpoints, setIsLoadingEndpoints] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [isSavingEndpoint, setIsSavingEndpoint] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const syncActive = true;
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const autoFetchTimerRef = useRef(null);
  const endpointsRef = useRef([]);

  const applyScanData = useCallback((endpoint, data) => ({
    ...endpoint,
    status: data.status || "review",
    lastScan: data.scannedAt,
    scanResults: data.results || [],
    totalResults: data.totalMatches || 0,
    httpStatus: data.httpStatus,
    pageTitle: data.pageTitle,
    metaDescription: data.metaDescription,
    finalUrl: data.finalUrl,
    htmlSize: data.htmlSize,
    responseTimeMs: data.responseTimeMs,
    scannedPagesCount: data.scannedPagesCount,
    failedPagesCount: data.failedPagesCount,
    scannedPages: data.scannedPages || [],
    crawlLimit: data.crawlLimit,
    error: data.error,
  }), []);

  const fetchHtmlForEndpoint = useCallback(async (endpoint) => {
    try {
      const data = await scanWebDefacementEndpoint(endpoint.url, "all");
      return applyScanData(endpoint, data);
    } catch (error) {
      return {
        ...endpoint,
        status: "review",
        error: error instanceof Error ? error.message : "Gagal melakukan HTML fetch",
        lastScan: new Date().toISOString(),
      };
    }
  }, [applyScanData]);

  const showFeedback = useCallback((type, message) => {
    setFeedback({ type, message });
  }, []);

  const scanEndpointList = useCallback(async (endpointList) => {
    if (!endpointList.length) return;

    setIsScanning(true);
    setScanningId(null);

    try {
      const updatedEndpoints = await Promise.all(
        endpointList.map((endpoint) => fetchHtmlForEndpoint(endpoint))
      );
      const updatedMap = new Map(updatedEndpoints.map((endpoint) => [endpoint.id, endpoint]));
      setEndpoints((current) =>
        current.map((endpoint) => updatedMap.get(endpoint.id) || endpoint)
      );
    } finally {
      setIsScanning(false);
    }
  }, [fetchHtmlForEndpoint]);

  const scanEndpointItem = useCallback(async (endpoint) => {
    if (!endpoint) return;

    setScanningId(endpoint.id);
    try {
      const updated = await fetchHtmlForEndpoint(endpoint);
      setEndpoints((current) =>
        current.map((item) => (item.id === endpoint.id ? updated : item))
      );
    } finally {
      setScanningId(null);
    }
  }, [fetchHtmlForEndpoint]);

  const scheduleAutoFetch = useCallback((task) => {
    if (autoFetchTimerRef.current) {
      clearTimeout(autoFetchTimerRef.current);
    }

    autoFetchTimerRef.current = setTimeout(() => {
      autoFetchTimerRef.current = null;

      if (task?.mode === "one") {
        scanEndpointItem(task.endpoint);
        return;
      }

      scanEndpointList(task?.endpoints || []);
    }, 0);
  }, [scanEndpointItem, scanEndpointList]);

  const handleScanAll = useCallback(async () => {
    await scanEndpointList(endpoints);
  }, [endpoints, scanEndpointList]);

  const handleScanOne = useCallback(async (id) => {
    const target = endpoints.find((endpoint) => endpoint.id === id);
    if (!target) return;

    await scanEndpointItem(target);
  }, [endpoints, scanEndpointItem]);

  const handleAddEndpoint = useCallback(async () => {
    if (isLoadingEndpoints) {
      showFeedback("error", "Tunggu sampai daftar endpoint selesai dimuat");
      return;
    }

    const cleanUrl = normalizeEndpoint(newEndpoint);
    if (!cleanUrl) {
      showFeedback("error", "Endpoint URL tidak boleh kosong");
      return;
    }

    if (endpoints.some((endpoint) => normalizeEndpoint(endpoint.url) === cleanUrl)) {
      showFeedback("error", "Endpoint URL sudah ada di daftar");
      return;
    }

    setIsSavingEndpoint(true);
    try {
      const response = await createWebDefacementEndpoint(cleanUrl);
      setEndpoints((current) => [...current, response.endpoint]);
      scheduleAutoFetch({ mode: "one", endpoint: response.endpoint });
      setNewEndpoint("");
      showFeedback(
        "success",
        `Endpoint ${response.endpoint.url} berhasil ditambahkan dan sedang auto-fetch`
      );
    } catch (error) {
      showFeedback(
        "error",
        error.response?.data?.message || error.message || "Gagal menambahkan endpoint"
      );
    } finally {
      setIsSavingEndpoint(false);
    }
  }, [endpoints, isLoadingEndpoints, newEndpoint, scheduleAutoFetch, showFeedback]);

  const handleDeleteEndpoint = useCallback(async (id) => {
    setDeletingId(id);
    try {
      const response = await removeWebDefacementEndpoint(id);
      const remainingEndpoints = endpoints.filter((endpoint) => endpoint.id !== id);

      setEndpoints(remainingEndpoints);
      scheduleAutoFetch({ mode: "all", endpoints: remainingEndpoints });
      setSelectedEndpoint((current) => (current?.id === id ? null : current));
      showFeedback(
        "success",
        `Endpoint ${response.endpoint.url} berhasil dihapus dan daftar diperbarui`
      );
    } catch (error) {
      showFeedback(
        "error",
        error.response?.data?.message || error.message || "Gagal menghapus endpoint"
      );
    } finally {
      setDeletingId(null);
    }
  }, [endpoints, scheduleAutoFetch, showFeedback]);

  const loadStoredEndpoints = useCallback(async () => {
    setIsLoadingEndpoints(true);
    try {
      const response = await fetchWebDefacementEndpoints();
      const storedEndpoints = response.endpoints || [];

      setEndpoints(storedEndpoints);
      scheduleAutoFetch({ mode: "all", endpoints: storedEndpoints });
    } catch (error) {
      showFeedback(
        "error",
        error.response?.data?.message || error.message || "Gagal memuat endpoint"
      );
    } finally {
      setIsLoadingEndpoints(false);
      setIsScanning(false);
    }
  }, [scheduleAutoFetch, showFeedback]);

  useEffect(() => {
    loadStoredEndpoints();
  }, [loadStoredEndpoints]);

  useEffect(() => {
    endpointsRef.current = endpoints;
  }, [endpoints]);

  useEffect(() => {
    if (!syncActive) return undefined;

    const interval = setInterval(() => {
      if (endpointsRef.current.length > 0) {
        scanEndpointList(endpointsRef.current);
      }
    }, 300000);

    return () => clearInterval(interval);
  }, [scanEndpointList, syncActive]);

  useEffect(() => {
    return () => {
      if (autoFetchTimerRef.current) {
        clearTimeout(autoFetchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!feedback.message) return undefined;

    const timer = setTimeout(() => {
      setFeedback({ type: "", message: "" });
    }, 4000);

    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    setSelectedEndpoint((current) => {
      if (!current) return null;
      return endpoints.find((endpoint) => endpoint.id === current.id) || null;
    });
  }, [endpoints]);

  const filteredEndpoints = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return endpoints;

    return endpoints.filter((endpoint) => {
      const haystacks = [
        endpoint.id,
        endpoint.url,
        endpoint.pageTitle,
        endpoint.metaDescription,
        endpoint.finalUrl,
      ];

      return haystacks.some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [endpoints, searchQuery]);

  const analytics = useMemo(() => {
    const statusCounts = {
      safe: 0,
      review: 0,
      detected: 0,
      error: 0,
      unfetched: 0,
    };
    const keywordMap = new Map();
    const prioritized = [];
    let keywordMatches = 0;
    let totalPages = 0;
    let totalResponseMs = 0;
    let responseSamples = 0;
    let totalHtmlSize = 0;
    let htmlSamples = 0;
    let redirectedCount = 0;
    let latestScanAt = "";

    endpoints.forEach((endpoint) => {
      const statusKey = getEndpointStatusKey(endpoint);
      statusCounts[statusKey] += 1;

      if (statusKey === "unfetched") return;

      const totalMatches = Number(endpoint.totalResults || 0);
      const pagesCount = Number(endpoint.scannedPagesCount || endpoint.scannedPages?.length || 0);
      const failedPagesCount = Number(endpoint.failedPagesCount || 0);
      const responseTimeMs = Number(endpoint.responseTimeMs || 0);
      const htmlSize = Number(endpoint.htmlSize || 0);

      keywordMatches += totalMatches;
      totalPages += pagesCount;

      if (responseTimeMs > 0) {
        totalResponseMs += responseTimeMs;
        responseSamples += 1;
      }

      if (htmlSize > 0) {
        totalHtmlSize += htmlSize;
        htmlSamples += 1;
      }

      if (
        endpoint.finalUrl &&
        normalizeEndpoint(endpoint.finalUrl) !== normalizeEndpoint(endpoint.url)
      ) {
        redirectedCount += 1;
      }

      if (endpoint.lastScan && (!latestScanAt || new Date(endpoint.lastScan) > new Date(latestScanAt))) {
        latestScanAt = endpoint.lastScan;
      }

      (endpoint.scanResults || []).forEach((result) => {
        const keyword = String(result.keyword || "").trim();
        if (!keyword) return;

        const current = keywordMap.get(keyword) || { count: 0, endpoints: new Set() };
        current.count += Number(result.count || 0);
        current.endpoints.add(endpoint.id);
        keywordMap.set(keyword, current);
      });

      const riskBase = {
        safe: 12,
        review: 40,
        detected: 62,
        error: 54,
      }[statusKey] || 0;

      const riskScore = Math.min(
        100,
        riskBase +
          Math.min(totalMatches * 8, 24) +
          Math.min(failedPagesCount * 10, 16) +
          (responseTimeMs >= 3000 ? 10 : responseTimeMs >= 1500 ? 6 : 0)
      );

      prioritized.push({
        id: endpoint.id,
        url: endpoint.url,
        statusKey,
        matches: totalMatches,
        pages: pagesCount,
        responseTimeMs,
        lastScan: endpoint.lastScan,
        riskScore,
      });
    });

    const total = endpoints.length;
    const scannedCount = total - statusCounts.unfetched;
    const safe = statusCounts.safe;
    const review = statusCounts.review;
    const detected = statusCounts.detected;
    const errorCount = statusCounts.error;
    const coverage = total ? (scannedCount / total) * 100 : 0;
    const safeRate = scannedCount ? (safe / scannedCount) * 100 : 0;

    return {
      total,
      scannedCount,
      safe,
      review,
      detected,
      errorCount,
      coverage,
      safeRate,
      keywordMatches,
      totalPages,
      redirectedCount,
      latestScanAt,
      avgResponseMs: responseSamples ? Math.round(totalResponseMs / responseSamples) : 0,
      avgHtmlSize: htmlSamples ? Math.round(totalHtmlSize / htmlSamples) : 0,
      topKeywords: Array.from(keywordMap.entries())
        .map(([keyword, info]) => ({
          key: keyword,
          label: keyword,
          value: info.count,
          color: STATUS_META.detected.color,
          meta: `Muncul di ${formatNumber(info.endpoints.size)} endpoint`,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map((item, index) => ({
          ...item,
          color: ["#f87171", "#fb7185", "#f59e0b", "#38bdf8", "#34d399"][index % 5],
        })),
      priorityEndpoints: prioritized
        .sort((a, b) => b.riskScore - a.riskScore || b.matches - a.matches)
        .slice(0, 5),
      totalFindings: detected + review + errorCount,
    };
  }, [endpoints]);

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200">
      <Navbar />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg md:p-6">
          <div className="pointer-events-none absolute" />
          <div className="relative grid gap-4 xl:grid-cols-1">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold text-white md:text-xl">
                <Shield className="h-5 w-5 text-red-400" />
                Web Defacement
              </h1>
              <p className="mt-1 text-xs md:text-sm text-slate-400">
                Monitoring endpoint berbasis direct HTML fetching untuk mendeteksi indikasi defacement, keyword berbahaya, dan pola spam yang perlu ditinjau lebih cepat.
              </p>
            </div>
          </div>
        </div>

        <StatsCards analytics={analytics} />

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <BarChart3 className="h-4 w-4 text-red-400" />
              Keyword Hotspot
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Agregasi keyword paling sering muncul dari semua endpoint yang sudah dipindai.
            </p>

            <div className="mt-4">
              <InsightBars
                items={analytics.topKeywords}
                emptyLabel="Belum ada keyword yang terdeteksi. Jalankan fetch untuk mulai membangun hotspot keyword."
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Activity className="h-4 w-4 text-amber-400" />
              Prioritas Tinjau
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Endpoint yang paling layak dicek dulu berdasarkan status, jumlah match, dan kualitas fetch.
            </p>

            <div className="mt-4">
              <PriorityEndpointList items={analytics.priorityEndpoints} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Kelola Endpoint Monitoring</h2>
              <p className="mt-1 text-xs text-slate-500">
                Tambah endpoint baru, cari target spesifik, lalu lakukan fetch manual saat dibutuhkan.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1">
                {analytics.latestScanAt ? `Scan terakhir ${formatDate(analytics.latestScanAt)}` : "Belum ada fetch"}
              </span>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row">
              <div className="flex flex-1 gap-2">
                <input
                  type="text"
                  placeholder="Tambah endpoint baru, contoh: jurnal.undip.ac.id"
                  value={newEndpoint}
                  onChange={(event) => setNewEndpoint(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleAddEndpoint()}
                  disabled={isLoadingEndpoints || isSavingEndpoint}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  onClick={handleAddEndpoint}
                  disabled={isLoadingEndpoints || isSavingEndpoint}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {isSavingEndpoint ? "Menyimpan..." : "Tambah"}
                </button>
              </div>

              <div className="relative w-full xl:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari endpoint atau title..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  disabled={isLoadingEndpoints}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-9 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <button
              onClick={handleScanAll}
              disabled={isLoadingEndpoints || isScanning}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileSearch className={`h-4 w-4 ${isScanning ? "animate-pulse" : ""}`} />
              {isScanning ? "Fetching HTML..." : "Fetch Semua HTML"}
            </button>
          </div>

          {feedback.message && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                feedback.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/30 bg-red-500/10 text-red-300"
              }`}
            >
              {feedback.message}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-[1020px] w-full text-left">
              <thead className="bg-slate-800/80">
                <tr>
                  {["ID Log", "URL Endpoint", "Hasil HTML Fetch", "Title / Metadata", "Aksi"].map(
                    (header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                      >
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoadingEndpoints ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                      Memuat endpoint dari database...
                    </td>
                  </tr>
                ) : (
                  filteredEndpoints.map((endpoint, index) => {
                    const badge = buildStatusBadge(endpoint);
                    const hasDetail = hasFetchedSnapshot(endpoint);
                    const statusKey = getEndpointStatusKey(endpoint);
                    const statusMeta = STATUS_META[statusKey];

                    return (
                      <tr
                        key={endpoint.id}
                        className={`align-top border-t border-slate-800 transition-colors hover:bg-slate-800/30 ${
                          index % 2 ? "bg-slate-900/40" : "bg-slate-900/10"
                        }`}
                      >
                        <td title={endpoint.id} className="px-4 py-4 text-sm text-slate-500">
                          <div className="flex items-start gap-3">
                            <span
                              className="mt-0.5 h-8 w-1 rounded-full"
                              style={{ backgroundColor: statusMeta.color }}
                            />
                            <span>#{String(index + 1).padStart(2, "0")}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <a
                            href={toHref(endpoint.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-md break-all text-sm text-sky-400 hover:underline"
                          >
                            <Globe className="mr-1 mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{endpoint.url}</span>
                            <ExternalLink className="ml-1 mt-0.5 h-3 w-3 shrink-0" />
                          </a>
                          {endpoint.finalUrl && endpoint.finalUrl !== toHref(endpoint.url) && (
                            <div className="mt-2 break-all text-xs text-slate-500">
                              Final: {endpoint.finalUrl}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="max-w-sm space-y-2">
                            <div
                              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold ${badge.className}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                              {badge.label}
                            </div>
                            {typeof endpoint.totalResults === "number" && endpoint.totalResults > 0 && (
                              <div className="text-xs text-slate-500">
                                {endpoint.totalResults} keyword match
                              </div>
                            )}
                            {endpoint.scannedPagesCount ? (
                              <div className="text-xs text-slate-500">
                                {endpoint.scannedPagesCount} halaman dipindai
                                {endpoint.failedPagesCount ? `, ${endpoint.failedPagesCount} gagal` : ""}
                              </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                              {endpoint.httpStatus ? <span>HTTP {endpoint.httpStatus}</span> : null}
                              {endpoint.responseTimeMs ? <span>{endpoint.responseTimeMs} ms</span> : null}
                              {endpoint.htmlSize ? <span>{formatBytes(endpoint.htmlSize)}</span> : null}
                            </div>
                            {endpoint.error && (
                              <div className="max-w-md break-all text-xs text-red-400">{endpoint.error}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="max-w-md">
                            <div className="break-words text-sm font-medium text-slate-100">
                              {endpoint.pageTitle || "Belum difetch"}
                            </div>
                            <div className="mt-2 line-clamp-2 break-words text-xs leading-5 text-slate-500">
                              {endpoint.metaDescription || ""}
                            </div>
                            {endpoint.lastScan && (
                              <div className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                                <Clock className="h-3 w-3" />
                                {formatDate(endpoint.lastScan)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleScanOne(endpoint.id)}
                              disabled={
                                isLoadingEndpoints ||
                                isScanning ||
                                scanningId === endpoint.id ||
                                deletingId === endpoint.id
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <FileSearch
                                className={`h-3.5 w-3.5 ${
                                  scanningId === endpoint.id ? "animate-pulse" : ""
                                }`}
                              />
                              Fetch
                            </button>
                            {hasDetail ? (
                              <button
                                onClick={() => setSelectedEndpoint(endpoint)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Detail
                              </button>
                            ) : null}
                            <button
                              onClick={() => handleDeleteEndpoint(endpoint.id)}
                              disabled={deletingId === endpoint.id}
                              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!isLoadingEndpoints && filteredEndpoints.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-500">
              Belum ada endpoint yang cocok dengan filter saat ini.
            </div>
          )}
        </div>
      </div>

      <EndpointDetailModal
        endpoint={selectedEndpoint}
        onClose={() => setSelectedEndpoint(null)}
      />
    </div>
  );
}
