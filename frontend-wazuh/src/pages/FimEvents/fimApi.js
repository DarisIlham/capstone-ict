import { API_BASE_URL } from "../../config/Api";
import { getRangeWindow } from "./utils";

const requestJson = async (url) => {
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
};

const buildEventsEndpoint = ({ agentId, page, pageSize, rangeKey, selectedTimelinePoint, startOverride, endOverride }) => {
  const baseEndpoint =
    agentId === "all"
      ? `${API_BASE_URL}/api/events`
      : `${API_BASE_URL}/api/events/${agentId}`;

  let start;
  let end;

  if (startOverride && endOverride) {
    start = startOverride;
    end = endOverride;
  } else if (selectedTimelinePoint?.start && selectedTimelinePoint?.end) {
    start = selectedTimelinePoint.start;
    end = selectedTimelinePoint.end;
  } else {
    const rangeWindow = getRangeWindow(rangeKey);
    start = rangeWindow.start;
    end = rangeWindow.end;
  }

  return `${baseEndpoint}?page=${page}&size=${pageSize}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
};

export async function fetchEvents(options) {
  const endpoint = buildEventsEndpoint(options);
  return requestJson(endpoint);
}

export async function fetchAggregated({ agentId, size, rangeKey }) {
  const rangeWindow = getRangeWindow(rangeKey);
  const baseEndpoint = agentId === "all" ? `${API_BASE_URL}/api/events` : `${API_BASE_URL}/api/events/${agentId}`;
  const endpoint = `${baseEndpoint}?page=1&size=${size}&start=${encodeURIComponent(rangeWindow.start)}&end=${encodeURIComponent(rangeWindow.end)}`;
  return requestJson(endpoint);
}

export async function fetchDomains({ agentId, rangeKey }) {
  const rangeWindow = getRangeWindow(rangeKey);
  const baseEndpoint =
    agentId === "all"
      ? `${API_BASE_URL}/api/fim/domains`
      : `${API_BASE_URL}/api/fim/${agentId}/domains`;
  const endpoint = `${baseEndpoint}?size=1000&range=${encodeURIComponent(rangeKey)}&start=${encodeURIComponent(rangeWindow.start)}&end=${encodeURIComponent(rangeWindow.end)}`;
  return requestJson(endpoint);
}
