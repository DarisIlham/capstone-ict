import React, { useEffect, useMemo, useState } from 'react';
import Navbar from '../components/Navbar';
import { BrainCircuit, RefreshCw } from 'lucide-react';
import mlApi from '../services/mlApi';

import WaveChart from '../components/MlDashboard/WaveChart';
import RangeFilter from '../components/MlDashboard/RangeFilter';
import TopSourceIpsCard from '../components/MlDashboard/TopSourceIpsCard';
import { Donut, Legend } from '../components/MlDashboard/Donut';
import { ConfidenceBadge, PredictionBadge } from '../components/MlDashboard/Badges';

import {
  PAGE_SIZE_OPTIONS,
  PREDICTIONS_FETCH_BATCH_SIZE,
  MAX_PREDICTIONS_RESULT_WINDOW,
  DEFAULT_TIME_RANGE,
  RANGE_TO_MINUTES,
  COLORS,
  getRangeWindow,
  buildStatsFromPredictions,
  buildTimelineFromPredictions,
  formatTime,
  formatConfidenceValue,
  getConfidenceMeaning,
  formatLiveTimestamp,
  formatTimelineBucketLabel,
  getTimelineRangeDescription,
  getTimestampMs,
  createTimelineBucketPoint,
  getTimelineBucketMs,
} from '../components/MlDashboard/utils';


const StatCard = ({ label, value, unit = '', className = '', valueClassName = 'text-sky-400' }) => (
  <div className={`border rounded p-2 md:p-3 ${className}`}>
    <div className="text-[10px] text-slate-500 uppercase font-semibold">{label}</div>
    <div className={`text-lg md:text-2xl font-black mt-0.5 md:mt-1 ${valueClassName}`}>{value}</div>
    {unit && <div className="text-xs text-slate-500 mt-1">{unit}</div>}
  </div>
);

