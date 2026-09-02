const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_DATE_RANGE_DAYS = 1;

export function toDateTimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localMs = date.getTime() - date.getTimezoneOffset() * MINUTE_MS;
  return new Date(localMs).toISOString().slice(0, 16);
}

export function createDefaultDateRange(days = DEFAULT_DATE_RANGE_DAYS) {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY_MS);

  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end),
  };
}

export function getValidDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeDateRange(range) {
  const fallback = createDefaultDateRange();
  const start = range?.start || fallback.start;
  const end = range?.end || fallback.end;
  const startDate = getValidDate(start);
  const endDate = getValidDate(end);

  if (!startDate || !endDate) return fallback;
  if (startDate.getTime() > endDate.getTime()) {
    return {
      start: toDateTimeLocalValue(endDate),
      end: toDateTimeLocalValue(startDate),
    };
  }

  return { start, end };
}

export function getDateRangeError(range) {
  if (!range?.start || !range?.end) return "Select both start and end dates.";

  const startDate = getValidDate(range.start);
  const endDate = getValidDate(range.end);

  if (!startDate || !endDate) return "Use a valid date range.";
  if (startDate.getTime() > endDate.getTime()) return "Start date must be before end date.";
  return "";
}

export function getIsoDateRange(range) {
  const normalized = normalizeDateRange(range);
  const startDate = getValidDate(normalized.start);
  const endDate = getValidDate(normalized.end);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

export function appendDateRangeParams(params, range) {
  const { start, end } = getIsoDateRange(range);
  params.set("start", start);
  params.set("end", end);
  return params;
}

export function getDateRangeBoundsMs(range) {
  const { start, end } = getIsoDateRange(range);
  return {
    startMs: new Date(start).getTime(),
    endMs: new Date(end).getTime(),
  };
}

export function getDateRangeDurationMs(range) {
  const { startMs, endMs } = getDateRangeBoundsMs(range);
  return Math.max(MINUTE_MS, endMs - startMs);
}

export function getDateRangeMinutes(range) {
  return Math.max(1, Math.ceil(getDateRangeDurationMs(range) / MINUTE_MS));
}

export function getBucketMsForDateRange(range) {
  const durationMs = getDateRangeDurationMs(range);

  if (durationMs <= HOUR_MS) return 5 * MINUTE_MS;
  if (durationMs <= DAY_MS) return HOUR_MS;
  if (durationMs <= 7 * DAY_MS) return 6 * HOUR_MS;
  if (durationMs <= 90 * DAY_MS) return DAY_MS;
  if (durationMs <= 366 * DAY_MS) return 7 * DAY_MS;
  return 30 * DAY_MS;
}

export function getRangeKeyForDateRange(range) {
  const minutes = getDateRangeMinutes(range);

  if (minutes <= 60) return "1h";
  if (minutes <= 24 * 60) return "24h";
  if (minutes <= 7 * 24 * 60) return "7d";
  return "30d";
}

export function formatDateRangeLabel(range) {
  const { start, end } = getIsoDateRange(range);
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

export function buildTimelineSeries(items, getTimestamp, getValue, range) {
  const { startMs, endMs } = getDateRangeBoundsMs(range);
  const bucketMs = getBucketMsForDateRange(range);
  const bucketStart = (ms) => Math.floor(ms / bucketMs) * bucketMs;
  const buckets = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const rawTimestamp = getTimestamp(item);
    const ts = new Date(rawTimestamp).getTime();

    if (!Number.isFinite(ts) || ts < startMs || ts > endMs) return;

    const value = Number(getValue(item) || 0);
    const key = bucketStart(ts);
    buckets.set(key, (buckets.get(key) || 0) + Math.max(0, Number.isFinite(value) ? value : 0));
  });

  const series = [];
  for (let t = bucketStart(startMs); t <= bucketStart(endMs); t += bucketMs) {
    series.push({ t, v: buckets.get(t) || 0, bucketMs });
  }

  return series;
}
