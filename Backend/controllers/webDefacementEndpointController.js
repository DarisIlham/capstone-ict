import asyncHandler from "../utils/asyncHandler.js";
import {
  createWebDefacementEndpoint,
  deleteWebDefacementEndpoint,
  listWebDefacementEndpoints,
} from "../services/webDefacementEndpointService.js";

export const getWebDefacementEndpoints = asyncHandler(async (req, res) => {
  const endpoints = await listWebDefacementEndpoints();

  res.json({
    success: true,
    endpoints,
  });
});

export const addWebDefacementEndpoint = asyncHandler(async (req, res) => {
  const { endpointUrl } = req.body || {};

  if (!endpointUrl) {
    return res.status(400).json({
      success: false,
      message: "Endpoint URL is required",
    });
  }

  const endpoint = await createWebDefacementEndpoint(endpointUrl);

  res.status(201).json({
    success: true,
    message: "Endpoint URL added successfully",
    endpoint,
  });
});

export const removeWebDefacementEndpoint = asyncHandler(async (req, res) => {
  const { endpointId } = req.params;

  if (!endpointId) {
    return res.status(400).json({
      success: false,
      message: "Endpoint ID is required",
    });
  }

  const endpoint = await deleteWebDefacementEndpoint(endpointId);

  res.json({
    success: true,
    message: "Endpoint URL deleted successfully",
    endpoint,
  });
});
