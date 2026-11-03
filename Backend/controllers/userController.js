import {
  addUser,
  deleteUser,
  pendingUser,
  unpendingUser,
  getAllUsers,
  getUserById,
  updateUserRole,
} from "../services/userService.js";
import { isValidEmail, normalizeEmail, safeErrorMessage, validatePassword } from "../utils/validation.js";
import { auditLog } from "../services/auditLogService.js";

/**
 * Create new user (admin only)
 */
export const createUser = async (req, res) => {
  try {
    const { name, password, role } = req.body || {};
    const email = normalizeEmail(req.body?.email);

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
      return res.status(400).json({ success: false, message: passwordCheck.message });
    }

    const result = await addUser(name, email, password, role || "user");
    auditLog({
      action: "user.create",
      actor: req.user,
      target: { id: result.user?.id, email: result.user?.email },
      ip: req.ip,
      details: { role: result.user?.role },
    });
    res.status(201).json(result);
  } catch (error) {
    console.error("Create user error:", error.message);
    res.status(400).json({
      success: false,
      message: safeErrorMessage(error, "Failed to create user"),
    });
  }
};

/**
 * Get all users (admin only)
 */
export const getUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const result = await getAllUsers(page, limit);
    res.status(200).json(result);
  } catch (error) {
    console.error("Get users error:", error.message);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error, "Failed to retrieve users"),
    });
  }
};

/**
 * Get user by id (admin only)
 */
export const getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await getUserById(userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Get user detail error:", error.message);
    res.status(404).json({
      success: false,
      message: safeErrorMessage(error, "User not found"),
    });
  }
};

/**
 * Delete user (admin only)
 */
export const removeUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await deleteUser(userId);
    auditLog({
      action: "user.delete",
      actor: req.user,
      target: { id: userId },
      ip: req.ip,
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("Delete user error:", error.message);
    res.status(400).json({
      success: false,
      message: safeErrorMessage(error, "Failed to delete user"),
    });
  }
};

/**
 * Set user to pending status for 2 hours (admin only)
 * @param {number} durationMinutes - Duration in minutes (default: 120)
 */
export const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { durationMinutes = 120 } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await pendingUser(userId, durationMinutes);
    auditLog({
      action: "user.suspend",
      actor: req.user,
      target: { id: userId },
      ip: req.ip,
      details: { durationMinutes },
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("Suspend user error:", error.message);
    res.status(400).json({
      success: false,
      message: safeErrorMessage(error, "Failed to suspend user"),
    });
  }
};

/**
 * Restore user from pending status (admin only)
 */
export const restoreUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await unpendingUser(userId);
    auditLog({
      action: "user.restore",
      actor: req.user,
      target: { id: userId },
      ip: req.ip,
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("Restore user error:", error.message);
    res.status(400).json({
      success: false,
      message: safeErrorMessage(error, "Failed to restore user"),
    });
  }
};

/**
 * Update user role (admin only)
 */
export const changeUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required",
      });
    }

    const result = await updateUserRole(userId, role);
    auditLog({
      action: "user.role_change",
      actor: req.user,
      target: { id: userId },
      ip: req.ip,
      details: { role },
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("Change user role error:", error.message);
    res.status(400).json({
      success: false,
      message: safeErrorMessage(error, "Failed to change user role"),
    });
  }
};
