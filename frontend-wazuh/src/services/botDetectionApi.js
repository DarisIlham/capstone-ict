import { API_BASE_URL } from "../config/Api";

// Bot Detection API wrapper (mirrors mlApi): all Elasticsearch access
// happens server-side, the browser only talks to these backend endpoints.
async function fetchJson(path, options = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...options });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(res.status + " " + res.statusText + (text ? " - " + text : ""));
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const BASE = `${API_BASE_URL}/api/bot-detection`;

function toQueryString(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  return qs.toString();
}

function get(path, params = {}, options = {}) {
  const qs = toQueryString(params);
  const fetchOptions = options?.signal ? { signal: options.signal } : {};
  return fetchJson(qs ? `${BASE}${path}?${qs}` : `${BASE}${path}`, fetchOptions);
}

export function getSummary(params = {}, options = {}) {
  return get("/summary", params, options);
}

export function getTrend(params = {}, options = {}) {
  return get("/trend", params, options);
}

export function getDistribution(params = {}, options = {}) {
  return get("/distribution", params, options);
}

export function getTopSources(params = {}, options = {}) {
  return get("/top-sources", params, options);
}

export function getTopDestinations(params = {}, options = {}) {
  return get("/top-destinations", params, options);
}

export function getTopAgents(params = {}, options = {}) {
  return get("/top-agents", params, options);
}

export function getProbability(params = {}, options = {}) {
  return get("/probability", params, options);
}

export function getBehaviorSummary(params = {}, options = {}) {
  return get("/behavior-summary", params, options);
}

export function getTraffic(params = {}, options = {}) {
  return get("/traffic", params, options);
}

export function getTrafficTimeline(params = {}, options = {}) {
  return get("/traffic-timeline", params, options);
}

export function getAlerts(params = {}, options = {}) {
  return get("/alerts", params, options);
}

export function getAlertDetail(index, id, options = {}) {
  return get("/detail", { index, id }, options);
}

const botDetectionApi = {
  getSummary,
  getTrend,
  getDistribution,
  getTopSources,
  getTopDestinations,
  getTopAgents,
  getProbability,
  getBehaviorSummary,
  getTraffic,
  getTrafficTimeline,
  getAlerts,
  getAlertDetail,
};

export default botDetectionApi;
