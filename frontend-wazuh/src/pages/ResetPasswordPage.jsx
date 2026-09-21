import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import ThemeToggle from "../components/ThemeToggle";
import logoDark from "../assets/soc_undip_dark_theme.png";
import logoLight from "../assets/soc_undip_light_theme.png";
import { API_BASE_URL } from "../config/Api";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme } = useTheme();
  const token = searchParams.get("token") || "";

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: "", type: "error" });
  const [done, setDone] = useState(false);

  // Kolom hujan karakter cyber (konsisten dengan halaman login)
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

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setTokenValid(false);
      setTokenError("Link reset tidak valid.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/auth/password/verify?token=${encodeURIComponent(token)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.success) throw new Error(data.message || "Link tidak valid");
        setTokenValid(true);
      } catch (error) {
        if (cancelled) return;
        setTokenValid(false);
        setTokenError(error.message || "Link tidak valid");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification({ show: false, message: "", type: "error" });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setNotification({ show: true, message: "Password baru minimal 6 karakter", type: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotification({ show: true, message: "Konfirmasi password tidak sama", type: "error" });
      return;
    }
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/auth/password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Gagal mereset password");
      setDone(true);
      setNotification({ show: true, message: data.message || "Password berhasil diubah.", type: "success" });
      setTimeout(() => navigate("/login"), 2500);
    } catch (error) {
      setNotification({ show: true, message: error.message || "Gagal mereset password", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

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

      <div className="w-full max-w-[460px] relative z-10 animate-fadeInUp">
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

        <div className="relative bg-[var(--soc-card)] rounded-xl border border-[var(--soc-border)] p-[clamp(20px,6vw,28px)] md:p-6 space-y-4 shadow-lg">
          <Link
            to="/login"
            aria-label="Back to login"
            className="absolute left-4 top-4 p-1.5 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex justify-center -mt-1 mb-2 pt-8">
            <img src={theme === "light" ? logoLight : logoDark} alt="SOC UNDIP" className="w-[clamp(160px,45vw,240px)] h-auto object-contain" />
          </div>

          {checking ? (
            <div className="flex items-center justify-center py-10 text-[12px] text-[var(--soc-text-muted)]">
              <div className="animate-spin h-5 w-5 border-2 border-[var(--soc-accent)] border-t-transparent rounded-full mr-2"></div>
              Memeriksa link reset…
            </div>
          ) : !tokenValid ? (
            <div className="flex flex-col items-center text-center py-4">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <h2 className="text-[clamp(15px,4.4vw,17px)] font-bold text-[var(--soc-text-primary)] mt-3">Link tidak valid</h2>
              <p className="text-[clamp(11px,3.4vw,13px)] text-[var(--soc-text-muted)] mt-1">{tokenError}</p>
              <Link
                to="/login"
                className="mt-4 text-[13px] text-[var(--soc-accent)] hover:brightness-110 font-medium transition-all"
              >
                Kembali ke login
              </Link>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center text-center py-4">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <h2 className="text-[clamp(15px,4.4vw,17px)] font-bold text-[var(--soc-text-primary)] mt-3">Password diubah</h2>
              <p className="text-[clamp(11px,3.4vw,13px)] text-[var(--soc-text-muted)] mt-1">Mengalihkan ke halaman login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col items-center text-center">
                <div className="p-3 rounded-2xl text-white shadow-lg" style={{ background: "var(--soc-gradient-purple)" }}>
                  <KeyRound className="h-5 w-5" />
                </div>
                <h2 className="text-[clamp(15px,4.4vw,17px)] font-bold text-[var(--soc-text-primary)] mt-3">Buat password baru</h2>
                <p className="text-[clamp(11px,3.4vw,13px)] text-[var(--soc-text-muted)] mt-1">Link valid — silakan isi password baru Anda</p>
              </div>

              <div>
                <label className="block text-[clamp(12px,3.6vw,14px)] font-semibold text-[var(--soc-text-secondary)] mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--soc-text-muted)]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full h-[clamp(40px,12vw,44px)] pl-9 pr-10 bg-[var(--soc-elevated)] border border-[var(--soc-border)] rounded-lg text-[clamp(12px,3.6vw,14px)] text-[var(--soc-text-primary)] placeholder-[var(--soc-text-muted)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder="Min. 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)]"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[clamp(12px,3.6vw,14px)] font-semibold text-[var(--soc-text-secondary)] mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--soc-text-muted)]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full h-[clamp(40px,12vw,44px)] pl-9 pr-3.5 bg-[var(--soc-elevated)] border border-[var(--soc-border)] rounded-lg text-[clamp(12px,3.6vw,14px)] text-[var(--soc-text-primary)] placeholder-[var(--soc-text-muted)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder="Repeat new password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !newPassword}
                className="w-full h-[clamp(40px,12vw,44px)] flex justify-center items-center gap-1.5 rounded-lg text-[clamp(12px,3.6vw,14px)] font-semibold transition-all duration-200 text-white shadow-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--soc-gradient-purple)" }}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    <span>Save New Password</span>
                  </>
                )}
              </button>
            </form>
          )}

          <div className="pt-2.5 border-t border-[var(--soc-border)] w-full">
            <div className="flex items-center justify-center gap-1 min-w-0 max-w-full overflow-hidden text-[clamp(8px,2.8vw,11px)] leading-snug text-[var(--soc-text-muted)] text-center whitespace-nowrap">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">Link sekali pakai & kedaluwarsa otomatis</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
