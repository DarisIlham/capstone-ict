// Simple ml API wrapper for frontend
async function fetchJson(path, options = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(res.status + ' ' + res.statusText + (text ? ' - ' + text : ''));
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const BASE = '/api/ml';
const DEFAULT_PREDICTIONS_LIMIT = 1000;

export function getPredictions(params = {}) {
  // Keep a generous legacy default, while allowing callers to override it for cursor batches.
  const fullParams = { limit: DEFAULT_PREDICTIONS_LIMIT, ...params };
  const qs = new URLSearchParams(
    Object.entries(fullParams).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = qs ? `${BASE}/predictions?${qs}` : `${BASE}/predictions`;
  return fetchJson(url);
}

export function getLatest() {
  return fetchJson(`${BASE}/predictions/latest`);
}

export function getStats(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${BASE}/predictions/stats?${qs}` : `${BASE}/predictions/stats`;
  return fetchJson(url);
}

export function getTimeline(minutes = 60) {
  const url = `${BASE}/predictions/timeline?minutes=${encodeURIComponent(minutes)}`;
  return fetchJson(url);
}

export function getTimelineMock(minutes = 60) {
  const url = `${BASE}/predictions/timeline-mock?minutes=${encodeURIComponent(minutes)}`;
  return fetchJson(url);
}

const mlApi = { getPredictions, getLatest, getStats, getTimeline, getTimelineMock };
export default mlApi;
