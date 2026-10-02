// routes/botDetectionRoutes.js
import express from "express";
import * as controller from "../controllers/botDetectionController.js";

const router = express.Router();

router.get("/summary", controller.getSummary);
router.get("/trend", controller.getTrend);
router.get("/distribution", controller.getDistribution);
router.get("/top-sources", controller.getTopSources);
router.get("/top-destinations", controller.getTopDestinations);
router.get("/top-agents", controller.getTopAgents);
router.get("/probability", controller.getProbability);
router.get("/behavior-summary", controller.getBehaviorSummary);
router.get("/traffic", controller.getTraffic);
router.get("/traffic-timeline", controller.getTrafficTimeline);
router.get("/alerts", controller.listAlerts);
router.get("/detail", controller.getAlertDetail);

export default router;
