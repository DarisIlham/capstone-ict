import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function buildStatusBadge(endpoint) {
  if (!hasFetchedSnapshot(endpoint)) {
    return {
      label: "BELUM FETCH",
      className: "bg-slate-800 text-slate-300 border border-slate-700",
      dot: "bg-slate-400",
    };
  }

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
  const safe = endpoints.filter(
    (item) => hasFetchedSnapshot(item) && item.status === "safe" && !item.error
  ).length;
  const review = endpoints.filter(
    (item) => hasFetchedSnapshot(item) && (item.status === "review" || item.error)
  ).length;
  const detected = endpoints.filter(
    (item) => hasFetchedSnapshot(item) && item.status === "detected"
  ).length;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="text-xs font-semibold uppercase text-slate-500">Total Endpoint</div>
        <div className="mt-2 text-2xl font-black text-white md:text-3xl">{total}</div>
      </div>
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="text-xs font-semibold uppercase text-emerald-400">Aman</div>
        <div className="mt-2 text-2xl font-black text-emerald-300 md:text-3xl">{safe}</div>
      </div>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="text-xs font-semibold uppercase text-amber-400">Perlu Tinjau</div>
        <div className="mt-2 text-2xl font-black text-amber-300 md:text-3xl">{review}</div>
      </div>
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <div className="text-xs font-semibold uppercase text-red-400">Terindikasi</div>
        <div className="mt-2 text-2xl font-black text-red-300 md:text-3xl">{detected}</div>
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
        className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            {headerIcon}
            <div>
              <div className="text-base font-bold text-white">Detail HTML Fetch</div>
              <div className="break-all text-sm text-slate-400">{endpoint.url}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-4">
              <div className="text-2xl font-black text-white">{endpoint.httpStatus || "-"}</div>
              <div className="mt-1 text-xs font-semibold uppercase text-slate-500">HTTP Status</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-4">
              <div className="text-2xl font-black text-white">{endpoint.responseTimeMs || "-"}</div>
              <div className="mt-1 text-xs font-semibold uppercase text-slate-500">Response ms</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-4">
              <div className="text-2xl font-black text-white">{formatBytes(endpoint.htmlSize)}</div>
              <div className="mt-1 text-xs font-semibold uppercase text-slate-500">Ukuran HTML</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-4">
              <div className="text-2xl font-black text-white">{endpoint.totalResults || 0}</div>
              <div className="mt-1 text-xs font-semibold uppercase text-slate-500">Keyword Match</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-4">
              <div className="text-2xl font-black text-white">{endpoint.scannedPagesCount || 0}</div>
              <div className="mt-1 text-xs font-semibold uppercase text-slate-500">Halaman Discan</div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-800/30 p-4">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Title</div>
              <div className="mt-1 break-words text-sm text-slate-200">{endpoint.pageTitle || "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Meta Description</div>
              <div className="mt-1 break-words text-sm text-slate-300">{endpoint.metaDescription || "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Final URL</div>
              <div className="mt-1 break-all text-sm text-slate-300">{endpoint.finalUrl || "-"}</div>
            </div>
          </div>

          {endpoint.error && (
            <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-4">
              <div className="text-sm font-semibold text-red-400">Fetch error</div>
              <div className="mt-1 break-all text-sm text-red-300">{endpoint.error}</div>
            </div>
          )}

          {endpoint.scannedPages?.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-200">Halaman yang ikut dipindai</div>
                <div className="text-xs text-slate-500">
                  {endpoint.scannedPagesCount || endpoint.scannedPages.length} halaman
                  {endpoint.crawlLimit ? `, limit ${endpoint.crawlLimit}` : ""}
                </div>
              </div>
              <div className="max-h-60 space-y-2 overflow-auto">
                {endpoint.scannedPages.map((page, index) => (
                  <div
                    key={`${page.url}-${index}`}
                    className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="break-all text-sm text-slate-200">{page.url}</div>
                      <div className="mt-1 text-xs text-slate-500">{page.pageTitle || "-"}</div>
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
                <div
                  key={`${result.keyword}-${index}`}
                  className="rounded-lg border border-red-900/30 bg-red-950/20 p-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="font-mono text-sm font-bold text-red-400">"{result.keyword}"</div>
                    <div className="inline-flex w-fit rounded-full bg-red-900/40 px-3 py-1 text-xs font-semibold text-red-300">
                      {result.count}x ditemukan
                    </div>
                  </div>
                  {result.context?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs font-semibold uppercase text-slate-500">Konteks HTML/Text</div>
                      {result.context.map((contextItem, contextIndex) => (
                        <div
                          key={`${result.keyword}-${contextIndex}`}
                          className="break-all rounded-lg border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs text-slate-300"
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
  const [endpoints, setEndpoints] = useState([]);
  const [newEndpoint, setNewEndpoint] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingEndpoints, setIsLoadingEndpoints] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [isSavingEndpoint, setIsSavingEndpoint] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [syncActive, setSyncActive] = useState(true);
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

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200">
      <Navbar />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold text-white md:text-xl">
                <Shield className="h-5 w-5 text-red-400" />
                Web Defacement
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Monitoring endpoint berbasis direct HTML fetching untuk indikator defacement dan judol.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
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
              <span
                className={`inline-flex items-center gap-2 text-sm ${
                  syncActive ? "text-sky-400" : "text-slate-500"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    syncActive ? "bg-sky-400 animate-pulse" : "bg-slate-500"
                  }`}
                />
                {syncActive ? "MONITORING AKTIF" : "MONITORING NONAKTIF"}
              </span>
              <button
                onClick={() => setSyncActive((current) => !current)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 ${syncActive ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        <StatsCards endpoints={endpoints} />

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
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

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full whitespace-nowrap text-left">
              <thead className="bg-slate-800/70">
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
                    const hasDetail = endpoint.scanResults || endpoint.pageTitle || endpoint.error;

                    return (
                      <tr
                        key={endpoint.id}
                        className={`align-top border-t border-slate-800 hover:bg-slate-800/30 ${
                          index % 2 ? "bg-slate-900/40" : ""
                        }`}
                      >
                        <td
                          title={endpoint.id}
                          className="px-4 py-4 text-sm text-slate-500"
                        >
                          #{String(index + 1).padStart(2, "0")}
                        </td>
                        <td className="px-4 py-4">
                          <a
                            href={toHref(endpoint.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex break-all text-sm text-sky-400 hover:underline"
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
                          <div className="space-y-2">
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
                            <div className="break-words text-sm text-slate-100">
                              {endpoint.pageTitle || "Belum difetch"}
                            </div>
                            <div className="mt-2 break-words text-xs text-slate-500">
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
