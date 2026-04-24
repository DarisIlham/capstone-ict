// routes/linuxCommandRoutes.js
import express from "express";
// PENTING: Wajib menambahkan ekstensi .js pada file lokal
import * as controller from "../controllers/linuxCommandController.js";

const router = express.Router();

router.get("/", controller.listLinuxCommands);
router.get("/latest", controller.getLatestLinuxCommand);
router.get("/suspicious", controller.listSuspiciousLinuxCommands);
router.get("/stats", controller.getLinuxCommandStats);
router.get("/timeline", controller.getLinuxCommandTimeline);

// Ganti module.exports menjadi export default
export default router;