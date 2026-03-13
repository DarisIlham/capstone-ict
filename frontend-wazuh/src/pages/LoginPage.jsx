import { useState, useEffect, useRef } from "react";
import { User, Lock, Eye, EyeOff, LogIn, AlertCircle, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import { useAuth } from "../hooks/useAuth";
import logo from "../assets/Undip.svg";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const recaptchaRef = useRef();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isRecaptchaFilled, setIsRecaptchaFilled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "error",
  });

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

  // Redirect jika sudah login
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const sanitizeInput = (value) => {
    return value
      .replace(/<[^>]*>?/gm, "")
      .replace(/[<>{}[\]()*&^%$#!]/g, "");
  };

  const handleEmailChange = (e) => {
    setEmail(sanitizeInput(e.target.value));
  };

  const handlePasswordChange = (e) => {
    setPassword(sanitizeInput(e.target.value));
  };

  const handleRecaptchaChange = (value) => {
    setIsRecaptchaFilled(!!value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNotification({ show: false, message: "", type: "error" });

    if (!isRecaptchaFilled) {
      setNotification({
        show: true,
        message: "Silakan verifikasi CAPTCHA terlebih dahulu",
        type: "error",
      });
      return;
    }

    if (!email || !password) {
      setNotification({
        show: true,
        message: "Email dan password harus diisi",
        type: "error",
      });
      return;
    }

    try {
      setIsLoading(true);
      const captchaToken = recaptchaRef.current.getValue();

      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          captchaToken,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Gagal masuk");
      }

      const data = await res.json();

      // Gunakan AuthContext untuk login
      login(data.token, data.user);

      setNotification({
        show: true,
        message: "Login berhasil! Mengarahkan ke dashboard...",
        type: "success",
      });

      setTimeout(() => {
        navigate("/");
      }, 1500);
    } catch (error) {
      setNotification({
        show: true,
        message: error.message || "Terjadi kesalahan saat login",
        type: "error",
      });
      recaptchaRef.current.reset();
      setIsRecaptchaFilled(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification({ show: false, message: "", type: "error" });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl"></div>

      <div className="max-w-sm w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg mb-4">
            <img src={logo} alt="Logo" className="h-10 w-10 object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm">Sistem Monitoring Security & File Integrity</p>
        </div>

        {/* Notification */}
        {notification.show && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-all duration-300 ${
              notification.type === "success"
                ? "bg-green-500/20 text-green-300 border border-green-500/30"
                : "bg-red-500/20 text-red-300 border border-red-500/30"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 space-y-5 shadow-2xl"
        >
          {/* Email Field */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Email atau Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={handleEmailChange}
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="off"
                value={password}
                onChange={handlePasswordChange}
                disabled={isLoading}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="Masukkan password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-300"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* CAPTCHA */}
          <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-600/50">
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey="6LcHa5ErAAAAAHyY4DLCyK3fVNgpl_-rIY19PvzL"
              onChange={handleRecaptchaChange}
              theme="dark"
            />
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={!isRecaptchaFilled || isLoading}
            className={`w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-lg font-semibold transition-all duration-200 ${
              isRecaptchaFilled && !isLoading
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg hover:shadow-cyan-500/50"
                : "bg-slate-600 text-slate-400 cursor-not-allowed opacity-50"
            }`}
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <LogIn className="h-5 w-5" />
                <span>Login Aman</span>
              </>
            )}
          </button>

          {/* Security Info */}
          <div className="text-xs text-slate-400 text-center pt-2 border-t border-slate-700">
            🔒 Dilindungi dengan enkripsi end-to-end & CAPTCHA verification
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
