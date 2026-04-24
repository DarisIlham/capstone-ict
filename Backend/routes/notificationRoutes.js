import express from "express";
import { listNotifications } from "../controllers/notificationController.js";
import { verifyToken, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);
router.use(requireRole("admin"));

router.get("/", listNotifications);

export default router;
