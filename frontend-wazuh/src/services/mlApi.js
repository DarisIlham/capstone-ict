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

export function getPredictions(params = {}) {
  // Set default limit to 10000 to fetch all predictions (not just 20)
  const fullParams = { limit: 10000, ...params };
  const qs = new URLSearchParams(fullParams).toString();
  const url = qs ? `${BASE}/predictions?${qs}` : `${BASE}/predictions`;
  return fetchJson(url);
}

export function getLatest() {
  return fetchJson(`${BASE}/predictions/latest`);
}

export function getStats() {
  return fetchJson(`${BASE}/predictions/stats`);
}

export function getTimeline(minutes = 60, end) {
  const params = new URLSearchParams({ minutes: String(minutes) });
  if (end) params.set('end', end);
  const url = `${BASE}/predictions/timeline?${params.toString()}`;
  return fetchJson(url);
}

export function getTimelineMock(minutes = 60) {
  const url = `${BASE}/predictions/timeline-mock?minutes=${encodeURIComponent(minutes)}`;
  return fetchJson(url);
}

const mlApi = { getPredictions, getLatest, getStats, getTimeline, getTimelineMock };
export default mlApi;
