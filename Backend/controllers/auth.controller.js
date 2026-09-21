import pool from "../config/pg.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import { createAdminLoginNotification } from "../services/notificationService.js";
import { sendOtpEmail } from "../services/mailerService.js";
import {
  createOtp,
  verifyOtp,
  maskEmail,
  OTP_EXPIRES_MINUTES,
} from "../services/otpService.js";
import {
  createResetToken,
  checkResetToken,
  consumeResetToken,
  RESET_TOKEN_EXPIRES_MINUTES,
} from "../services/passwordResetService.js";
import { sendPasswordResetEmail } from "../services/mailerService.js";

// CAPTCHA Secret Key (dari Google reCAPTCHA)
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || "6Le7BYksAAAAALvjFetSf9GJ7xEy_r3BDux3rbly";

/**
 * Verifikasi CAPTCHA dengan Google reCAPTCHA
 */
const verifyCaptcha = async (captchaToken) => {
  // Development MODE: bypass CAPTCHA if token is dummy/test
  if (process.env.NODE_ENV === "development" || captchaToken === "skip-captcha") {
    console.log("   CAPTCHA skipped (development mode)");
    return true;
  }

  if (!captchaToken) {
    throw new Error("CAPTCHA token not found");
  }

  try {
    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: RECAPTCHA_SECRET_KEY,
          response: captchaToken,
        },
      }
    );

    const { success, score } = response.data;

    // success=true dan score > 0.5 menandakan CAPTCHA valid
    if (!success || score < 0.5) {
      throw new Error("CAPTCHA verification failed. Possibly a bot was detected.");
    }

    return true;
  } catch (error) {
    console.error("CAPTCHA verification error:", error.message);
    throw new Error("Failed to verify CAPTCHA: " + error.message);
  }
};

/**
 * Register: Membuat akun admin baru
 */
export const register = async (req, res) => {
  try {
    const { email, password, name, captchaToken, role } = req.body;

    // Validasi input
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: "Email, password, and name are required",
      });
    }

    // Verifikasi CAPTCHA
    if (captchaToken) {
      await verifyCaptcha(captchaToken);
    }

    // Cek apakah user sudah ada (Postgres)
    const qCheck = 'SELECT id FROM users WHERE email = $1 LIMIT 1';
    const rCheck = await pool.query(qCheck, [email]);
    if (rCheck && rCheck.rows && rCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Set default role to "admin" untuk backward compatibility
    const userRole = role && ["admin", "user"].includes(role) ? role : "admin";

    // Buat user baru di PostgreSQL
    const qInsert = `INSERT INTO users (email, password, name, role, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *`;
    const rInsert = await pool.query(qInsert, [email, hashedPassword, name, userRole, 'active']);
    const savedRow = rInsert.rows[0];

    // Generate JWT Token
    const token = jwt.sign(
      {
        userId: savedRow.id,
        email: savedRow.email,
        role: savedRow.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      {
        expiresIn: "7d",
      }
    );

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: savedRow.id,
        email: savedRow.email,
        name: savedRow.name,
        role: savedRow.role,
        status: savedRow.status,
      },
    });
  } catch (error) {
    console.error("Register error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred during registration",
    });
  }
};

/**
 * Login: Verifikasi kredensial dan return JWT token
 */
export const login = async (req, res) => {
  try {
    const { email, password, captchaToken } = req.body;

    // Validasi input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Verifikasi CAPTCHA sebelum login
    try {
      await verifyCaptcha(captchaToken);
    } catch (captchaError) {
      return res.status(403).json({
        success: false,
        message: "CAPTCHA verification failed. Please try again.",
        isCaptchaError: true,
      });
    }

    // Cari user berdasarkan email
    // PostgreSQL: gunakan pool untuk query tabel users
    const q = 'SELECT * FROM users WHERE email = $1 LIMIT 1';
    const result = await pool.query(q, [email]);
    if (!result || !result.rows || result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Incorrect email or password" });
    }
    // map row to user object
    const row = result.rows[0];
    const user = {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name || null,
      role: row.role || 'user',
      status: row.status || 'active',
      pendingUntil: row.pending_until || null,
    };

    // Auto-upgrade: if stored password is plaintext (not bcrypt), verify equality
    const looksLikeBcrypt = (p) => typeof p === 'string' && /^\$2[aby]\$/.test(p);
    if (!looksLikeBcrypt(user.password)) {
      // stored password appears plaintext
      if (String(password) === String(user.password)) {
        // hash and update DB, then replace in-memory so bcrypt.compare works below
        const newHash = await bcrypt.hash(String(password), 10);
        try {
          await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [newHash, user.id]);
        } catch (e) {
          if (/updated_at/.test(String(e.message || ''))) {
            await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newHash, user.id]);
          } else {
            console.error('Failed to update password hash for user', user.id, e.message || e);
          }
        }
        user.password = newHash;
      } else {
return res.status(401).json({ success: false, message: "Incorrect email or password" });
      }
    }

    // Verifikasi password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password",
      });
    }

    // Check pending status
    if (user.status === "pending" && user.pendingUntil) {
      const now = new Date();
      const pendingUntil = new Date(user.pendingUntil);

      if (now < pendingUntil) {
        // Still pending
        const remainingTime = Math.ceil((pendingUntil - now) / 1000 / 60); // in minutes
        return res.status(403).json({
          success: false,
          message: `This account is pending until ${pendingUntil.toLocaleString("en-US")} (${remainingTime} minutes remaining)`,
          isPending: true,
          pendingUntil: pendingUntil.toISOString(),
        });
      } else {
          // Pending time has passed, auto-update status to active
            user.status = "active";
            user.pendingUntil = null;
            try {
              await pool.query(
                'UPDATE users SET status = $1, pending_until = $2, updated_at = NOW() WHERE id = $3',
                ['active', null, user.id]
              );
            } catch (pgUpdateErr) {
              console.error('Failed to update user status in Postgres:', pgUpdateErr.message);
            }
      }
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      {
        expiresIn: "7d",
      }
    );

    if (user.role === "admin") {
      createAdminLoginNotification({
        name: user.name,
        email: user.email,
      }).catch((notificationError) => {
        console.error("Failed to save admin login notification:", notificationError.message);
      });
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred during login",
    });
  }
};

