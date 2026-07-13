// controllers/linuxCommandController.js

// 1. Ganti require menjadi import dan tambahkan ekstensi .js
import asyncHandler from "../utils/asyncHandler.js";
import * as linuxCommandService from "../services/linuxCommandService.js";

// 2. Ganti exports.namaFungsi menjadi export const namaFungsi
export const listLinuxCommands = asyncHandler(async (req, res) => {
  const result = await linuxCommandService.listLinuxCommands(req.query);

  res.json({
    success: true,
    ...result
  });
});

export const getLatestLinuxCommand = asyncHandler(async (req, res) => {
  const data = await linuxCommandService.getLatestLinuxCommand(req.query);

  if (!data) {
    return res.status(404).json({
      success: false,
      message: "No linux command data found"
    });
  }

  res.json({
    success: true,
    data
  });
});

export const listSuspiciousLinuxCommands = asyncHandler(async (req, res) => {
  const result = await linuxCommandService.listSuspiciousLinuxCommands(req.query);

  res.json({
    success: true,
    ...result
  });
});

export const getLinuxCommandStats = asyncHandler(async (req, res) => {
  const data = await linuxCommandService.getLinuxCommandStats(req.query);

  res.json({
    success: true,
    data
  });
});

export const getLinuxCommandTimeline = asyncHandler(async (req, res) => {
  const data = await linuxCommandService.getLinuxCommandTimeline(req.query);

  res.json({
    success: true,
    data
  });
});
