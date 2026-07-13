import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, FileText } from "lucide-react";
import Navbar from "../../components/Navbar";
import { useFimEventsData } from "./useFimEventsData";
import { formatDetailedTimestamp, formatTime, formatLiveTimestamp, formatRate, renderSeverityBadge } from "./utils";
import WaveChart from "./components/WaveChart";
import Donut from "./components/Donut";
import Legend from "./components/Legend";
import TopAgentsCard from "./components/TopAgentsCard";
import PayloadWordCloud from "./components/PayloadWordCloud";

const FimEventsPage = ({ agentId = "all" }) => {
  const {
    events,
    error,
    loading,
    rangeKey,
    setRangeKey,
    currentPage,
    totalPages,
    totalHits,
    pageSize,
    setPageSize,
    lastUpdated,
    selectedTimelinePoint,
    derived,
    refreshAllData,
    goToPage,
    handleTimelinePointSelect,
  } = useFimEventsData(agentId);

  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  const topAgentsContentRef = useRef(null);
  const timelineHeaderRef = useRef(null);
  const logsTableRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth < 1024;
  const donutSize = isMobile ? 148 : isTablet ? 190 : 280;
  const donutStroke = isMobile ? 16 : isTablet ? 18 : 24;
  const [timelineChartHeight, setTimelineChartHeight] = useState(300);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateTimelineHeight = () => {
      if (isMobile) {
        setTimelineChartHeight(220);
        return;
      }

      const topAgentsHeight = topAgentsContentRef.current?.getBoundingClientRect().height;
      const timelineHeaderHeight = timelineHeaderRef.current?.getBoundingClientRect().height || 0;
      if (!topAgentsHeight) return;

      const headerGap = viewportWidth >= 768 ? 24 : 16;
      const nextHeight = Math.max(240, Math.min(Math.round(topAgentsHeight - timelineHeaderHeight - headerGap), 460));
      setTimelineChartHeight(nextHeight);
    };

    updateTimelineHeight();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(updateTimelineHeight);
    if (topAgentsContentRef.current) observer.observe(topAgentsContentRef.current);
    if (timelineHeaderRef.current) observer.observe(timelineHeaderRef.current);
    return () => observer.disconnect();
  }, [isMobile, viewportWidth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-sky-400 gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400"></div>
        <div className="text-sm font-medium">Memuat data</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="bg-red-950/60 border border-red-800/60 rounded-xl px-6 py-4 text-red-300 text-sm">
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
                <FileText className="h-5 md:h-6 w-5 md:w-6 text-emerald-400" />
                File Integrity Monitoring
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-1">Real-time file changes monitoring</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl p-2 md:p-4 shadow-lg flex flex-col gap-3 md:gap-4">
          <div className="flex items-center justify-between gap-1 md:gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await refreshAllData(currentPage, rangeKey);
                  if (logsTableRef.current?.scrollIntoView) {
                    logsTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 transition-colors border border-slate-700"
              >↻ Refresh</button>

              <label className="flex items-center gap-2 text-xs text-slate-400">
                <span className="hidden sm:inline">Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  {[10, 25, 50, 100].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1 md:gap-2">
              <span className="text-xs text-slate-500 hidden sm:inline">Range</span>
              <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700 gap-0.5">
                {["1h", "24h", "7d", "30d"].map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      if (rangeKey !== k) {
                        setRangeKey(k);
                      }
                    }}
                    className={`px-1.5 md:px-2.5 py-0.5 md:py-1 text-xs rounded-sm ${rangeKey === k ? "bg-sky-600 text-white" : "text-slate-400"}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className="bg-slate-800/50 border border-slate-700/60 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-slate-500 uppercase font-semibold">Events</div>
              <div className="text-lg md:text-2xl font-black text-sky-400 mt-0.5 md:mt-1">{derived.total}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-slate-500 uppercase font-semibold">Rate</div>
              <div className="text-base md:text-2xl font-black text-white mt-0.5 md:mt-1 truncate">{formatRate(derived.eps)}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-emerald-400 uppercase font-semibold">Types</div>
              <div className="text-lg md:text-2xl font-black text-emerald-300 mt-0.5 md:mt-1">{derived.eventItems.length}</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 md:p-3">
              <div className="text-[8px] md:text-[10px] text-amber-400 uppercase font-semibold">Severity</div>
              <div className="text-lg md:text-2xl font-black text-amber-300 mt-0.5 md:mt-1">{derived.severityItems.length}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 items-stretch">
            <div className="bg-slate-800/30 border border-slate-800/50 rounded-lg p-4 md:p-6 flex flex-col h-full">
              <div ref={timelineHeaderRef} className="flex justify-between items-center mb-4 md:mb-6 gap-2">
                <div className="text-xs md:text-sm font-semibold text-slate-300 flex items-center gap-1 md:gap-2">
                  <Activity className="h-3 md:h-4 w-3 md:w-4 text-sky-400" />
                  Timeline
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Last {rangeKey}</div>
                  <div className="text-[11px] text-slate-600">Updated {formatLiveTimestamp(lastUpdated)}</div>
                </div>
              </div>
              <div className="overflow-x-auto overflow-y-visible flex-1">
                <div className={isMobile ? "min-w-[620px]" : "min-w-0"}>
                  <WaveChart
                    data={derived.series}
                    color="#10b981"
                    height={timelineChartHeight}
                    rangeKey={rangeKey}
                    compact={isMobile}
                    activePointKey={selectedTimelinePoint?.key ?? null}
                    onPointSelect={handleTimelinePointSelect}
                  />
                </div>
              </div>
            </div>
            <div className="bg-slate-800/30 border border-slate-800/50 rounded-lg p-4 md:p-6 h-full">
              <div ref={topAgentsContentRef}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs md:text-sm font-semibold text-slate-300">Top 5 Agents</div>
                    <div className="mt-1 text-[11px] text-slate-500">Most active agents from FIM events</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Unique agents</div>
                    <div className="text-sm font-black text-emerald-300">{derived.uniqueAgents}</div>
                  </div>
                </div>
                <TopAgentsCard agents={derived.topAgents} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-lg flex flex-row items-center justify-center gap-36 w-full min-h-[280px]">
           <div className="flex flex-col items-center gap-6 w-auto">
            <Donut items={derived.eventItems} size={donutSize} stroke={donutStroke} centerLabelTop={derived.total} centerLabelBottom="events" compact={isMobile} />
            <div className="w-full flex justify-center">
              <Legend items={derived.eventItems} />
            </div>
          </div>
          <div className="flex flex-col items-center gap-6 w-auto">
            <Donut items={derived.severityItems} size={donutSize} stroke={donutStroke} centerLabelTop={derived.total} centerLabelBottom="severity" compact={isMobile} />
            <div className="w-full flex justify-center">
              <Legend items={derived.severityItems} />
            </div>
          </div>
          </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-lg flex flex-col gap-2 items-center justify-center">
              <div className="w-full text-xs md:text-sm font-semibold text-slate-300">Diff Pattern Cloud</div>
              <div className="command-keywords-distribution-box w-full overflow-x-auto bg-slate-950 border border-slate-800 rounded-lg p-2 md:p-4">
                <div className={isMobile ? "min-w-[520px]" : "min-w-0"}>
                  <PayloadWordCloud words={derived.payloadWords} compact={isMobile} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl shadow-lg overflow-hidden">
          <div ref={logsTableRef} className="overflow-x-auto">
            {selectedTimelinePoint && (
              <div className="p-3 border-b border-slate-800 bg-slate-800/60 flex items-center justify-between">
                <div className="text-xs text-orange-300">
                  Timeline filter: {formatDetailedTimestamp(selectedTimelinePoint.start)}
                  {selectedTimelinePoint.end ? ` - ${formatDetailedTimestamp(selectedTimelinePoint.end)}` : ""}
                </div>
                <button
                  onClick={async () => {
                    await refreshAllData(1, rangeKey);
                  }}
                  className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
                >
                  Reset Time Filter
                </button>
              </div>
            )}
            <table className="w-full text-xs md:text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/70">
                  {['↓ time', 'agent', 'user', 'path', 'event', 'diff', 'severity'].map((h) => (
                    <th key={h} className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((evt, idx) => (
                  <tr key={evt.id} className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${idx % 2 !== 0 ? "bg-slate-900/60" : ""}`}>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-500 text-xs">{formatTime(evt.timestamp)}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-sky-400 font-medium text-xs">{evt.agentName}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-violet-400 font-medium text-xs">{evt.username}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-emerald-400 font-mono text-xs truncate">{evt.syscheckPath}</td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3">
                      <span className={`text-xs px-1 md:px-2 py-0.5 rounded border ${evt.syscheckEvent === "deleted" ? "text-red-400 bg-red-900/30" : "text-green-400 bg-green-900/30"}`}>
                        {evt.syscheckEvent}
                      </span>
                    </td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3 text-slate-300 max-w-xs md:max-w-md text-xs">
                      {evt.fileDiff && (
                        <div className="mb-2">
                          <div className="text-[8px] md:text-[9px] text-sky-500 uppercase font-bold mb-1 tracking-tight">
                            Changes:
                          </div>
                          <pre className="p-1 md:p-2 bg-black/60 text-[8px] md:text-[10px] rounded border border-slate-700/50 font-mono text-emerald-400 overflow-x-auto leading-normal whitespace-pre-wrap">
                            {String(evt.fileDiff).replace(/\n/g, "\n").replace(/\u003e/g, "→").replace(/["']/g, "")}
                          </pre>
                        </div>
                      )}
                      <div className="text-xs font-semibold text-slate-100 opacity-80 border-t border-slate-800/50 pt-1">
                        {evt.ruleDescription || evt.rule_description}
                      </div>
                    </td>
                    <td className="px-2 md:px-4 py-1.5 md:py-3">{renderSeverityBadge(evt.ruleLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-2 md:p-4 border-t border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0 bg-slate-900/50 rounded-b-lg md:rounded-b-xl">
              <div className="text-xs text-slate-500 font-mono">
                <span className="hidden md:inline">SHOWING </span>
                <span className="text-sky-400 font-bold">{totalHits === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span>
                <span className="hidden md:inline"> - </span>
                <span className="text-sky-400 font-bold">{Math.min(currentPage * pageSize, totalHits)}</span>
                <span className="hidden md:inline"> OF </span>
                <span className="text-sky-400 font-bold">{totalHits}</span>
                <span className="hidden md:inline"> EVENTS</span>
              </div>
              <div className="flex flex-wrap gap-1 md:gap-2 items-center">
                <button disabled={currentPage === 1 || loading} onClick={() => goToPage(1)} className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20">
                  <span className="hidden md:inline">FIRST</span>
                  <span className="md:hidden">«</span>
                </button>
                <button disabled={currentPage === 1 || loading} onClick={() => goToPage(Math.max(currentPage - 1, 1))} className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20">
                  <span className="hidden md:inline">← PREV</span>
                  <span className="md:hidden">‹</span>
                </button>
                <span className="text-xs font-black text-slate-400 px-1 md:px-2"><span className="hidden md:inline">PAGE </span><span className="text-white">{currentPage}</span> / {totalPages}</span>
                <button disabled={currentPage === totalPages || loading} onClick={() => goToPage(Math.min(currentPage + 1, totalPages))} className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20">
                  <span className="hidden md:inline">NEXT →</span>
                  <span className="md:hidden">›</span>
                </button>
                <button disabled={currentPage === totalPages || loading} onClick={() => goToPage(totalPages)} className="px-2 md:px-4 py-1 md:py-2 rounded text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-sky-900/20 hover:border-sky-500/50 transition-all disabled:opacity-20">
                  <span className="hidden md:inline">LAST</span>
                  <span className="md:hidden">»</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FimEventsPage;
