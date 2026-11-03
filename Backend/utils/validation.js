const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

export function normalizeEmail(value) {
  return String(value ?? "").trim();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || CONTROL_CHARS.test(email)) return false;
  return EMAIL_PATTERN.test(email);
}

export function assertSafeEmail(value, label = "email") {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) {
    throw new Error(`Invalid ${label} format`);
  }
  return email;
}

export function assertSafeHeaderValue(value, label = "header") {
  const text = String(value ?? "");
  if (CONTROL_CHARS.test(text)) {
    throw new Error(`Invalid ${label}`);
  }
  return text;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function validatePassword(password, { minLength = 8, maxLength = 128 } = {}) {
  if (typeof password !== "string" || password.length < minLength) {
    return { ok: false, message: `Password must be at least ${minLength} characters` };
  }
  if (password.length > maxLength) {
    return { ok: false, message: `Password must be at most ${maxLength} characters` };
  }
  return { ok: true };
}

const SAFE_ERROR_MESSAGES = new Set([
  "Email already registered",
  "Role must be 'admin' or 'user'",
  "User not found",
  "Name, email, and password are required",
  "User ID is required",
  "Role is required",
  "Duration must be a positive number (in minutes)",
  "Email, password, and name are required",
  "Email and password are required",
  "Invalid email format",
  "Password must be at least 8 characters",
  "Password must be at most 128 characters",
  "Token tidak valid",
  "Link reset tidak valid atau sudah dipakai",
  "Link reset sudah kedaluwarsa. Minta link baru.",
  "Kode OTP tidak ditemukan. Minta kode baru.",
  "Kode OTP sudah dipakai. Minta kode baru.",
  "Kode OTP kedaluwarsa. Minta kode baru.",
  "Terlalu banyak percobaan. Minta kode baru.",
  "Kode OTP salah. Minta kode baru.",
]);

const SAFE_ERROR_PATTERNS = [/^Kode OTP salah\. Sisa percobaan: \d+\.$/];

export function safeErrorMessage(error, fallback) {
  const message = String(error?.message || "");
  if (SAFE_ERROR_MESSAGES.has(message)) return message;
  if (SAFE_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return message;
  return fallback;
}
