import express from "express";
import {
  createUser,
  getUsers,
  getUserDetail,
  removeUser,
  suspendUser,
  restoreUser,
  changeUserRole,
} from "../controllers/userController.js";
import { verifyToken, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// All routes require admin role
router.use(requireRole("admin"));

// User management routes
router.post("/", createUser); // Create new user
router.get("/", getUsers); // Get all users with pagination
router.get("/:userId", getUserDetail); // Get user detail
router.delete("/:userId", removeUser); // Delete user
router.post("/:userId/suspend", suspendUser); // Suspend user for 2 hours
router.post("/:userId/restore", restoreUser); // Restore user from pending
router.put("/:userId/role", changeUserRole); // Change user role

export default router;
