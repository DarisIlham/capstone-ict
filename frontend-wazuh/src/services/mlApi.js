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

function toSearchParams(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    if (key === "search_after" && typeof value !== "string") {
      search.set(key, JSON.stringify(value));
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

export function getPredictions(params = {}) {
  const fullParams = { limit: 100, ...params };
  const qs = toSearchParams(fullParams);
  const url = qs ? `${BASE}/predictions?${qs}` : `${BASE}/predictions`;
  return fetchJson(url);
}

export function getLatest() {
  return fetchJson(`${BASE}/predictions/latest`);
}

export function getStats(params = {}) {
  const qs = toSearchParams(params);
  const url = qs ? `${BASE}/predictions/stats?${qs}` : `${BASE}/predictions/stats`;
  return fetchJson(url);
}

export function getTimeline(minutes = 60, options = {}) {
  const qs = toSearchParams({ minutes, ...options });
  const url = `${BASE}/predictions/timeline?${qs}`;
  return fetchJson(url);
}

const mlApi = { getPredictions, getLatest, getStats, getTimeline };
export default mlApi;
