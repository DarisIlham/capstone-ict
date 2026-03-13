import express from "express";
import { register, login } from "../controllers/auth.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// Auth routes
router.post("/register", register);
router.post("/login", login);

// Protected route example
// router.get("/profile", verifyToken, (req, res) => {
//   res.json({ user: req.user });
// });

export default router;
