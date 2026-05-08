import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
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
import { defaultWebDefacementEndpoints } from "../data/webDefacementDefaults";
import { scanWebDefacementEndpoint } from "../services/webDefacementApi";

function normalizeEndpoint(url = "") {
  const trimmed = String(url).trim();
  if (!trimmed) return "";
  return trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
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

function summarizeMatches(page) {
  return Number(page?.matches || 0);
}

function buildStatusBadge(endpoint) {
  if (endpoint.error) {
    return {
      label: "FETCH ERROR",
      className: "bg-red-950/50 text-red-400 border border-red-900/50",
      dot: "bg-red-400",
    };
  }

  if (endpoint.status === "safe") {
    return {
      label: "HTML AMAN",
      className: "bg-emerald-950/50 text-emerald-400 border border-emerald-900/50",
      dot: "bg-emerald-400",
    };
  }

  if (endpoint.status === "detected") {
    return {
      label: "TERINDIKASI",
      className: "bg-red-950/50 text-red-400 border border-red-900/50",
      dot: "bg-red-400",
    };
  }

  return {
    label: "PERLU TINJAU",
    className: "bg-amber-950/50 text-amber-400 border border-amber-900/50",
    dot: "bg-amber-400",
  };
}

const StatsCards = ({ endpoints }) => {
  const total = endpoints.length;
  const safe = endpoints.filter((item) => item.status === "safe" && !item.error).length;
  const review = endpoints.filter((item) => item.status === "review" || item.error).length;
  const detected = endpoints.filter((item) => item.status === "detected").length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-500 uppercase font-semibold">Total Endpoint</div>
        <div className="text-2xl md:text-3xl font-black text-white mt-2">{total}</div>
      </div>
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
        <div className="text-xs text-emerald-400 uppercase font-semibold">Aman</div>
        <div className="text-2xl md:text-3xl font-black text-emerald-300 mt-2">{safe}</div>
      </div>
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
        <div className="text-xs text-amber-400 uppercase font-semibold">Perlu Tinjau</div>
        <div className="text-2xl md:text-3xl font-black text-amber-300 mt-2">{review}</div>
      </div>
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <div className="text-xs text-red-400 uppercase font-semibold">Terindikasi</div>
        <div className="text-2xl md:text-3xl font-black text-red-300 mt-2">{detected}</div>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[88vh] overflow-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            {headerIcon}
            <div>
              <div className="text-base font-bold text-white">Detail HTML Fetch</div>
              <div className="text-sm text-slate-400 break-all">{endpoint.url}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
              <div className="text-2xl font-black text-white">{endpoint.httpStatus || "-"}</div>
              <div className="text-xs text-slate-500 uppercase font-semibold mt-1">HTTP Status</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
              <div className="text-2xl font-black text-white">{endpoint.responseTimeMs || "-"}</div>
              <div className="text-xs text-slate-500 uppercase font-semibold mt-1">Response ms</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
              <div className="text-2xl font-black text-white">{formatBytes(endpoint.htmlSize)}</div>
              <div className="text-xs text-slate-500 uppercase font-semibold mt-1">Ukuran HTML</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
              <div className="text-2xl font-black text-white">{endpoint.totalResults || 0}</div>
              <div className="text-xs text-slate-500 uppercase font-semibold mt-1">Keyword Match</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
              <div className="text-2xl font-black text-white">{endpoint.scannedPagesCount || 0}</div>
              <div className="text-xs text-slate-500 uppercase font-semibold mt-1">Halaman Discan</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-4 space-y-3">
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500">Title</div>
              <div className="text-sm text-slate-200 mt-1 break-words">{endpoint.pageTitle || "-"}</div>
            </div>
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500">Meta Description</div>
              <div className="text-sm text-slate-300 mt-1 break-words">{endpoint.metaDescription || "-"}</div>
            </div>
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500">Final URL</div>
              <div className="text-sm text-slate-300 mt-1 break-all">{endpoint.finalUrl || "-"}</div>
            </div>
          </div>

          {endpoint.error && (
            <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-4">
              <div className="text-sm font-semibold text-red-400">Fetch error</div>
              <div className="mt-1 text-sm text-red-300 break-all">{endpoint.error}</div>
            </div>
          )}

          {endpoint.scannedPages?.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-semibold text-slate-200">Halaman yang ikut dipindai</div>
                <div className="text-xs text-slate-500">
                  {endpoint.scannedPagesCount || endpoint.scannedPages.length} halaman
                  {endpoint.crawlLimit ? `, limit ${endpoint.crawlLimit}` : ""}
                </div>
              </div>
              <div className="space-y-2 max-h-60 overflow-auto">
                {endpoint.scannedPages.map((page, index) => (
                  <div
                    key={`${page.url}-${index}`}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-slate-200 break-all">{page.url}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {page.pageTitle || "-"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>HTTP {page.httpStatus || "-"}</span>
                      <span>{summarizeMatches(page)} match</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endpoint.scanResults?.length > 0 ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-200">Keyword terdeteksi dari HTML</div>
              {endpoint.scanResults.map((result, index) => (
                <div key={`${result.keyword}-${index}`} className="rounded-lg border border-red-900/30 bg-red-950/20 p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="font-mono text-sm font-bold text-red-400">"{result.keyword}"</div>
                    <div className="inline-flex w-fit rounded-full bg-red-900/40 px-3 py-1 text-xs font-semibold text-red-300">
                      {result.count}x ditemukan
                    </div>
                  </div>
                  {result.context?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs uppercase font-semibold text-slate-500">Konteks HTML/Text</div>
                      {result.context.map((contextItem, contextIndex) => (
                        <div
                          key={`${result.keyword}-${contextIndex}`}
                          className="rounded-lg bg-slate-950/70 p-3 font-mono text-xs text-slate-300 break-all border border-slate-800"
                        >
                          {contextItem}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : !endpoint.error ? (
            <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/20 p-4 text-sm text-emerald-300">
              Tidak ditemukan keyword indikator pada HTML yang berhasil di-fetch.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default function WebDefacement() {
  const [endpoints, setEndpoints] = useState(defaultWebDefacementEndpoints);
  const [newEndpoint, setNewEndpoint] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [syncActive, setSyncActive] = useState(true);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);

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

  const handleScanAll = useCallback(async () => {
    setIsScanning(true);
    setScanningId(null);

    try {
      const updatedEndpoints = await Promise.all(
        endpoints.map((endpoint) => fetchHtmlForEndpoint(endpoint))
      );
      setEndpoints(updatedEndpoints);
    } finally {
      setIsScanning(false);
    }
  }, [endpoints, fetchHtmlForEndpoint]);

  const handleScanOne = useCallback(async (id) => {
    const target = endpoints.find((endpoint) => endpoint.id === id);
    if (!target) return;

    setScanningId(id);
    const updated = await fetchHtmlForEndpoint(target);
    setEndpoints((current) =>
      current.map((endpoint) => (endpoint.id === id ? updated : endpoint))
    );
    setScanningId(null);
  }, [endpoints, fetchHtmlForEndpoint]);

  const handleAddEndpoint = () => {
    const cleanUrl = normalizeEndpoint(newEndpoint);
    if (!cleanUrl) return;
    if (endpoints.some((endpoint) => endpoint.url === cleanUrl)) return;

    setEndpoints((current) => [
      ...current,
      {
        id: `#${String(current.length + 1).padStart(2, "0")}`,
        url: cleanUrl,
        status: "review",
      },
    ]);
    setNewEndpoint("");
  };

  const handleDeleteEndpoint = (id) => {
    setEndpoints((current) => current.filter((endpoint) => endpoint.id !== id));
    setSelectedEndpoint((current) => (current?.id === id ? null : current));
  };

  useEffect(() => {
    Promise.all(defaultWebDefacementEndpoints.map((endpoint) => fetchHtmlForEndpoint(endpoint)))
      .then((updatedEndpoints) => {
        setEndpoints(updatedEndpoints);
      })
      .catch(() => {
        // Halaman tetap usable walau initial scan gagal.
      });
  }, [fetchHtmlForEndpoint]);

  useEffect(() => {
    if (!syncActive) return undefined;

    const interval = setInterval(() => {
      handleScanAll();
    }, 300000);

    return () => clearInterval(interval);
  }, [handleScanAll, syncActive]);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-4 md:p-6 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-400" />
                Web Defacement
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Monitoring endpoint berbasis direct HTML fetching untuk indikator defacement dan judol.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-[11px] text-slate-300">
                  Direct HTML Fetch
                </span>
                <span className="rounded-full border border-red-900/50 bg-red-950/30 px-3 py-1 text-[11px] text-red-300">
                  Defacement Keywords
                </span>
                <span className="rounded-full border border-amber-900/50 bg-amber-950/30 px-3 py-1 text-[11px] text-amber-300">
                  Judol/SEO Spam
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start md:self-center">
              <span className={`inline-flex items-center gap-2 text-sm ${syncActive ? "text-sky-400" : "text-slate-500"}`}>
                <span className={`h-2 w-2 rounded-full ${syncActive ? "bg-sky-400 animate-pulse" : "bg-slate-500"}`} />
                {syncActive ? "MONITORING AKTIF" : "MONITORING NONAKTIF"}
              </span>
              <button
                onClick={() => setSyncActive((current) => !current)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${syncActive ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        <StatsCards endpoints={endpoints} />

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4">
            <div className="flex-1 flex flex-col md:flex-row gap-3">
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  placeholder="Tambah endpoint baru, contoh: jurnal.undip.ac.id"
                  value={newEndpoint}
                  onChange={(event) => setNewEndpoint(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleAddEndpoint()}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                />
                <button
                  onClick={handleAddEndpoint}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Tambah
                </button>
              </div>

              <div className="xl:max-w-sm w-full relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari endpoint atau title..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleScanAll}
              disabled={isScanning}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60 transition-colors"
            >
              <FileSearch className={`h-4 w-4 ${isScanning ? "animate-pulse" : ""}`} />
              {isScanning ? "Fetching HTML..." : "Fetch Semua HTML"}
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-800/70">
                <tr>
                  {["ID Log", "URL Endpoint", "Hasil HTML Fetch", "Title / Metadata", "Aksi"].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEndpoints.map((endpoint, index) => {
                  const badge = buildStatusBadge(endpoint);
                  const hasDetail = endpoint.scanResults || endpoint.pageTitle || endpoint.error;

                  return (
                    <tr
                      key={endpoint.id}
                      className={`border-t border-slate-800 align-top hover:bg-slate-800/30 ${index % 2 ? "bg-slate-900/40" : ""}`}
                    >
                      <td className="px-4 py-4 text-sm text-slate-500">{endpoint.id}</td>
                      <td className="px-4 py-4">
                        <a
                          href={toHref(endpoint.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-sky-400 hover:underline break-all"
                        >
                          <Globe className="h-3.5 w-3.5 shrink-0" />
                          {endpoint.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                        {endpoint.finalUrl && endpoint.finalUrl !== toHref(endpoint.url) && (
                          <div className="mt-2 text-xs text-slate-500 break-all">
                            Final: {endpoint.finalUrl}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <div className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold ${badge.className}`}>
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
                            <div className="max-w-md text-xs text-red-400 break-all">{endpoint.error}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="max-w-md">
                          <div className="text-sm text-slate-100 break-words">
                            {endpoint.pageTitle || "Belum difetch"}
                          </div>
                          <div className="mt-2 text-xs text-slate-500 break-words">
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
                            disabled={isScanning || scanningId === endpoint.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-60 transition-colors"
                          >
                            <FileSearch className={`h-3.5 w-3.5 ${scanningId === endpoint.id ? "animate-pulse" : ""}`} />
                            Fetch
                          </button>
                          {hasDetail ? (
                            <button
                              onClick={() => setSelectedEndpoint(endpoint)}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Detail
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleDeleteEndpoint(endpoint.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredEndpoints.length === 0 && (
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
