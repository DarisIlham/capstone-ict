import asyncHandler from "../utils/asyncHandler.js";
import { scanEndpointHtml } from "../services/webDefacementService.js";

export const scanWebDefacement = asyncHandler(async (req, res) => {
  const { endpoint, type = "all" } = req.body || {};
  const result = await scanEndpointHtml({ endpoint, type });

  res.json(result);
});
