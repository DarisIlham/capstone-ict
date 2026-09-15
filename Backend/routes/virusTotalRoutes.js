// routes/virusTotalRoutes.js
import express from "express";
import * as controller from "../controllers/virusTotalController.js";

const router = express.Router();

router.get("/report", controller.getFileReport);

export default router;