export default function MlDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingMockData, setUsingMockData] = useState(false);
  const [dataNotice, setDataNotice] = useState('');

  const [predictions, setPredictions] = useState([]);
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [totalPredictionsCount, setTotalPredictionsCount] = useState(0);

  const [filters, setFilters] = useState({ label: '', sourceIp: '', destinationIp: '', service: '' });
  const [timeRange, setTimeRange] = useState(DEFAULT_TIME_RANGE);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(null);
  const predictionsTableRef = React.useRef(null);
  const scrollPredictionsTableIntoView = React.useCallback(() => {
    if (predictionsTableRef.current?.scrollIntoView) {
      try {
        predictionsTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        // Ignore browsers that reject smooth scrolling in this context.
      }
    }
  }, []);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setDataNotice('');
    try {
      const minutes = RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES['24h'];
      const { start, end } = getRangeWindow(timeRange);
      const [predictionsResult, timelineResult, statsResult] = await Promise.allSettled([
        mlApi.getPredictions({ start, end, page: 1, limit: PREDICTIONS_FETCH_BATCH_SIZE }),
        mlApi.getTimeline(minutes),
        mlApi.getStats({ start, end }),
      ]);

      const notices = [];
      let preds =
        predictionsResult.status === 'fulfilled' && Array.isArray(predictionsResult.value?.data)
          ? predictionsResult.value.data
          : [];
      let responseTotalPredictions =
        predictionsResult.status === 'fulfilled'
          ? Number(predictionsResult.value?.pagination?.total ?? preds.length)
          : 0;

      if (predictionsResult.status !== 'fulfilled') {
        notices.push('Predictions list gagal dimuat dari endpoint utama.');
      } else {
        const firstPagePagination = predictionsResult.value?.pagination || {};
        const totalPages = Math.max(
          Number(firstPagePagination.totalPages || Math.ceil(responseTotalPredictions / PREDICTIONS_FETCH_BATCH_SIZE) || 1),
          1,
        );
        const maxFetchablePages = Math.max(
          1,
          Math.floor(MAX_PREDICTIONS_RESULT_WINDOW / PREDICTIONS_FETCH_BATCH_SIZE),
        );
        const pagesToFetch = Math.min(totalPages, maxFetchablePages);

        if (responseTotalPredictions > MAX_PREDICTIONS_RESULT_WINDOW || totalPages > maxFetchablePages) {
          notices.push(
            `Tabel memuat maksimal ${MAX_PREDICTIONS_RESULT_WINDOW.toLocaleString('en-US')} prediksi terbaru untuk range ini karena batas pagination backend.`
          );
        }

        if (pagesToFetch > 1) {
          const remainingPageResults = await Promise.allSettled(
            Array.from({ length: pagesToFetch - 1 }, (_, index) =>
              mlApi.getPredictions({
                start,
                end,
                page: index + 2,
                limit: PREDICTIONS_FETCH_BATCH_SIZE,
              })
            )
          );

          const failedPages = [];
          for (let i = 0; i < remainingPageResults.length; i += 1) {
            const result = remainingPageResults[i];
            const pageNumber = i + 2;

            if (result.status === 'fulfilled' && Array.isArray(result.value?.data)) {
              preds = preds.concat(result.value.data);
            } else {
              failedPages.push(pageNumber);
            }
          }

          if (failedPages.length > 0) {
            notices.push(`Sebagian data predictions gagal dimuat pada page ${failedPages.join(', ')}.`);
          }
        }
      }

      const nextStats =
        statsResult.status === 'fulfilled' && statsResult.value?.data
          ? statsResult.value.data
          : buildStatsFromPredictions(preds);

      let nextTimeline = [];

      if (timelineResult.status === 'fulfilled' && Array.isArray(timelineResult.value?.data) && timelineResult.value.data.length) {
        nextTimeline = timelineResult.value.data;
      } else {
        nextTimeline = buildTimelineFromPredictions(preds, minutes);

        if (nextTimeline.length > 0) {
          if (timelineResult.status === 'fulfilled') {
            notices.push('Timeline dibentuk dari data prediksi real karena endpoint timeline tidak mengembalikan bucket.');
          } else {
            notices.push('Timeline dibentuk dari data prediksi real karena endpoint timeline gagal.');
          }
        } else if (timelineResult.status === 'fulfilled') {
          notices.push('Tidak ada data ML real pada range waktu yang dipilih.');
        }
      }

      if (predictionsResult.status === 'fulfilled' || timelineResult.status === 'fulfilled') {
        setPredictions(Array.isArray(preds) ? preds : []);
        setTotalPredictionsCount(
          Number(
            statsResult.status === 'fulfilled'
              ? statsResult.value?.data?.totalPredictions
              : responseTotalPredictions
          ) || preds.length
        );
        setStats(nextStats);
        setTimeline(nextTimeline);
        setUsingMockData(false);
        setLastUpdated(new Date().toISOString());
        if (!preds.length && !nextTimeline.length) {
          notices.push('Tidak ada data ML pada range yang dipilih.');
        }
        setDataNotice(notices.join(' '));
        return;
      }

      throw new Error('Real ML data is unavailable, using mock fallback.');
    } catch (err) {
      console.error('ML API error:', err);
      setUsingMockData(true);
      setError(null);
      setDataNotice('ML dashboard sementara memakai fallback mock karena data real tidak tersedia.');

      const genMockPredictions = (limit = 120) => {
        const labels = ['benign', 'malicious', 'suspicious'];
        const services = ['HTTP', 'HTTPS', 'DNS', 'SSH', 'FTP'];
        const ips = ['192.168.1.100', '192.168.1.101', '10.0.0.5', '172.16.0.1', '10.1.2.3'];
        const now = Date.now();
        const out = [];
        for (let i = 0; i < limit; i++) {
          out.push({
            id: `mock-${i}`,
            timestamp: new Date(now - i * 60000).toISOString(),
            predictedLabel: labels[i % labels.length],
            confidence: Number((0.6 + Math.random() * 0.4).toFixed(2)),
            sourceIp: ips[i % ips.length],
            destinationIp: ips[(i + 1) % ips.length],
            service: services[i % services.length],
            zeekUid: `uid-mock-${i}`,
          });
        }
        return out;
      };

      const genMockStats = () => ({
        totalPredictions: 1200,
        overallAvgConfidence: 0.78,
        labels: [
          { label: 'benign', count: 800, avgConfidence: 0.81 },
          { label: 'malicious', count: 300, avgConfidence: 0.74 },
          { label: 'suspicious', count: 100, avgConfidence: 0.65 },
        ]
      });

      const genMockTimeline = (minutes = 60) => {
        const data = [];
        const now = Date.now();
        const step = minutes <= 60 ? 5 * 60 * 1000 : 30 * 60 * 1000;
        const range = minutes * 60 * 1000;
        for (let t = now - range; t <= now; t += step) {
          const v = Math.max(0, Math.floor(Math.random() * 8 + (Math.floor(t / step) % 5)));
          data.push({ timestamp: new Date(t).toISOString(), total: v, labels: [{ label: 'benign', count: Math.floor(v * 0.6) }, { label: 'malicious', count: Math.ceil(v * 0.4) }] });
        }
        return data;
      };

      const mockPreds = genMockPredictions(200);
      setPredictions(mockPreds);
      setTotalPredictionsCount(mockPreds.length);
      setStats(genMockStats());
      setTimeline(genMockTimeline(RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES['24h']));
      setLastUpdated(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => loadAll(), 60_000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const uniqueOptions = useMemo(() => {
    const labels = new Set();
    const srcs = new Set();
    const dests = new Set();
    const services = new Set();
    for (const p of predictions) {
      if (p.predictedLabel) labels.add(p.predictedLabel);
      if (p.sourceIp) srcs.add(p.sourceIp);
      if (p.destinationIp) dests.add(p.destinationIp);
      if (p.service) services.add(p.service);
    }
    return {
      labels: Array.from(labels).sort(),
      srcs: Array.from(srcs).sort(),
      dests: Array.from(dests).sort(),
      services: Array.from(services).sort(),
    };
  }, [predictions]);

  const filtered = useMemo(() => {
    let result = predictions.filter((p) => {
      if (filters.label && String(p.predictedLabel) !== String(filters.label)) return false;
      if (filters.sourceIp && !String(p.sourceIp || '').includes(filters.sourceIp)) return false;
      if (filters.destinationIp && !String(p.destinationIp || '').includes(filters.destinationIp)) return false;
      if (filters.service && !String(p.service || '').includes(filters.service)) return false;
      return true;
    });

    // Apply timeline filter if selected
    if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
      const startMs = getTimestampMs(selectedTimelinePoint.start);
      const endMs = getTimestampMs(selectedTimelinePoint.end);
      result = result.filter((p) => {
        const pMs = getTimestampMs(p.timestamp);
        return Number.isFinite(pMs) && Number.isFinite(startMs) && Number.isFinite(endMs) && pMs >= startMs && pMs <= endMs;
      });
    }

    return result;
  }, [predictions, filters, selectedTimelinePoint]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const distribution = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.predictedLabel || 'unknown';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value], i) => ({ name, label: name, value, color: COLORS[i % COLORS.length] }));
  }, [filtered]);

  const topSourceIps = useMemo(() => {
    const map = new Map();
    for (const p of predictions) { // Use ALL predictions, not filtered
      const ip = p.sourceIp || 'unknown';
      const existing = map.get(ip) || { label: ip, count: 0, lastSeen: 0 };
      existing.count += 1;
      existing.lastSeen = Math.max(existing.lastSeen, getTimestampMs(p.timestamp) || 0);
      map.set(ip, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 source IPs
  }, [predictions]);

  const waveData = useMemo(() => {
    if (!timeline || timeline.length === 0) {
      return [];
    }
    const minutes = RANGE_TO_MINUTES[timeRange] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE];
    const bucketMs = getTimelineBucketMs(minutes);
    const map = new Map();
    for (const t of timeline) {
      if (!t) continue;
      const ts = getTimestampMs(t.timestamp || t.ts || t.start || t.time);
      if (!Number.isFinite(ts)) continue;
      const bucketStartMs = Math.floor(ts / bucketMs) * bucketMs;
      const count = Number(t.total ?? t.count ?? t.v ?? 0);
      map.set(bucketStartMs, (map.get(bucketStartMs) || 0) + (Number.isFinite(count) ? count : 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b).map(([bucketStartMs, count]) => createTimelineBucketPoint(bucketStartMs, count, bucketMs)).filter(Boolean);
  }, [timeline, timeRange]);

  const timelinePredictionsCount = useMemo(
    () => waveData.reduce((sum, point) => sum + (Number(point?.v) || 0), 0),
    [waveData]
  );

  const handleTimelinePointSelect = (pointData) => {
    if (selectedTimelinePoint?.key === pointData.key) {
      setSelectedTimelinePoint(null);
      setPage(1);
    } else {
      setSelectedTimelinePoint({
        key: pointData.key,
        time: pointData.time,
        start: pointData.start,
        end: pointData.end,
        bucketMs: pointData.bucketMs,
        t: pointData.t,
      });
      setPage(1);
    }

    scrollPredictionsTableIntoView();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-sky-400 gap-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400"></div>
        <div className="text-sm font-medium">Loading ML Dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Navbar />
        <div className="mt-20 bg-red-950/60 border border-red-800/60 rounded-xl px-6 py-4 text-red-300 text-sm max-w-md">
          ⚠ Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Navbar />

      <div className="p-2 md:p-4 flex flex-col gap-3 md:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl p-3 md:p-4 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <BrainCircuit className="h-5 md:h-6 w-5 md:w-6 text-violet-400" />
                ML Predictions Dashboard
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-1">
                Real-time machine learning traffic prediction and threat classification
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl p-2 md:p-4 shadow-lg flex flex-col gap-3 md:gap-4">
          <div className="flex items-center justify-between gap-1 md:gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadAll()}
                disabled={loading}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 transition-colors border border-slate-700 inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <span className="hidden sm:inline">Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            </div>
            <RangeFilter
              rangeKey={timeRange}
              onRangeChange={(nextRange) => {
                if (timeRange !== nextRange) {
                  setTimeRange(nextRange);
                  setPage(1);
                }
              }}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <StatCard label="Predictions" value={totalPredictionsCount || predictions.length} className="bg-slate-800/50 border-slate-700/60" valueClassName="text-sky-400" />
            <StatCard label="Filtered" value={filtered.length} className="bg-violet-500/10 border-violet-500/30" valueClassName="text-violet-300" />
            <StatCard label="Labels" value={uniqueOptions.labels.length} className="bg-emerald-500/10 border-emerald-500/30" valueClassName="text-emerald-300" />
            <StatCard label="Timeline Predictions" value={timelinePredictionsCount} className="bg-amber-500/10 border-amber-500/30" valueClassName="text-amber-300" />
          </div>
          {dataNotice && (
            <div className={`rounded-lg border px-3 md:px-4 py-3 text-xs md:text-sm ${usingMockData
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-sky-500/20 bg-sky-500/10 text-sky-100'
              }`}>
              {dataNotice}
            </div>
          )}

          {/* Timeline Wave Chart + Top Source IPs */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 items-stretch">
            <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-4 md:p-6 flex flex-col h-full overflow-visible">
              <div className="flex justify-between items-center mb-4 md:mb-6 gap-2">
                <div className="text-xs md:text-sm font-semibold text-slate-200">
                  ML Predictions Timeline
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">
                    Last {getTimelineRangeDescription(timeRange)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Updated {formatLiveTimestamp(lastUpdated)}
                  </div>
                </div>
              </div>

              <div className="flex-1 rounded-lg border border-slate-700/30 bg-slate-950/20 p-2 md:p-4 overflow-visible">
                <div className="min-w-[620px] md:min-w-0 overflow-visible">
                  {waveData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-500">
                      No timeline data
                    </div>
                  ) : (
                    <WaveChart
                      data={waveData}
                      rangeKey={timeRange}
                      onPointSelect={handleTimelinePointSelect}
                      activePointKey={selectedTimelinePoint?.key ?? null}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-4 md:p-6 h-full">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs md:text-sm font-semibold text-slate-200">
                    Top 5 Source IPs
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Ranked traffic sources within the selected ML range
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Unique sources</div>
                  <div className="text-sm font-black text-emerald-300">
                    {uniqueOptions.srcs.length}
                  </div>
                </div>
              </div>

              {topSourceIps.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-500">
                  No data
                </div>
              ) : (
                <TopSourceIpsCard sourceIps={topSourceIps} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4 flex flex-col justify-center items-center">
              <div className="text-xs md:text-sm font-semibold text-slate-300 mb-4 w-full">Label Distribution</div>
              {distribution.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-slate-500">No data</div>
              ) : (
                <div className="flex flex-col items-center gap-4 justify-center w-full">
                  <Donut items={distribution} size={140} centerLabelTop={filtered.length} centerLabelBottom="predictions" />
                  <div className="w-full flex justify-center">
                    <Legend items={distribution} />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4 flex flex-col justify-around">
              <div className="text-xs md:text-sm font-semibold text-slate-300 mb-4">Key Statistics</div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Total Predictions:</span>
                  <span className="text-lg font-bold text-sky-400">{totalPredictionsCount || predictions.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Average Confidence:</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatConfidenceValue(stats?.overallAvgConfidence)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Unique IPs:</span>
                  <span className="text-lg font-bold text-violet-400">{uniqueOptions.srcs.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Services Detected:</span>
                  <span className="text-lg font-bold text-orange-400">{uniqueOptions.services.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 md:p-4">
              <div className="text-xs md:text-sm font-semibold text-slate-300 mb-3">Top Labels</div>
              <div className="space-y-2">
                {distribution.slice(0, 5).map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-slate-400 font-bold w-5 text-right">{i + 1}</span>
                      <span className="text-sky-300 truncate text-sm font-mono">{item.name}</span>
                    </div>
                    <span className="font-bold ml-2" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>



          {/* Filter & Table Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl shadow-lg overflow-hidden">
            {selectedTimelinePoint && (
              <div className="p-3 border-b border-slate-800 bg-slate-800/60 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-orange-300">
                  Timeline filter: {formatTimelineBucketLabel(selectedTimelinePoint, timeRange)}
                </div>
                <button
                  onClick={() => {
                    setSelectedTimelinePoint(null);
                    setPage(1);
                  }}
                  className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
                >
                  Reset Time Filter
                </button>
              </div>
            )}
            {/* Filter Bar */}
            <div className="border-b border-slate-800 bg-slate-800/50 p-3 md:p-4">
              <div className="mb-4">
                <div className="text-xs md:text-sm font-semibold text-slate-300">
                  Predictions Table ({filtered.length})
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Label:</span>
                  <select
                    value={filters.label}
                    onChange={(e) => {
                      setFilters((s) => ({ ...s, label: e.target.value }));
                      setPage(1);
                    }}
                    className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">All</option>
                    {uniqueOptions.labels.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Source IP:</span>
                  <input
                    value={filters.sourceIp}
                    onChange={(e) => {
                      setFilters((s) => ({ ...s, sourceIp: e.target.value }));
                      setPage(1);
                    }}
                    placeholder="partial match"
                    className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 w-32 focus:outline-none focus:border-sky-500"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Dest IP:</span>
                  <input
                    value={filters.destinationIp}
                    onChange={(e) => {
                      setFilters((s) => ({ ...s, destinationIp: e.target.value }));
                      setPage(1);
                    }}
                    placeholder="partial match"
                    className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 w-32 focus:outline-none focus:border-sky-500"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Service:</span>
                  <input
                    value={filters.service}
                    onChange={(e) => {
                      setFilters((s) => ({ ...s, service: e.target.value }));
                      setPage(1);
                    }}
                    placeholder="e.g. http"
                    className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 w-24 focus:outline-none focus:border-sky-500"
                  />
                </label>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto" ref={predictionsTableRef}>
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <div className="text-sm">No predictions match current filters.</div>
                </div>
              ) : (
                <table className="w-full text-xs md:text-sm text-left whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/70">
                      <th className="px-2 md:px-4 py-2 md:py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Timestamp</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Label</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Source IP</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Destination IP</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Confidence</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((p, idx) => (
                      <tr
                        key={p.id || p.zeekUid || idx}
                        className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${idx % 2 !== 0 ? 'bg-slate-900/60' : ''
                          }`}
                      >
                        <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-500 text-xs whitespace-nowrap">
                          {formatTime(p.timestamp)}
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-3">
                          <PredictionBadge label={p.predictedLabel} />
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-3 text-emerald-400 font-mono text-xs">
                          {p.sourceIp || '-'}
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-3 text-violet-400 font-mono text-xs">
                          {p.destinationIp || '-'}
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-300 text-xs">
                          {p.service || '-'}
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-3">
                          <ConfidenceBadge score={p.confidence} />
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-3 text-xs text-slate-400">
                          {getConfidenceMeaning(p.predictedLabel, p.confidence)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {filtered.length > 0 && (
              <div className="p-2 md:p-4 border-t border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0 bg-slate-900/50 rounded-b-lg md:rounded-b-xl">
                <div className="text-xs text-slate-500 font-mono">
                  <span className="hidden md:inline">SHOWING </span>
                  <span className="text-sky-400 font-bold">
                    {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}
                  </span>
                  <span className="hidden md:inline">{' - '}</span>
                  <span className="md:hidden">-</span>
                  <span className="text-sky-400 font-bold">
                    {Math.min(page * pageSize, filtered.length)}
                  </span>
                  <span className="hidden md:inline">{' OF '}</span>
                  <span className="md:hidden"> / </span>
                  <span className="text-sky-400 font-bold">{filtered.length}</span>
                  <span className="hidden md:inline"> PREDICTIONS</span>
                </div>

                <div className="flex flex-wrap gap-1 md:gap-2 items-center">
                  <button
                    disabled={page === 1 || loading}
                    onClick={() => {
                      setPage(1);
                      scrollPredictionsTableIntoView();
                    }}
                    className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                  >
                    FIRST
                  </button>

                  <button
                    disabled={page === 1 || loading}
                    onClick={() => {
                      setPage((v) => Math.max(1, v - 1));
                      scrollPredictionsTableIntoView();
                    }}
                    className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                  >
                    PREV
                  </button>

                  <span className="text-xs font-black text-slate-400 px-1 md:px-2">
                    <span className="hidden md:inline">PAGE </span><span className="text-white">{page}</span> / {totalPages}
                  </span>

                  <button
                    disabled={page >= totalPages || loading}
                    onClick={() => {
                      setPage((v) => Math.min(totalPages, v + 1));
                      scrollPredictionsTableIntoView();
                    }}
                    className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                  >
                    NEXT
                  </button>

                  <button
                    disabled={page >= totalPages || loading}
                    onClick={() => {
                      setPage(totalPages);
                      scrollPredictionsTableIntoView();
                    }}
                    className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20"
                  >
                    LAST
                  </button>

                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
