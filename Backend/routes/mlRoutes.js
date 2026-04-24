// routes/mlRoutes.js
import express from "express";
// PENTING: Wajib menambahkan ekstensi .js pada file lokal
import * as controller from "../controllers/mlController.js";

const router = express.Router();

router.get("/predictions", controller.listPredictions);
router.get("/predictions/latest", controller.getLatestPrediction);
router.get("/predictions/stats", controller.getPredictionStats);
router.get("/predictions/timeline", controller.getPredictionTimeline);
router.get("/predictions/timeline-mock", controller.getPredictionTimelineMock);

// Ganti module.exports menjadi export default
export default router;