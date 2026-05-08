import { API_BASE_URL } from "../config/Api";

export async function scanWebDefacementEndpoint(endpoint, type = "all") {
  const response = await fetch(`${API_BASE_URL}/api/web-defacement/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint,
      type,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`);
  }

  return payload;
}
