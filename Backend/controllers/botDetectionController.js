// controllers/botDetectionController.js
import asyncHandler from "../utils/asyncHandler.js";
import * as botDetectionService from "../services/botDetectionService.js";

export const getSummary = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getSummary(req.query);
  res.json({ success: true, data });
});

export const getTrend = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getTrend(req.query);
  res.json({ success: true, data });
});

export const getDistribution = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getDistribution(req.query);
  res.json({ success: true, data });
});

export const getTopSources = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getTopSources(req.query);
  res.json({ success: true, data });
});

export const getTopDestinations = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getTopDestinations(req.query);
  res.json({ success: true, data });
});

export const getTopAgents = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getTopAgents(req.query);
  res.json({ success: true, data });
});

export const getProbability = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getProbability(req.query);
  res.json({ success: true, data });
});

export const getBehaviorSummary = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getBehaviorSummary(req.query);
  res.json({ success: true, data });
});

export const getTraffic = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getTraffic(req.query);
  res.json({ success: true, data });
});

export const getTrafficTimeline = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getTrafficTimeline(req.query);
  res.json({ success: true, data });
});

export const listAlerts = asyncHandler(async (req, res) => {
  const result = await botDetectionService.listAlerts(req.query);
  res.json({ success: true, ...result });
});

export const getAlertDetail = asyncHandler(async (req, res) => {
  const data = await botDetectionService.getAlertDetail(req.query.index, req.query.id);
  res.json({ success: true, data });
});
