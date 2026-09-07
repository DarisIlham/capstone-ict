import { API_BASE_URL } from "../config/Api";

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

const BASE = `${API_BASE_URL}/api/ml`;

export function getPredictions(params = {}) {
  // Set default limit to 10000 to fetch all predictions (not just 20)
  const fullParams = { limit: 10000000, ...params };
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

export function getTimeline(minutes = 60, options = {}) {
  const params = new URLSearchParams({ minutes: String(minutes) });
  if (options?.start) params.set('start', options.start);
  if (options?.end) params.set('end', options.end);
  const url = `${BASE}/predictions/timeline?${params.toString()}`;
  return fetchJson(url);
}

const mlApi = { getPredictions, getLatest, getStats, getTimeline };
export default mlApi;
