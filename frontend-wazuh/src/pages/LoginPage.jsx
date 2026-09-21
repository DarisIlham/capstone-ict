import { useState, useEffect, useMemo, useRef } from "react";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  CheckCircle,
  KeyRound,
  ArrowLeft,
  Mail,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import ThemeToggle from "../components/ThemeToggle";
import logoDark from "../assets/soc_undip_dark_theme.png";
import logoLight from "../assets/soc_undip_light_theme.png";
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

  // Langkah login: "credentials" -> "otp"; lupa password: "forgot" -> "reset"
  const [step, setStep] = useState("credentials");
  const [rememberMe, setRememberMe] = useState(true);
  const [otpId, setOtpId] = useState(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const [resendAvailableAt, setResendAvailableAt] = useState(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const otpBoxRefs = useRef([]);

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

  // Widget captcha discale mengikuti lebar wadah (mengecil di layar sempit,
  // membesar mengisi penuh di layar lebar) sehingga selalu seukuran kotak luar.
  const captchaWrapRef = useRef(null);
  const [captchaZoom, setCaptchaZoom] = useState(1);
  useEffect(() => {
    const node = captchaWrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      const w = node.clientWidth;
      if (w > 0) {
        // Batasi maks 0.9 agar tidak kebesaran; tetap mengecil di layar sempit
        const next = Math.max(0.6, Math.min(0.9, (w - 24) / 304));
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

  // Widget captcha disembunyikan sampai iframe-nya selesai dimuat (load event),
  // agar tidak terlihat kedip kotak hitam/putih saat refresh. Fallback timeout
  // 6 detik untuk kasus event load sudah terlewat.
  const [captchaReady, setCaptchaReady] = useState(false);

  // Paksa gaya iframe captcha langsung via JS (menang atas konflik cascade stylesheet).
  // Dipanggil ulang tiap widget di-mount ulang (captchaKey) atau tema berubah.
  useEffect(() => {
    const node = captchaWrapRef.current;
    if (!node || typeof MutationObserver === "undefined") return undefined;
    setCaptchaReady(false);
    let settled = false;
    let fallback = null;
    const markReady = () => {
      if (settled) return;
      settled = true;
      setCaptchaReady(true);
      if (fallback) { clearTimeout(fallback); fallback = null; }
    };
    const paint = () => {
      const frame = node.querySelector("iframe");
      if (!frame) return;
      if (theme === "dark") {
        frame.style.background = "transparent";
        frame.style.clipPath = "inset(4px 5px 6px 5px)";
        frame.style.filter = "sepia(0.5) saturate(3) hue-rotate(170deg) brightness(1.02)";
      } else {
        frame.style.background = "";
        frame.style.clipPath = "";
        frame.style.filter = "";
      }
      try {
        if (frame.contentDocument?.readyState === "complete") markReady();
        else frame.addEventListener("load", markReady, { once: true });
      } catch {
        markReady();
      }
      if (!fallback) fallback = setTimeout(markReady, 6000);
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(node, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (fallback) clearTimeout(fallback);
    };
  }, [theme, captchaKey, step]);

  // Lupa password: email + password baru
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetSentTo, setResetSentTo] = useState("");

  const goToStep = (next) => {
    try {
      recaptchaRef.current?.reset?.();
    } catch {
      // abaikan: widget mungkin belum siap
    }
    setIsRecaptchaFilled(false);
    setNotification({ show: false, message: "", type: "error" });
    setStep(next);
  };

  const sanitizeInput = (value) => {
    return value.replace(/<[^>]*>?/gm, "").replace(/[<>{}[\]()&^%$#!]/g, "");
  };

  // Kolom hujan karakter cyber (dibuat sekali, stabil antar render)
  const rainColumns = useMemo(() => {
    const glyphs = "01ABCDEF<>/#$%&";
    const pick = () => glyphs[Math.floor(Math.random() * glyphs.length)];
    return Array.from({ length: 16 }, (_, i) => {
      const len = 10 + Math.floor(Math.random() * 14);
      return {
        left: `${(i * 100) / 16 + Math.random() * 4}%`,
        text: Array.from({ length: len }, pick).join(""),
        duration: `${7 + Math.random() * 9}s`,
        delay: `${-Math.random() * 12}s`,
      };
    });
  }, []);

  // Fetch dengan batas waktu agar tombol tidak berputar selamanya bila
  // server macet (mis. pengiriman email SMTP tersendat).
  const fetchWithTimeout = async (url, options, ms = 45000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Server terlalu lama merespons. Periksa koneksi lalu coba lagi.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
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

      // Langkah 1: validasi kredensial + kirim OTP ke email
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login/request-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          captchaToken,
        }),
      }, 60000);

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Sign in failed");
      }

      setOtpId(data.otpId);
      setMaskedEmail(data.email || "");
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpExpiresAt(Date.now() + Number(data.expiresIn || 300) * 1000);
      setResendAvailableAt(Date.now() + 30 * 1000);
      setStep("otp");
      setNotification({
        show: true,
        message: data.message || "Kode OTP telah dikirim ke email Anda",
        type: "success",
      });
      setTimeout(() => otpBoxRefs.current[0]?.focus?.(), 100);
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

  const handleResendOtp = async () => {
    if (Date.now() < resendAvailableAt) return;
    try {
      setIsLoading(true);
      const captchaToken = recaptchaRef.current?.getValue?.() || undefined;
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, captchaToken }),
      }, 60000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Gagal mengirim ulang OTP");
      setOtpId(data.otpId);
      setMaskedEmail(data.email || maskedEmail);
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpExpiresAt(Date.now() + Number(data.expiresIn || 300) * 1000);
      setResendAvailableAt(Date.now() + 30 * 1000);
      setNotification({ show: true, message: data.message || "Kode OTP baru telah dikirim", type: "success" });
      setTimeout(() => otpBoxRefs.current[0]?.focus?.(), 100);
    } catch (error) {
      setNotification({ show: true, message: error.message || "Gagal mengirim ulang OTP", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const code = otpDigits.join("");
    if (code.length !== 6) {
      setNotification({ show: true, message: "Masukkan 6 digit kode OTP", type: "error" });
      return;
    }
    try {
      setIsLoading(true);
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpId, code, rememberMe }),
      }, 20000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Verifikasi OTP gagal");

      login(data.token, data.user, rememberMe);

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
        message: error.message || "An error occurred while verifying OTP",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpBoxChange = (index, raw) => {
    const digit = String(raw).replace(/\D/g, "").slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) otpBoxRefs.current[index + 1]?.focus?.();
  };

  const handleOtpBoxKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpBoxRefs.current[index - 1]?.focus?.();
    }
  };

  const handleOtpPaste = (e) => {
    const text = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setOtpDigits(next);
    otpBoxRefs.current[Math.min(text.length, 5)]?.focus?.();
  };

  // Lupa password: minta LINK reset ke email
  const handleForgotRequest = async (e) => {
    if (e) e.preventDefault();
    setNotification({ show: false, message: "", type: "error" });
    if (!forgotEmail) {
      setNotification({ show: true, message: "Email wajib diisi", type: "error" });
      return;
    }
    try {
      setIsLoading(true);
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/password/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      }, 60000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Gagal meminta link reset");
      setResetSentTo(data.email || forgotEmail);
      setStep("sent");
      setNotification({ show: true, message: data.message || "Link reset telah dikirim", type: "success" });
    } catch (error) {
      setNotification({ show: true, message: error.message || "Gagal meminta link reset", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCountdown = (targetTs) => {
    const left = Math.max(0, Math.ceil(((targetTs || 0) - nowTs) / 1000));
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  // Detik berjalan untuk countdown OTP & jeda kirim ulang
  useEffect(() => {
    if (step !== "otp") return undefined;
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification({ show: false, message: "", type: "error" });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  return (
    <div className="login-page-shell min-h-dvh bg-[var(--soc-bg)] relative overflow-hidden px-[clamp(20px,5vw,28px)] py-[clamp(20px,4vh,48px)]">
      {/* Cyber animated background */}
      <div className="login-cyber-bg" aria-hidden="true">
        <div className="login-cyber-grid" />
        <div className="login-cyber-orb" style={{ width: 340, height: 340, left: "-90px", top: "-100px", background: "rgba(139,92,246,0.55)" }} />
        <div className="login-cyber-orb" style={{ width: 300, height: 300, right: "-70px", bottom: "-80px", background: "rgba(217,70,239,0.45)", animationDelay: "-6s" }} />
        <div className="login-cyber-scan" />
        {rainColumns.map((col, i) => (
          <span key={i} className="login-cyber-rain" style={{ left: col.left, animationDuration: col.duration, animationDelay: col.delay }}>
            {col.text}
          </span>
        ))}
      </div>
      <ThemeToggle compact className="absolute right-4 top-4 z-20" />

      <div className="w-full max-w-[420px] relative z-10 animate-fadeInUp">
        {/* Notification */}
        {notification.show && (
          <div
            className={`mb-4 px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-medium transition-all duration-300 border ${
              notification.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/10 text-red-400 border-red-500/30"
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
          onSubmit={step === "otp" ? handleVerifyOtp : step === "forgot" ? handleForgotRequest : handleSubmit}
          className="relative bg-[var(--soc-card)] rounded-xl border border-[var(--soc-border)] p-[clamp(20px,6vw,28px)] md:p-6 space-y-4 shadow-lg"
        >
        {step === "credentials" && (
        <div className="flex justify-center -mt-1 mb-8">
          <img src={theme === "light" ? logoLight : logoDark} alt="SOC UNDIP" className="w-[clamp(160px,45vw,240px)] h-auto object-contain" />
        </div>
        )}
        {step === "forgot" && (
        <div className="flex justify-center -mt-1 mb-2 pt-8">
          <div className="p-3 rounded-2xl text-white shadow-lg" style={{ background: "var(--soc-gradient-purple)" }}>
            <KeyRound className="h-5 w-5" />
          </div>
        </div>
        )}

        {step === "credentials" && (
          <>
          {/* Email Field */}
          <div>
              <label className="block text-[clamp(12px,3.6vw,14px)] font-semibold text-[var(--soc-text-secondary)] mb-1.5">
                Email or Username
              </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--soc-text-muted)]" />
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={handleEmailChange}
                disabled={isLoading}
                className="w-full h-[clamp(40px,12vw,44px)] pl-9 pr-3.5 bg-[var(--soc-elevated)] border border-[var(--soc-border)] rounded-lg text-[clamp(12px,3.6vw,14px)] placeholder:text-[clamp(12px,3.6vw,14px)] text-[var(--soc-text-primary)] placeholder-[var(--soc-text-muted)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
              <label className="block text-[clamp(12px,3.6vw,14px)] font-semibold text-[var(--soc-text-secondary)] mb-1.5">
                Password
              </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--soc-text-muted)]" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="off"
                value={password}
                onChange={handlePasswordChange}
                disabled={isLoading}
                className="w-full h-[clamp(40px,12vw,44px)] pl-9 pr-10 bg-[var(--soc-elevated)] border border-[var(--soc-border)] rounded-lg text-[clamp(12px,3.6vw,14px)] placeholder:text-[clamp(12px,3.6vw,14px)] text-[var(--soc-text-primary)] placeholder-[var(--soc-text-muted)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)]"
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

          {/* Remember Me + Forgot */}
          <div className="flex items-center justify-between gap-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                className="h-4 w-4 rounded accent-violet-500 cursor-pointer disabled:opacity-50"
              />
              <span className="text-[clamp(12px,3.4vw,13px)] text-[var(--soc-text-secondary)]">Remember me</span>
            </label>
            <button
              type="button"
              onClick={() => { setForgotEmail(email); goToStep("forgot"); }}
              disabled={isLoading}
              className="text-[clamp(12px,3.4vw,13px)] text-[var(--soc-accent)] hover:brightness-110 font-medium transition-all disabled:opacity-50 cursor-pointer"
            >
              Forgot password?
            </button>
          </div>

          {/* CAPTCHA */}
          <div ref={captchaWrapRef} className="w-full min-w-0">
          <div className={`login-recaptcha-wrap w-fit mx-auto min-w-0 p-3 rounded-lg bg-[var(--soc-elevated)] border border-[var(--soc-border)] transition-opacity duration-300 ${captchaReady ? "opacity-100" : "opacity-0"}`}>
            {!captchaReady && (
              <div className="flex items-center justify-center py-6 text-[11px] text-[var(--soc-text-muted)]">
                <div className="animate-spin h-4 w-4 border-2 border-[var(--soc-accent)] border-t-transparent rounded-full mr-2"></div>
                Loading captcha…
              </div>
            )}
            <div style={{ zoom: captchaZoom, height: 78 * captchaZoom }} className="relative w-fit min-w-0 overflow-hidden flex justify-center">
              <ReCAPTCHA
                key={`${captchaKey}-credentials`}
                ref={recaptchaRef}
                sitekey="6Le7BYksAAAAAASn99_SYX6OAX7r8siw5H8m_YWr"
                onChange={handleRecaptchaChange}
                theme={theme}
              />
            </div>
          </div>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={!isRecaptchaFilled || isLoading}
            className={`w-full h-[clamp(40px,12vw,44px)] flex justify-center items-center gap-1.5 rounded-lg text-[clamp(12px,3.6vw,14px)] font-semibold transition-all duration-200 ${
              isRecaptchaFilled && !isLoading
                ? "text-white shadow-lg hover:brightness-110"
                : "bg-[var(--soc-elevated)] text-[var(--soc-text-muted)] cursor-not-allowed opacity-70"
            }`}
            style={isRecaptchaFilled && !isLoading ? { background: "var(--soc-gradient-purple)" } : undefined}
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
          </>
        )}

        {step === "otp" && (
          <>
          <button
            type="button"
            onClick={() => { setStep("credentials"); setNotification({ show: false, message: "", type: "error" }); }}
            disabled={isLoading}
            aria-label="Back to login"
            className="absolute left-4 top-4 p-1.5 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)] transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col items-center text-center">
            <div className="p-3 rounded-2xl text-white shadow-lg" style={{ background: "var(--soc-gradient-purple)" }}>
              <KeyRound className="h-5 w-5" />
            </div>
            <h2 className="text-[clamp(15px,4.4vw,17px)] font-bold text-[var(--soc-text-primary)] mt-3">Check your email</h2>
            <p className="text-[clamp(11px,3.4vw,13px)] text-[var(--soc-text-muted)] mt-1 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span>OTP sent to <span className="font-semibold text-[var(--soc-text-primary)]">{maskedEmail}</span></span>
            </p>
          </div>

          {/* OTP Boxes */}
          <div className="flex items-center justify-center gap-2" onPaste={handleOtpPaste}>
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpBoxRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                disabled={isLoading}
                onChange={(e) => handleOtpBoxChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpBoxKeyDown(i, e)}
                className="w-11 h-12 text-center text-lg font-bold bg-[var(--soc-elevated)] border border-[var(--soc-border)] rounded-xl text-[var(--soc-text-primary)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500/60 transition-all disabled:opacity-50"
              />
            ))}
          </div>

          {/* OTP Expiry */}
          <p className="text-center text-[clamp(11px,3.2vw,12px)] text-[var(--soc-text-muted)]">
            Code expires in <span className="font-semibold text-[var(--soc-accent)] font-mono">{formatCountdown(otpExpiresAt)}</span>
          </p>

          {/* Verify Button */}
          <button
            type="submit"
            disabled={isLoading || otpDigits.join("").length !== 6}
            className="w-full h-[clamp(40px,12vw,44px)] flex justify-center items-center gap-1.5 rounded-lg text-[clamp(12px,3.6vw,14px)] font-semibold transition-all duration-200 text-white shadow-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--soc-gradient-purple)" }}
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                <span>Verify OTP</span>
              </>
            )}
          </button>

          {/* Resend */}
          <div className="flex items-center justify-end text-[clamp(11px,3.4vw,13px)]">
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={isLoading || Date.now() < resendAvailableAt}
              className="text-[var(--soc-accent)] hover:brightness-110 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {Date.now() < resendAvailableAt ? `Resend in ${formatCountdown(resendAvailableAt)}` : "Resend code"}
            </button>
          </div>
          </>
        )}

        {step === "forgot" && (
          <>
          <button
            type="button"
            onClick={() => goToStep("credentials")}
            disabled={isLoading}
            aria-label="Back to login"
            className="absolute left-4 top-4 p-1.5 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)] transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col items-center text-center">
            <h2 className="text-[clamp(15px,4.4vw,17px)] font-bold text-[var(--soc-text-primary)] mt-3">Forgot password</h2>
            <p className="text-[clamp(11px,3.4vw,13px)] text-[var(--soc-text-muted)] mt-1">Enter your email to receive a reset code</p>
          </div>

          <div>
            <label className="block text-[clamp(12px,3.6vw,14px)] font-semibold text-[var(--soc-text-secondary)] mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--soc-text-muted)]" />
              <input
                type="email"
                autoComplete="off"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(sanitizeInput(e.target.value))}
                disabled={isLoading}
                className="w-full h-[clamp(40px,12vw,44px)] pl-9 pr-3.5 bg-[var(--soc-elevated)] border border-[var(--soc-border)] rounded-lg text-[clamp(12px,3.6vw,14px)] text-[var(--soc-text-primary)] placeholder-[var(--soc-text-muted)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !forgotEmail}
            className="w-full h-[clamp(40px,12vw,44px)] flex justify-center items-center gap-1.5 rounded-lg text-[clamp(12px,3.6vw,14px)] font-semibold transition-all duration-200 text-white shadow-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--soc-gradient-purple)" }}
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                <span>Send Reset Code</span>
              </>
            )}
          </button>
          </>
        )}

        {step === "sent" && (
          <>
          <button
            type="button"
            onClick={() => goToStep("credentials")}
            disabled={isLoading}
            aria-label="Back to login"
            className="absolute left-4 top-4 p-1.5 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)] transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col items-center text-center pt-8">
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
              <Mail className="h-5 w-5 text-emerald-400" />
            </div>
            <h2 className="text-[clamp(15px,4.4vw,17px)] font-bold text-[var(--soc-text-primary)] mt-3">Check your email</h2>
            <p className="text-[clamp(11px,3.4vw,13px)] text-[var(--soc-text-muted)] mt-1">
              Reset link sent to <span className="font-semibold text-[var(--soc-text-primary)]">{resetSentTo}</span>
            </p>
            <p className="text-[clamp(11px,3.4vw,13px)] text-[var(--soc-text-muted)] mt-1">
              Click the link (valid 10 minutes, one-time use) to create a new password.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleForgotRequest()}
            disabled={isLoading}
            className="w-full h-[clamp(40px,12vw,44px)] flex justify-center items-center gap-1.5 rounded-lg text-[clamp(12px,3.6vw,14px)] font-semibold transition-all duration-200 text-white shadow-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--soc-gradient-purple)" }}
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                <span>Resend Link</span>
              </>
            )}
          </button>
          </>
        )}

          {/* Security Info */}
          <div className="pt-2.5 border-t border-[var(--soc-border)] w-full">
              <div className="login-secure-note flex items-center justify-center gap-1 min-w-0 max-w-full overflow-hidden text-[clamp(8px,2.8vw,11px)] leading-snug text-[var(--soc-text-muted)] text-center whitespace-nowrap">
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