import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchEvents as apiFetchEvents, fetchAggregated as apiFetchAggregated, fetchDomains as apiFetchDomains } from "./fimApi";
import { buildFimDerivedData } from "./utils";

const DEFAULT_RANGE_KEY = "30d";

export function useFimEventsData(agentId) {
  const [events, setEvents] = useState([]);
  const [aggregatedEvents, setAggregatedEvents] = useState([]);
  const [domainData, setDomainData] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState(DEFAULT_RANGE_KEY);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalHits, setTotalHits] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selectedTimelinePoint, setSelectedTimelinePoint] = useState(null);
  const skipNextFetchRef = useRef(false);

  const fetchEvents = useCallback(
    async (page = 1, rk = null, startOverride = null, endOverride = null) => {
      try {
        setLoading(true);
        setError(null);

        const effectiveRange = rk || rangeKey;
        const result = await apiFetchEvents({
          agentId,
          page,
          pageSize,
          rangeKey: effectiveRange,
          selectedTimelinePoint,
          startOverride,
          endOverride,
        });

        setEvents(Array.isArray(result.data) ? result.data : []);
        setTotalHits(Number(result.total_hits) || 0);
        setTotalPages(Number(result.total_pages) || 1);
        setCurrentPage(Number(result.current_page) || page);
        return result;
      } catch (err) {
        setError(err.message || "Gagal mengambil data");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [agentId, pageSize, rangeKey, selectedTimelinePoint]
  );

  const fetchAggregated = useCallback(
    async (size = 1000, rk = null) => {
      try {
        const effectiveRange = rk || rangeKey;
        const result = await apiFetchAggregated({ agentId, size, rangeKey: effectiveRange });
        setAggregatedEvents(Array.isArray(result.data) ? result.data : []);
        return result;
      } catch (err) {
        return null;
      }
    },
    [agentId, rangeKey]
  );

  const fetchDomains = useCallback(
    async (rk = null) => {
      try {
        const effectiveRange = rk || rangeKey;
        const result = await apiFetchDomains({ agentId, rangeKey: effectiveRange });
        setDomainData(Array.isArray(result.data) ? result.data : []);
        return result;
      } catch (err) {
        setDomainData([]);
        return null;
      }
    },
    [agentId, rangeKey]
  );

  const refreshAllData = useCallback(
    async (page = 1, rk = null) => {
      const result = await fetchEvents(page, rk);
      const sampleSize = Math.min(1000, Number(result?.total_hits) || 1000);

      await Promise.all([fetchAggregated(sampleSize, rk), fetchDomains(rk)]);

      if (result) {
        setLastUpdated(new Date().toISOString());
      }

      return result;
    },
    [fetchEvents, fetchAggregated, fetchDomains]
  );

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      const targetPage = currentPage > 1 ? currentPage : 1;
      const result = await refreshAllData(targetPage, rangeKey);
      if (cancelled || !result) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId, currentPage, rangeKey, refreshAllData]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshAllData(currentPage, rangeKey);
    }, 30000);

    return () => clearInterval(interval);
  }, [currentPage, rangeKey, refreshAllData]);

  const previousPageSizeRef = useRef(pageSize);
  useEffect(() => {
    if (previousPageSizeRef.current === pageSize) {
      return;
    }

    previousPageSizeRef.current = pageSize;
    setCurrentPage(1);
    (async () => {
      await refreshAllData(1, rangeKey);
    })();
  }, [pageSize, refreshAllData, rangeKey]);

  const goToPage = useCallback(
    async (next) => {
      if (!Number.isFinite(next)) return;
      const target = Math.max(1, Math.min(next, totalPages || next));
      skipNextFetchRef.current = true;
      await refreshAllData(target, rangeKey);
      setCurrentPage(target);
    },
    [refreshAllData, rangeKey, totalPages]
  );

  const handleTimelinePointSelect = useCallback(
    async (point) => {
      if (!point) return;

      const pointKey = String(point.key ?? point.t ?? point.start ?? point);
      const bucketMs = point.bucketMs || (rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000);
      const startIso = point.start || new Date(Number(point.t)).toISOString();
      const endIso = point.end || new Date(Number(point.t) + bucketMs - 1).toISOString();

      if (selectedTimelinePoint?.key === pointKey) {
        setSelectedTimelinePoint(null);
        await refreshAllData(1, rangeKey);
        return;
      }

      setSelectedTimelinePoint({ key: pointKey, start: startIso, end: endIso, bucketMs, time: point.t });
      setCurrentPage(1);
      await fetchEvents(1, rangeKey, startIso, endIso);
    },
    [fetchEvents, refreshAllData, rangeKey, selectedTimelinePoint]
  );

  const derived = useMemo(
    () => buildFimDerivedData(events, aggregatedEvents, rangeKey, totalHits),
    [events, aggregatedEvents, rangeKey, totalHits]
  );

  return {
    events,
    domainData,
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
  };
}
