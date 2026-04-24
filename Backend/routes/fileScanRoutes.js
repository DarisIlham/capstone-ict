// routes/fileScanRoutes.js
import express from "express";
// PENTING: Wajib menambahkan ekstensi .js pada file lokal (bukan library)
import * as controller from "../controllers/fileScanController.js";

const router = express.Router();

router.get("/", controller.listFileScans);
router.get("/latest", controller.getLatestFileScan);
router.get("/suspicious", controller.listSuspiciousFileScans);
router.get("/errors", controller.listFileScanErrors);
router.get("/stats", controller.getFileScanStats);
router.get("/timeline", controller.getFileScanTimeline);

// Ganti module.exports menjadi export default
export default router;