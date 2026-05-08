import express from "express";
import { scanWebDefacement } from "../controllers/webDefacementController.js";
import {
  addWebDefacementEndpoint,
  getWebDefacementEndpoints,
  removeWebDefacementEndpoint,
} from "../controllers/webDefacementEndpointController.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);

router.get("/endpoints", getWebDefacementEndpoints);
router.post("/endpoints", addWebDefacementEndpoint);
router.delete("/endpoints/:endpointId", removeWebDefacementEndpoint);
router.post("/scan", scanWebDefacement);

export default router;