/**
 * Verify Token: Fungsi helper untuk middleware
 */
export const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );
    return decoded;
  } catch (error) {
    throw new Error("Invalid token");
  }
};

/**
 * Validasi kredensial untuk alur OTP (captcha + user + password + pending).
 * Mengembalikan user bila valid, melempar Error {status, message} bila tidak.
 */
async function validateCredentialsForOtp(email, password, captchaToken) {
  if (!email || !password) {
    const err = new Error("Email and password are required");
    err.status = 400;
    throw err;
  }

  try {
    await verifyCaptcha(captchaToken);
  } catch {
    const err = new Error("CAPTCHA verification failed. Please try again.");
    err.status = 403;
    throw err;
  }

  const result = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [email]);
  if (!result || !result.rows || result.rows.length === 0) {
    const err = new Error("Incorrect email or password");
    err.status = 401;
    throw err;
  }

  const row = result.rows[0];
  const user = {
    id: row.id,
    email: row.email,
    password: row.password,
    name: row.name || null,
    role: row.role || "user",
    status: row.status || "active",
    pendingUntil: row.pending_until || null,
  };

  const looksLikeBcrypt = (p) => typeof p === "string" && /^\$2[aby]\$/.test(p);
  if (!looksLikeBcrypt(user.password)) {
    if (String(password) !== String(user.password)) {
      const err = new Error("Incorrect email or password");
      err.status = 401;
      throw err;
    }
    user.password = await bcrypt.hash(String(password), 10);
    try {
      await pool.query("UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2", [user.password, user.id]);
    } catch {
      await pool.query("UPDATE users SET password = $1 WHERE id = $2", [user.password, user.id]);
    }
  } else {
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      const err = new Error("Incorrect email or password");
      err.status = 401;
      throw err;
    }
  }

  if (user.status === "pending" && user.pendingUntil) {
    const now = new Date();
    const pendingUntil = new Date(user.pendingUntil);
    if (now < pendingUntil) {
      const remainingTime = Math.ceil((pendingUntil - now) / 1000 / 60);
      const err = new Error(
        `This account is pending until ${pendingUntil.toLocaleString("en-US")} (${remainingTime} minutes remaining)`
      );
      err.status = 403;
      throw err;
    }
    user.status = "active";
    user.pendingUntil = null;
    try {
      await pool.query("UPDATE users SET status = $1, pending_until = $2, updated_at = NOW() WHERE id = $3", ["active", null, user.id]);
    } catch (e) {
      console.error("Failed to update user status in Postgres:", e.message);
    }
  }

  return user;
}

/**
 * Langkah 1 login OTP: validasi kredensial lalu kirim kode OTP ke email.
 * POST /api/auth/login/request-otp { email, password, captchaToken }
 */
