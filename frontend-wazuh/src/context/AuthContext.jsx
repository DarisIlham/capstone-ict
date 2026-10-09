import { createContext, useState, useEffect, useCallback, useRef } from "react";

// Zona waktu acuan jam malam.
const CURFEW_TZ_OFFSET_MINUTES = 7 * 60; // WIB = UTC+7 (tanpa DST)

// Milidetik menuju 00:00 berikutnya di zona acuan.
function msUntilMidnight() {
  const now = new Date();
  const zoned = new Date(now.getTime() + (CURFEW_TZ_OFFSET_MINUTES + now.getTimezoneOffset()) * 60000);
  const nextMidnight = new Date(zoned);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(1000, nextMidnight.getTime() - zoned.getTime());
}

const AuthContext = createContext();

export { AuthContext };

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load auth state saat mount (localStorage = remember me, sessionStorage = sesi saja)
  useEffect(() => {
    const storages = [localStorage, sessionStorage];
    let restored = false;

    for (const storage of storages) {
      try {
        const token = storage.getItem("token");
        const userData = storage.getItem("user");
        if (token && userData) {
          setIsAuthenticated(true);
          setUser(JSON.parse(userData));
          restored = true;
          break;
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
        try {
          storage.removeItem("token");
          storage.removeItem("user");
        } catch {
          // abaikan
        }
      }
    }

    if (!restored) {
      setIsAuthenticated(false);
      setUser(null);
    }
    setLoading(false);
  }, []);

  // remember = true → localStorage (tetap login), false → sessionStorage (hilang saat tab ditutup)
  const login = (token, userData, remember = true) => {
    const primary = remember ? localStorage : sessionStorage;
    const secondary = remember ? sessionStorage : localStorage;
    try {
      secondary.removeItem("token");
      secondary.removeItem("user");
    } catch {
      // abaikan
    }
    try {
      primary.setItem("token", token);
      primary.setItem("user", JSON.stringify(userData));
    } catch (error) {
      console.error("Failed to persist auth state:", error);
      // Fallback ke memori agar login tetap bisa lanjut walau storage diblokir
      try {
        secondary.setItem("token", token);
        secondary.setItem("user", JSON.stringify(userData));
      } catch {
        // abaikan
      }
    }
    setIsAuthenticated(true);
    setUser(userData);
  };

  const logout = useCallback(() => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
    } catch {
      // abaikan
    }
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  // Auto-logout tepat 00:00 WIB: siapa pun yang masih login langsung keluar.
  // Timer dihitung ulang setiap status auth berubah (mis. login 00:30 →
  // timer berikutnya 24 jam lagi).
  const midnightTimer = useRef(null);
  useEffect(() => {
    if (midnightTimer.current) {
      clearTimeout(midnightTimer.current);
      midnightTimer.current = null;
    }
    if (!isAuthenticated) return undefined;
    midnightTimer.current = setTimeout(() => {
      midnightTimer.current = null;
      logout();
    }, msUntilMidnight());
    return () => {
      if (midnightTimer.current) {
        clearTimeout(midnightTimer.current);
        midnightTimer.current = null;
      }
    };
  }, [isAuthenticated, logout]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};


