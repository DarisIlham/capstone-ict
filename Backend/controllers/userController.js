import {
  addUser,
  deleteUser,
  pendingUser,
  unpendingUser,
  getAllUsers,
  getUserById,
  updateUserRole,
} from "../services/userService.js";

/**
 * Create new user (admin only)
 */
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validasi input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama, email, dan password harus diisi",
      });
    }

    const result = await addUser(name, email, password, role || "user");
    res.status(201).json(result);
  } catch (error) {
    console.error("Create user error:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get all users (admin only)
 */
export const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const result = await getAllUsers(parseInt(page), parseInt(limit));
    res.status(200).json(result);
  } catch (error) {
    console.error("Get users error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
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
      message: error.message,
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
        message: "User ID harus diisi",
      });
    }

    const result = await deleteUser(userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Delete user error:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
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
        message: "User ID harus diisi",
      });
    }

    const result = await pendingUser(userId, durationMinutes);
    res.status(200).json(result);
  } catch (error) {
    console.error("Suspend user error:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
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
        message: "User ID harus diisi",
      });
    }

    const result = await unpendingUser(userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Restore user error:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
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
        message: "User ID harus diisi",
      });
    }

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role harus diisi",
      });
    }

    const result = await updateUserRole(userId, role);
    res.status(200).json(result);
  } catch (error) {
    console.error("Change user role error:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
