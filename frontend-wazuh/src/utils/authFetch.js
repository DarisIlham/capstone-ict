// Interceptor fetch global untuk endpoint /api milik aplikasi.
// Menambahkan header Authorization (JWT) ke semua request data, dan
// mengarahkan ke halaman login bila backend membalas 401 (sesi tidak valid).
//
// Dipasang sekali di main.jsx. Endpoint /api/auth/* dikecualikan dari
// redirect agar kegagalan login/OTP (401) tetap ditampilkan di form.

import { getAuthToken, LOGIN_PATH } from "../config/Api";

const AUTH_PATH_PREFIX = "/api/auth/";

function clearAuthStorage() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
  } catch {
    // abaikan
  }
}

function shouldHandle(url) {
  if (typeof window === "undefined") return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin ? parsed : null;
  } catch {
    return null;
  }
}

export function installAuthFetchInterceptor() {
  if (typeof window === "undefined" || window.__socAuthFetchInstalled) return;
  window.__socAuthFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    let url = "";
    try {
      url = typeof input === "string" ? input : String(input?.url || "");
    } catch {
      return originalFetch(input, init);
    }

    const parsed = shouldHandle(url);
    // Hanya same-origin /api (jangan sentuh request eksternal seperti geo-IP).
    if (!parsed || !parsed.pathname.includes("/api/")) {
      return originalFetch(input, init);
    }

    const token = getAuthToken();
    const headers = new Headers(init.headers || input?.headers || undefined);
    if (token) headers.set("Authorization", `Bearer ${token}`);

    return originalFetch(input, { ...init, headers }).then((response) => {
      const isAuthEndpoint = parsed.pathname.includes(AUTH_PATH_PREFIX);
      if (response.status === 401 && !isAuthEndpoint) {
        clearAuthStorage();
        if (window.location.pathname !== LOGIN_PATH) {
          window.location.replace(LOGIN_PATH);
        }
      }
      return response;
    });
  };
}
