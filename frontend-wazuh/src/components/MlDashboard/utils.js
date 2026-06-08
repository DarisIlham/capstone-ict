// Utilities and shared constants for MlDashboard components
export const TIME_RANGE_OPTIONS = [
  { label: '1h', value: '1h', description: '1 hour' },
  { label: '24h', value: '24h', description: '24 hours' },
  { label: '7d', value: '7d', description: '7 days' },
  { label: '30d', value: '30d', description: '30 days' },
];

export const DEFAULT_TIME_RANGE = '30d';
export const RANGE_TO_MINUTES = {
  '1h': 60,
  '24h': 1440,
  '7d': 10080,
  '30d': 43200,
};

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const PREDICTIONS_FETCH_BATCH_SIZE = 1000;
export const MAX_PREDICTIONS_RESULT_WINDOW = 10000;

export const COLORS = ['#10b981', '#ef4444', '#f97316', '#3b82f6', '#a78bfa', '#ec4899', '#14b8a6', '#8b5cf6'];
export const WORD_COLORS = ['#f472b6', '#38bdf8', '#4ade80', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#facc15', '#60a5fa', '#e879f9'];
export const TOP_SOURCE_IPS_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];

export const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

export const withAlpha = (hex, alpha) => {
  const safeHex = String(hex || '').replace('#', '');
  if (safeHex.length !== 6) return hex;
  const r = parseInt(safeHex.slice(0, 2), 16);
  const g = parseInt(safeHex.slice(2, 4), 16);
  const b = parseInt(safeHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export function getValidDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const getTimestampMs = (value) => getValidDate(value)?.getTime() ?? null;

export const formatDetailedTimestamp = (timestamp) => {
  const date = getValidDate(timestamp);
  if (!date) return '-';
  return date.toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

export const formatTime = (isoString) => {
  const date = getValidDate(isoString);
  if (!date) return '-';
  return date.toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).replace(',', '').replace('AM', '').replace('PM', '').trim();
};

export const formatLiveTimestamp = (isoString) => {
  const date = getValidDate(isoString);
  if (!date) return '-';
  return date.toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

export const getTimelineRangeDescription = (value) =>
  TIME_RANGE_OPTIONS.find((option) => option.value === String(value))?.description || String(value);

export function getRangeWindow(rangeKey) {
  const end = new Date();
  const start = new Date(end);
  switch (rangeKey) {
    case '1h': start.setHours(start.getHours() - 1); break;
    case '24h': start.setHours(start.getHours() - 24); break;
    case '7d': start.setDate(start.getDate() - 7); break;
    case '30d':
    default: start.setDate(start.getDate() - 30); break;
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export function getTimelineBucketMs(minutes) {
  if (minutes <= 60) return 5 * 60 * 1000;
  if (minutes <= 1440) return 30 * 60 * 1000;
  if (minutes <= 10080) return 3 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function createTimelineBucketPoint(bucketStartMs, value, bucketMs) {
  const startDate = new Date(bucketStartMs);
  if (Number.isNaN(startDate.getTime())) return null;
  const start = startDate.toISOString();
  const end = new Date(bucketStartMs + bucketMs - 1).toISOString();
  return { key: start, t: bucketStartMs, time: start, start, end, bucketMs, v: value };
}

export const formatBucketLabel = (timestamp, rangeKey) => {
  const date = getValidDate(timestamp);
  if (!date) return '-';
  if (rangeKey === '1h') return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (rangeKey === '24h') return date.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit' });
  if (rangeKey === '7d') return date.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit' });
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};

export const formatTimelineBucketLabel = (point, rangeKey) => {
  if (!point?.start) return '-';
  if ((point.bucketMs || getTimelineBucketMs(RANGE_TO_MINUTES[rangeKey] || RANGE_TO_MINUTES[DEFAULT_TIME_RANGE])) <= 60 * 60 * 1000) {
    return formatDetailedTimestamp(point.start);
  }
  return `${formatDetailedTimestamp(point.start)} - ${formatDetailedTimestamp(point.end)}`;
};

export function buildTimelineFromPredictions(predictions, minutes) {
  const safeMinutes = Math.max(parseInt(minutes || '60', 10), 1);
  const rangeMs = safeMinutes * 60 * 1000;
  const stepMs = getTimelineBucketMs(safeMinutes);
  const now = Date.now();
  const startMs = now - rangeMs;
  const bucketStart = (ts) => Math.floor(ts / stepMs) * stepMs;

  const filteredPredictions = predictions
    .map((item) => ({ ...item, _ts: getTimestampMs(item.timestamp) }))
    .filter((item) => Number.isFinite(item._ts) && item._ts >= startMs && item._ts <= now);

  if (!filteredPredictions.length) return [];

  const buckets = new Map();
  let minBucket = Infinity;
  let maxBucket = -Infinity;

  filteredPredictions.forEach((item) => {
    const bucket = bucketStart(item._ts);
    minBucket = Math.min(minBucket, bucket);
    maxBucket = Math.max(maxBucket, bucket);
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  });

  const output = [];
  for (let ts = minBucket; ts <= maxBucket; ts += stepMs) {
    const point = createTimelineBucketPoint(ts, buckets.get(ts) || 0, stepMs);
    if (point) output.push({ timestamp: point.start, total: point.v, start: point.start, end: point.end, bucketMs: point.bucketMs, labels: [] });
  }

  return output;
}

export function buildStatsFromPredictions(predictions) {
  const labelMap = new Map();
  let confidenceTotal = 0;
  let confidenceCount = 0;

  predictions.forEach((prediction) => {
    const label = prediction.predictedLabel || 'unknown';
    const current = labelMap.get(label) || { label, count: 0, confidenceTotal: 0, confidenceCount: 0 };
    current.count += 1;

    const confidence = typeof prediction.confidence === 'number' ? prediction.confidence : parseFloat(prediction.confidence);
    if (!Number.isNaN(confidence)) {
      current.confidenceTotal += confidence;
      current.confidenceCount += 1;
      confidenceTotal += confidence;
      confidenceCount += 1;
    }

    labelMap.set(label, current);
  });

  return {
    totalPredictions: predictions.length,
    overallAvgConfidence: confidenceCount ? confidenceTotal / confidenceCount : null,
    labels: Array.from(labelMap.values()).map((item) => ({ label: item.label, count: item.count, avgConfidence: item.confidenceCount ? item.confidenceTotal / item.confidenceCount : null })),
  };
}

export function getConfidenceMeaning(label, score) {
  const value = typeof score === 'number' ? score : parseFloat(score);
  if (Number.isNaN(value)) return '-';
  const lowerLabel = String(label || '').toLowerCase();
  const subject = lowerLabel.includes('benign') || lowerLabel.includes('normal') ? 'benign prediction' : 'attack prediction';
  if (value >= 0.8) return `High confidence in ${subject}`;
  if (value >= 0.6) return `Moderate confidence in ${subject}`;
  return `Low confidence in ${subject}`;
}

export function formatConfidenceValue(score) {
  if (score === undefined || score === null || score === '') return '-';
  const value = typeof score === 'number' ? score : parseFloat(score);
  if (Number.isNaN(value)) return '-';
  return value.toFixed(2);
}
