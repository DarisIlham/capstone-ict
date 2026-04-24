import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import { createAdminLoginNotification } from "../services/notificationService.js";

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
    throw new Error("CAPTCHA token tidak ditemukan");
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
      throw new Error("CAPTCHA verification gagal. Kemungkinan bot terdeteksi.");
    }

    return true;
  } catch (error) {
    console.error("CAPTCHA verification error:", error.message);
    throw new Error("Gagal memverifikasi CAPTCHA: " + error.message);
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
        message: "Email, password, dan nama harus diisi",
      });
    }

    // Verifikasi CAPTCHA
    if (captchaToken) {
      await verifyCaptcha(captchaToken);
    }

    // Cek apakah user sudah ada
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Set default role to "admin" untuk backward compatibility
    const userRole = role && ["admin", "user"].includes(role) ? role : "admin";

    // Buat user baru
    const newUser = new User({
      email,
      password: hashedPassword,
      name,
      role: userRole,
      status: "active",
    });

    const savedUser = await newUser.save();

    // Generate JWT Token
    const token = jwt.sign(
      {
        userId: savedUser._id,
        email: savedUser.email,
        role: savedUser.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      {
        expiresIn: "7d",
      }
    );

    res.status(201).json({
      success: true,
      message: "Registrasi berhasil",
      token,
      user: {
        id: savedUser._id,
        email: savedUser.email,
        name: savedUser.name,
        role: savedUser.role,
        status: savedUser.status,
      },
    });
  } catch (error) {
    console.error("Register error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Terjadi kesalahan saat registrasi",
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
        message: "Email dan password harus diisi",
      });
    }

    // Verifikasi CAPTCHA sebelum login
    try {
      await verifyCaptcha(captchaToken);
    } catch (captchaError) {
      return res.status(403).json({
        success: false,
        message: "CAPTCHA verification gagal. Silakan coba lagi.",
        isCaptchaError: true,
      });
    }

    // Cari user berdasarkan email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    // Verifikasi password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    // Check pending status
    if (user.status === "pending" && user.pendingUntil) {
      const now = new Date();
      const pendingUntil = new Date(user.pendingUntil);

      if (now < pendingUntil) {
        // Still pending
        const remainingTime = Math.ceil((pendingUntil - now) / 1000 / 60); // dalam menit
        return res.status(403).json({
          success: false,
          message: `Akun sedang dipending sampai ${pendingUntil.toLocaleString("id-ID")} (${remainingTime} menit lagi)`,
          isPending: true,
          pendingUntil: pendingUntil.toISOString(),
        });
      } else {
        // Pending time has passed, auto-update status to active
        user.status = "active";
        user.pendingUntil = null;
        await user.save();
      }
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        userId: user._id,
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
        console.error("Gagal menyimpan notifikasi login admin:", notificationError.message);
      });
    }

    res.status(200).json({
      success: true,
      message: "Login berhasil",
      token,
      user: {
        id: user._id,
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
      message: error.message || "Terjadi kesalahan saat login",
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
    throw new Error("Token tidak valid");
  }
};
