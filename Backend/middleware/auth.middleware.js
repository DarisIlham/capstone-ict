import jwt from "jsonwebtoken";
import pool from "../config/pg.js";

export const verifyToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "No token, authorization denied" });
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    if (!decoded) {
      return res.status(401).json({ message: "Invalid token format" });
    }

    const userId = decoded.userId || decoded.id;
    const userEmail = decoded.email;

    if (!userId && !userEmail) {
      return res.status(401).json({ message: "Invalid token format" });
    }

    // Support legacy tokens that only stored email without userId.
    const q = userId
      ? 'SELECT * FROM users WHERE id = $1 LIMIT 1'
      : 'SELECT * FROM users WHERE email = $1 LIMIT 1';
    const r = await pool.query(q, [userId || userEmail]);
    if (!r || !r.rows || r.rows.length === 0) {
      return res.status(401).json({ message: "User not found" });
    }
    const row = r.rows[0];
    const user = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
    };
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token has expired" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Middleware untuk mengecek apakah user memiliki role tertentu
 * @param {string|string[]} allowedRoles - Role yang diperbolehkan
 * @returns {Function} Middleware function
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Hanya ${roles.join(", ")} yang dapat mengakses endpoint ini`,
      });
    }

    next();
  };
};
