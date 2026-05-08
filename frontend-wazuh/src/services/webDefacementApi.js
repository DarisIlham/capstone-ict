import API from "../config/Api.js";

export async function scanWebDefacementEndpoint(endpoint, type = "all") {
  const response = await API.post("/api/web-defacement/scan", {
    endpoint,
    type,
  });
  return response.data;
}

export async function fetchWebDefacementEndpoints() {
  const response = await API.get("/api/web-defacement/endpoints");
  return response.data;
}

export async function createWebDefacementEndpoint(endpointUrl) {
  const response = await API.post("/api/web-defacement/endpoints", {
    endpointUrl,
  });
  return response.data;
}

export async function removeWebDefacementEndpoint(endpointId) {
  const response = await API.delete(`/api/web-defacement/endpoints/${endpointId}`);
  return response.data;
}
