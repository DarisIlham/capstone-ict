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
import logo from "../assets/UndipCyber.png";
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

  // Widget reCAPTCHA hanya di-render sekali saat mount dan tidak mendukung
  // ganti tema saat jalan: mount ulang tertunda setiap theme berubah agar
  // widget selalu muncul dengan tema yang benar. Token lama ikut direset.
  const [captchaKey, setCaptchaKey] = useState(`recaptcha-${theme}`);

  // Captcha scales proportionally with its container (zoom affects layout,
  // so no empty space is left behind). Replaces stepped breakpoint zoom.
  const captchaWrapRef = useRef(null);
  const [captchaZoom, setCaptchaZoom] = useState(1);
  useEffect(() => {
    const node = captchaWrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      const w = node.clientWidth;
      if (w > 0) {
        const next = Math.min(1, w / 304);
        setCaptchaZoom((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        recaptchaRef.current?.reset?.();
      } catch {
        // abaikan: widget mungkin belum siap
      }
      setIsRecaptchaFilled(false);
      setCaptchaKey(`recaptcha-${theme}`);
    }, 60);
    return () => clearTimeout(timer);
  }, [theme]);

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
    <div className="login-page-shell min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden px-[clamp(20px,5vw,28px)] py-[clamp(20px,4vh,48px)]">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl"></div>
      <ThemeToggle compact className="absolute right-4 top-4 z-20" />

      <div className="w-full max-w-[400px] relative z-10">
        {/* Header */}
        <div className="text-center mb-4 md:mb-5">
          <div className="inline-flex items-center justify-center mb-3 md:mb-3.5">
            <img src={logo} alt="Logo" className="w-[clamp(42px,11vw,60px)] h-auto object-contain" />
          </div>
          <h1 className="text-[clamp(18px,5.5vw,24px)] font-bold text-[var(--soc-text-primary)] mb-1 leading-tight">
            SOC UNDIP
          </h1>
          <p className="text-[var(--soc-text-secondary)] text-[clamp(11px,3.4vw,14px)] leading-snug">
            Security Operations Center UNDIP
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
          className="bg-slate-800/50 backdrop-blur-xl rounded-[12px] border border-slate-700/50 p-[clamp(20px,6vw,28px)] md:p-6 space-y-4 shadow-lg shadow-black/30"
        >
          {/* Email Field */}
          <div>
              <label className="block text-[clamp(12px,3.6vw,14px)] font-semibold text-slate-300 mb-1.5">
                Email or Username
              </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={handleEmailChange}
                disabled={isLoading}
                className="w-full h-[clamp(40px,12vw,44px)] pl-9 pr-3.5 bg-slate-700/50 border border-slate-600 rounded-lg text-[clamp(12px,3.6vw,14px)] placeholder:text-[clamp(12px,3.6vw,14px)] text-[var(--soc-text-primary)] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
              <label className="block text-[clamp(12px,3.6vw,14px)] font-semibold text-slate-300 mb-1.5">
                Password
              </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="off"
                value={password}
                onChange={handlePasswordChange}
                disabled={isLoading}
                className="w-full h-[clamp(40px,12vw,44px)] pl-9 pr-10 bg-slate-700/50 border border-slate-600 rounded-lg text-[clamp(12px,3.6vw,14px)] placeholder:text-[clamp(12px,3.6vw,14px)] text-[var(--soc-text-primary)] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* CAPTCHA */}
          <div ref={captchaWrapRef} className="login-recaptcha-wrap min-w-0 p-2 rounded-lg bg-[var(--soc-card)] border border-slate-600">
            <div style={{ zoom: captchaZoom }} className="min-w-0">
              <ReCAPTCHA
                key={captchaKey}
                ref={recaptchaRef}
                sitekey="6Le7BYksAAAAAASn99_SYX6OAX7r8siw5H8m_YWr"
                onChange={handleRecaptchaChange}
                theme={theme}
              />
            </div>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={!isRecaptchaFilled || isLoading}
            className={`w-full h-[clamp(40px,12vw,44px)] flex justify-center items-center gap-1.5 rounded-lg text-[clamp(12px,3.6vw,14px)] font-semibold transition-all duration-200 ${
              isRecaptchaFilled && !isLoading
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg hover:shadow-cyan-500/50"
                : "bg-slate-600 text-slate-300 cursor-not-allowed opacity-70"
            }`}
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>Sign In</span>
              </>
            )}
          </button>

          {/* Security Info */}
          <div className="pt-2.5 border-t border-slate-700 w-full">
              <div className="login-secure-note flex items-center justify-center gap-1 min-w-0 max-w-full overflow-hidden text-[clamp(8px,2.8vw,11px)] leading-snug text-slate-400 text-center whitespace-nowrap">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span className="login-note-full min-w-0">Protected with end-to-end encryption & CAPTCHA verification</span>
                <span className="login-note-short min-w-0">Encryption & CAPTCHA protected</span>
              </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;