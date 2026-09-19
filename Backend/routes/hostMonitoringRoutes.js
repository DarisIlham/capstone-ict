// routes/hostMonitoringRoutes.js
import express from "express";
import * as controller from "../controllers/hostMonitoringController.js";

const router = express.Router();

router.get("/", controller.listHosts);
router.get("/stats", controller.getHostStats);
router.get("/timeline", controller.getHostTimeline);
router.get("/top-processes", controller.getTopProcesses);
router.get("/top-agents", controller.getTopAgents);
router.get("/top-sessions", controller.getTopSessions);
router.get("/alerts", controller.getRecentAlerts);

export default router;
