// controllers/hostMonitoringController.js
import asyncHandler from "../utils/asyncHandler.js";
import * as hostMonitoringService from "../services/hostMonitoringService.js";

export const listHosts = asyncHandler(async (req, res) => {
  const result = await hostMonitoringService.listHosts(req.query);
  res.json({ success: true, ...result });
});

export const getHostStats = asyncHandler(async (req, res) => {
  const data = await hostMonitoringService.getHostStats(req.query);
  res.json({ success: true, data });
});

export const getHostTimeline = asyncHandler(async (req, res) => {
  const data = await hostMonitoringService.getHostTimeline(req.query);
  res.json({ success: true, data });
});

export const getTopProcesses = asyncHandler(async (req, res) => {
  const data = await hostMonitoringService.getTopProcesses(req.query);
  res.json({ success: true, data });
});

export const getTopAgents = asyncHandler(async (req, res) => {
  const data = await hostMonitoringService.getTopAgents(req.query);
  res.json({ success: true, data });
});

export const getTopSessions = asyncHandler(async (req, res) => {
  const data = await hostMonitoringService.getTopSessions(req.query);
  res.json({ success: true, data });
});

export const getRecentAlerts = asyncHandler(async (req, res) => {
  const data = await hostMonitoringService.getRecentAlerts(req.query);
  res.json({ success: true, data });
});
