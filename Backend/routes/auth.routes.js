import express from "express";
import { register, login, requestLoginOtp, verifyLoginOtp, getLoginApprovalStatus, touchPresenceEndpoint, removePresenceEndpoint, requestPasswordResetLink, verifyResetLinkToken, resetPasswordWithLink } from "../controllers/auth.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// Auth routes
router.post("/register", register);
router.post("/login", login);

// Login dengan OTP email (2 langkah)
router.post("/login/request-otp", requestLoginOtp);
router.post("/login/verify-otp", verifyLoginOtp);
// Status persetujuan admin via Telegram (login di luar jam kerja)
router.get("/login/approval/:id", getLoginApprovalStatus);
// Kehadiran user (heartbeat selama login, untuk /online di bot Telegram)
router.post("/presence/touch", verifyToken, touchPresenceEndpoint);
router.delete("/presence", verifyToken, removePresenceEndpoint);
// Lupa password via LINK email (token acak, sekali pakai)
router.post("/password/request-link", requestPasswordResetLink);
router.get("/password/verify", verifyResetLinkToken);
router.post("/password/reset", resetPasswordWithLink);

// Protected route example
// router.get("/profile", verifyToken, (req, res) => {
//   res.json({ user: req.user });
// });

export default router;
