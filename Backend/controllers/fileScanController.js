// controllers/fileScanController.js

// 1. Ganti require menjadi import dan tambahkan ekstensi .js
import asyncHandler from "../utils/asyncHandler.js";
import * as fileScanService from "../services/fileScanService.js";

// 2. Ganti exports.namaFungsi menjadi export const namaFungsi
export const listFileScans = asyncHandler(async (req, res) => {
  const result = await fileScanService.listFileScans(req.query);

  res.json({
    success: true,
    ...result
  });
});

export const getLatestFileScan = asyncHandler(async (req, res) => {
  const data = await fileScanService.getLatestFileScan(req.query);

  if (!data) {
    return res.status(404).json({
      success: false,
      message: "No file scan data found"
    });
  }

  res.json({
    success: true,
    data
  });
});

export const listSuspiciousFileScans = asyncHandler(async (req, res) => {
  const result = await fileScanService.listSuspiciousFileScans(req.query);

  res.json({
    success: true,
    ...result
  });
});

export const listFileScanErrors = asyncHandler(async (req, res) => {
  const result = await fileScanService.listFileScanErrors(req.query);

  res.json({
    success: true,
    ...result
  });
});

export const getFileScanStats = asyncHandler(async (req, res) => {
  const data = await fileScanService.getFileScanStats();

  res.json({
    success: true,
    data
  });
});

export const getFileScanTimeline = asyncHandler(async (req, res) => {
  const data = await fileScanService.getFileScanTimeline(req.query);

  res.json({
    success: true,
    data
  });
});