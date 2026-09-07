import { useState, useEffect, useRef } from "react";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import ThemeToggle from "../components/ThemeToggle";
import logo from "../assets/Undip.svg";
import { API_BASE_URL } from "../config/Api";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const { theme } = useTheme();
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

  // Redirect jika sudah login
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const sanitizeInput = (value) => {
    return value.replace(/<[^>]*>?/gm, "").replace(/[<>{}[\]()&^%$#!]/g, "");
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
        message: "Please verify the CAPTCHA first",
        type: "error",
      });
      return;
    }

    if (!email || !password) {
      setNotification({
        show: true,
        message: "Email and password are required",
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
        throw new Error(errorData.message || "Sign in failed");
      }

      const data = await res.json();

      // Use AuthContext to log in
      login(data.token, data.user);

      setNotification({
        show: true,
        message: "Login successful! Redirecting to dashboard...",
        type: "success",
      });

      setTimeout(() => {
        navigate("/");
      }, 1500);
    } catch (error) {
      setNotification({
        show: true,
        message: error.message || "An error occurred while signing in",
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

  useEffect(() => {
    setIsRecaptchaFilled(false);
    recaptchaRef.current?.reset?.();
  }, [theme]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl"></div>
      <ThemeToggle compact className="absolute right-4 top-4 z-20" />

      <div className="w-fit max-w-sm relative z-10">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center h-14 w-14 mb-2">
            <img src={logo} alt="Logo" className="h-14 w-14 object-contain" />
          </div>
          <h1 className="text-lg font-bold text-white mb-0.5">
            Security Dashboard
          </h1>
          <p className="text-slate-400 text-[11px]">
            Security Monitoring & File Integrity System
          </p>
        </div>

        {/* Notification */}
        {notification.show && (
          <div
            className={`mb-4 px-3 py-2 rounded-lg flex items-center gap-2.5 text-xs font-medium transition-all duration-300 ${
              notification.type === "success"
                ? "bg-green-500/20 text-green-300 border border-green-500/30"
                : "bg-red-500/20 text-red-300 border border-red-500/30"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-slate-800/50 backdrop-blur-xl rounded-lg border border-slate-700/50 p-5 space-y-3.5 shadow-2xl"
        >
          {/* Email Field */}
          <div>
            <label className="block text-[16px] font-medium text-slate-300 mb-1">
              Email or Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={handleEmailChange}
                disabled={isLoading}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-md text-xs placeholder:text-[15px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-[16px] font-medium text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="off"
                value={password}
                onChange={handlePasswordChange}
                disabled={isLoading}
                className="w-full pl-9 pr-9 py-1.5 bg-slate-700/50 border border-slate-600 rounded-md text-xs placeholder:text-[15px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-3 top-2 text-white hover:text-slate-200"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* CAPTCHA */}
          <div className="bg-slate-700/30 p-2 rounded-md border border-slate-600/50">
            <ReCAPTCHA
              key={theme}
              ref={recaptchaRef}
              sitekey="6Le7BYksAAAAAASn99_SYX6OAX7r8siw5H8m_YWr"
              onChange={handleRecaptchaChange}
              theme={theme}
            />
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={!isRecaptchaFilled || isLoading}
            className={`w-full flex justify-center items-center gap-1.5 py-1.5 px-4 rounded-md text-xs font-semibold transition-all duration-200 ${
              isRecaptchaFilled && !isLoading
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg hover:shadow-cyan-500/50"
                : "bg-slate-600 text-slate-400 cursor-not-allowed opacity-50"
            }`}
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <LogIn className="h-3.5 w-3.5" />
                <span>Sign In</span>
              </>
            )}
          </button>

          {/* Security Info */}
          <div className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-700">
            🔒 Protected with end-to-end encryption & CAPTCHA verification
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;