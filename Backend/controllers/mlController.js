// controllers/mlController.js

// 1. Ganti require menjadi import dan tambahkan ekstensi .js
import asyncHandler from "../utils/asyncHandler.js";
import * as mlService from "../services/mlService.js";

// 2. Ganti exports.namaFungsi menjadi export const namaFungsi
export const listPredictions = asyncHandler(async (req, res) => {
  const result = await mlService.listPredictions(req.query);

  res.json({
    success: true,
    ...result
  });
});

export const getLatestPrediction = asyncHandler(async (req, res) => {
  const data = await mlService.getLatestPrediction();

  if (!data) {
    return res.status(404).json({
      success: false,
      message: "No ML prediction data found"
    });
  }

  res.json({
    success: true,
    data
  });
});

export const getPredictionStats = asyncHandler(async (req, res) => {
  const data = await mlService.getPredictionStats();

  res.json({
    success: true,
    data
  });
});

export const getPredictionTimeline = asyncHandler(async (req, res) => {
  const data = await mlService.getPredictionTimeline(req.query);

  res.json({
    success: true,
    data
  });
});

// Mock endpoint untuk testing wave chart
export const getPredictionTimelineMock = asyncHandler(async (req, res) => {
  const minutes = Math.max(parseInt(req.query.minutes || "60", 10), 1);
  const now = Date.now();
  const stepMs = minutes <= 60 ? 5 * 60 * 1000 : minutes <= 360 ? 30 * 60 * 1000 : 3600 * 1000;
  const rangeMs = minutes * 60 * 1000;
  
  const data = [];
  for (let bucket = now - rangeMs; bucket <= now; bucket += stepMs) {
    // Generate realistic mock data with some variation
    const randomValue = Math.floor(Math.random() * 8) + (Math.floor(bucket / stepMs) % 5);
    data.push({
      timestamp: new Date(bucket).toISOString(),
      total: randomValue,
      labels: [
        { label: "benign", count: Math.floor(randomValue * 0.6) },
        { label: "malicious", count: Math.ceil(randomValue * 0.4) }
      ]
    });
  }

  res.json({
    success: true,
    data
  });
});