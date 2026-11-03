import rateLimit from "express-rate-limit";

const enabled = process.env.RATE_LIMIT_ENABLED !== "0";

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => !enabled,
    handler: (req, res) => {
      res.status(429).json({ success: false, message });
    },
  });
}

export const authLimiter = createLimiter({
  windowMs: numberEnv("RATE_LIMIT_AUTH_WINDOW_MS", 15 * 60 * 1000),
  max: numberEnv("RATE_LIMIT_AUTH_MAX", 10),
  message: "Too many authentication attempts. Please try again later.",
});

export const otpRequestLimiter = createLimiter({
  windowMs: numberEnv("RATE_LIMIT_OTP_WINDOW_MS", 15 * 60 * 1000),
  max: numberEnv("RATE_LIMIT_OTP_MAX", 5),
  message: "Too many OTP requests. Please try again later.",
});

export const passwordResetRequestLimiter = createLimiter({
  windowMs: numberEnv("RATE_LIMIT_RESET_WINDOW_MS", 60 * 60 * 1000),
  max: numberEnv("RATE_LIMIT_RESET_MAX", 5),
  message: "Too many password reset requests. Please try again later.",
});

export const passwordResetVerifyLimiter = createLimiter({
  windowMs: numberEnv("RATE_LIMIT_RESET_VERIFY_WINDOW_MS", 60 * 60 * 1000),
  max: numberEnv("RATE_LIMIT_RESET_VERIFY_MAX", 30),
  message: "Too many password reset attempts. Please try again later.",
});

export const dataLimiter = createLimiter({
  windowMs: numberEnv("RATE_LIMIT_DATA_WINDOW_MS", 60 * 1000),
  max: numberEnv("RATE_LIMIT_DATA_MAX", 1000),
  message: "Too many requests. Please slow down.",
});