export const requestLoginOtp = async (req, res) => {
  try {
    const { email, password, captchaToken } = req.body || {};
    console.log(`[otp] request-otp diterima untuk ${maskEmail(email || "")}`);
    const user = await validateCredentialsForOtp(email, password, captchaToken);

    const { otpId, code } = await createOtp(user.id, user.email);
    console.log(`[otp] kode dibuat otpId=${otpId}, mengirim email...`);

    const isDev = process.env.NODE_ENV === "development";

    // Kirim email OTP. Kode TIDAK pernah dikirim lewat API — verifikasi
    // wajib lewat email. Kalau SMTP gagal, langsung error jelas (tanpa
    // membocorkan kode) supaya tombol tidak berputar lama.
    let mailError = null;
    try {
      await sendOtpEmail({
        to: user.email,
        name: user.name,
        code,
        expiresMinutes: OTP_EXPIRES_MINUTES,
      });
    } catch (error) {
      console.error("OTP email failed:", error.message);
      mailError = error;
    }

    if (mailError) {
      return res.status(502).json({
        success: false,
        message:
          mailError.message && mailError.message.includes("SMTP")
            ? mailError.message
            : "Gagal mengirim email OTP. Periksa konfigurasi SMTP server. (SMTP_USER dan SMTP_PASS harus Gmail App Password 16 karakter tanpa spasi)",
      });
    }

    console.log(`[otp] email terkirim otpId=${otpId}`);
    res.status(200).json({
      success: true,
      message: `Kode OTP telah dikirim ke ${maskEmail(user.email)}`,
      otpId,
      email: maskEmail(user.email),
      expiresIn: OTP_EXPIRES_MINUTES * 60,
    });
  } catch (error) {
    console.error("Request OTP error:", error.message);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "An error occurred while requesting OTP",
    });
  }
};

/**
 * Lupa password via LINK (tanpa captcha, sesuai desain UI): proteksi mengandalkan
 * token acak ke email (60 mnt, sekali pakai). Pasang rate-limit di reverse proxy
 * bila dibuka ke publik.
 * POST /api/auth/password/request-link { email }
 */
export const requestPasswordResetLink = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, message: "Email wajib diisi" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [email]);
    if (!result || !result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Email tidak terdaftar" });
    }
    const row = result.rows[0];

    const { token } = await createResetToken(row.id);
    const frontendBase = (process.env.FRONTEND_URL || req.headers.origin || "").replace(/\/$/, "");
    const resetUrl = `${frontendBase}/reset-password?token=${token}`;
    try {
      await sendPasswordResetEmail({
        to: row.email,
        name: row.name,
        resetUrl,
        expiresMinutes: RESET_TOKEN_EXPIRES_MINUTES,
      });
    } catch (error) {
      console.error("Reset link email failed:", error.message);
      return res.status(502).json({
        success: false,
        message: "Gagal mengirim email reset. Periksa konfigurasi SMTP server.",
      });
    }

    res.status(200).json({
      success: true,
      message: `Link reset telah dikirim ke ${maskEmail(row.email)}`,
      email: maskEmail(row.email),
    });
  } catch (error) {
    console.error("Request reset link error:", error.message);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "An error occurred while requesting reset link",
    });
  }
};

/**
 * Cek validitas token saat halaman reset dibuka.
 * GET /api/auth/password/verify?token=...
 */
export const verifyResetLinkToken = async (req, res) => {
  try {
    await checkResetToken(req.query?.token);
    res.status(200).json({ success: true, message: "Link valid" });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Link tidak valid",
    });
  }
};

/**
 * Eksekusi reset via link: verifikasi + tandai token dipakai + set password baru.
 * POST /api/auth/password/reset { token, newPassword }
 */
export const resetPasswordWithLink = async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, message: "Token wajib diisi" });
    }
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: "Password baru minimal 6 karakter" });
    }

    const { userId } = await consumeResetToken(token);
    const newHash = await bcrypt.hash(String(newPassword), 10);
    await pool.query("UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2", [newHash, userId]);

    res.status(200).json({ success: true, message: "Password berhasil diubah. Silakan login kembali." });
  } catch (error) {
    console.error("Reset password error:", error.message);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "An error occurred while resetting password",
    });
  }
};

/**
 * Langkah 2 login OTP: verifikasi kode lalu terbitkan JWT.
 * POST /api/auth/login/verify-otp { otpId, code, rememberMe }
 */
export const verifyLoginOtp = async (req, res) => {
  try {
    const { otpId, code, rememberMe } = req.body || {};

    if (!otpId || !code) {
      return res.status(400).json({ success: false, message: "OTP ID dan kode wajib diisi" });
    }
    console.log(`[otp] verify-otp diterima otpId=${otpId} rememberMe=${rememberMe === true}`);

    const { userId } = await verifyOtp(otpId, code);
    console.log(`[otp] kode valid otpId=${otpId}, menerbitkan token...`);

    const result = await pool.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
    if (!result || !result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }
    const row = result.rows[0];

    const token = jwt.sign(
      { userId: row.id, email: row.email, role: row.role || "user" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: rememberMe ? "7d" : "12h" }
    );

    if ((row.role || "user") === "admin") {
      createAdminLoginNotification({ name: row.name, email: row.email }).catch((e) =>
        console.error("Failed to save admin login notification:", e.message)
      );
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: row.id,
        email: row.email,
        name: row.name || null,
        role: row.role || "user",
        status: row.status || "active",
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error.message);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "An error occurred while verifying OTP",
    });
  }
};