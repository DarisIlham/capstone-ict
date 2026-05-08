import express from "express";
import { scanWebDefacement } from "../controllers/webDefacementController.js";

const router = express.Router();

router.post("/scan", scanWebDefacement);

export default router;
