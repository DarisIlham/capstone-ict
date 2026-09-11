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