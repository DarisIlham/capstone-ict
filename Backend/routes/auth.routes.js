import express from "express";
import { register, login, requestLoginOtp, verifyLoginOtp, requestPasswordResetLink, verifyResetLinkToken, resetPasswordWithLink } from "../controllers/auth.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// Auth routes
router.post("/register", register);
router.post("/login", login);

// Login dengan OTP email (2 langkah)
router.post("/login/request-otp", requestLoginOtp);
router.post("/login/verify-otp", verifyLoginOtp);
// Lupa password via LINK email (token acak, sekali pakai)
router.post("/password/request-link", requestPasswordResetLink);
router.get("/password/verify", verifyResetLinkToken);
router.post("/password/reset", resetPasswordWithLink);

// Protected route example
// router.get("/profile", verifyToken, (req, res) => {
//   res.json({ user: req.user });
// });

export default router;
