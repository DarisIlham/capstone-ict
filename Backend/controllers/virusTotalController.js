// controllers/virusTotalController.js
import asyncHandler from "../utils/asyncHandler.js";
import * as virusTotalService from "../services/virusTotalService.js";

const STATUS_BY_ERROR = {
  invalid_hash: 400,
  unauthorized: 403,
  missing_api_key: 500,
  not_found: 404,
  rate_limited: 429,
  upstream_error: 502,
  network_error: 502
};

export const getFileReport = asyncHandler(async (req, res) => {
  const { hash } = req.query;

  if (!hash) {
    return res.status(400).json({
      success: false,
      message: "Parameter hash wajib diisi"
    });
  }

  const result = await virusTotalService.getFileReport(hash);

  if (!result.success) {
    const status = STATUS_BY_ERROR[result.error] || 500;
    return res.status(status).json({
      success: false,
      error: result.error,
      message: result.message
    });
  }

  res.json({
    success: true,
    data: result
  });
});