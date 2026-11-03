import express from "express";
import { register, login, requestLoginOtp, verifyLoginOtp, getLoginApprovalStatus, touchPresenceEndpoint, removePresenceEndpoint, requestPasswordResetLink, verifyResetLinkToken, resetPasswordWithLink } from "../controllers/auth.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { authLimiter, otpRequestLimiter, passwordResetRequestLimiter, passwordResetVerifyLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

// Auth routes
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

// Login dengan OTP email (2 langkah)
router.post("/login/request-otp", otpRequestLimiter, requestLoginOtp);
router.post("/login/verify-otp", authLimiter, verifyLoginOtp);
// Status persetujuan admin via Telegram (login di luar jam kerja)
router.get("/login/approval/:id", getLoginApprovalStatus);
// Kehadiran user (heartbeat selama login, untuk /online di bot Telegram)
router.post("/presence/touch", verifyToken, touchPresenceEndpoint);
router.delete("/presence", verifyToken, removePresenceEndpoint);
// Lupa password via LINK email (token acak, sekali pakai)
router.post("/password/request-link", passwordResetRequestLimiter, requestPasswordResetLink);
router.get("/password/verify", passwordResetVerifyLimiter, verifyResetLinkToken);
router.post("/password/reset", passwordResetVerifyLimiter, resetPasswordWithLink);

// Protected route example
// router.get("/profile", verifyToken, (req, res) => {
//   res.json({ user: req.user });
// });

export default router;
