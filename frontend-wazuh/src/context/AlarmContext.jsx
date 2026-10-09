import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BellRing, Bot, ShieldAlert, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { fetchAllEvents } from "../utils/fetchAllEvents";
import {
  hostCommandSeverity,
  fileScanSeverity,
  fimSeverity,
  mlSeverity,
  isMaliciousLabel,
  isCriticalSeverity,
} from "../utils/alertSeverity";

const POLL_MS = 30000;
const MAX_ALERT_BEEPS = 4;
const BEEP_LENGTH = 0.46;
const BEEP_GAP = 0.18;
const HISTORY_LIMIT = 50;
const POPUP_LIST_LIMIT = 5;
const STORAGE_KEY = "alarm-history";
const ENABLED_KEY = "alarm-enabled";
const SOUND_KEY = "alarm-sound-enabled";
const ES_MAX_WINDOW = 10000;

const AlarmContext = createContext(null);

const pick = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s && s !== "-" && s.toLowerCase() !== "unknown") return v;
  }
  return undefined;
};

// ── Audio ────────────────────────────────────────────────────────────────────
const useAlarmSound = () => {
  const audioContextRef = useRef(null);

  const ensureContext = useCallback(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContextClass();
    }
    return audioContextRef.current;
  }, []);

  const play = useCallback(
    async (repeat = 1) => {
      try {
        const audioContext = ensureContext();
        if (!audioContext) return;
        // Kebijakan autoplay Chrome: context yang dibuat di luar interaksi
        // pengguna tetap "suspended". Karena pemicunya datang dari polling,
        // resume() HARUS ditunggu dan nada baru boleh dijadwalkan setelahnya.
        if (audioContext.state === "suspended") await audioContext.resume();
        if (audioContext.state !== "running") {
          console.warn(
            `[alarm] audio terkunci (state=${audioContext.state}). ` +
            "Klik sekali di halaman ini untuk mengaktifkan suara alarm."
          );
          return;
        }

        const beepCount = Math.min(Math.max(Number(repeat) || 1, 1), MAX_ALERT_BEEPS);
        const baseAt = audioContext.currentTime + 0.02;
        for (let n = 0; n < beepCount; n++) {
          // Semua bunyi dijadwalkan lewat AudioContext, bukan setTimeout,
          // sehingga jeda antar-bunyi tidak meleset.
          const startAt = baseAt + n * (BEEP_LENGTH + BEEP_GAP);
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          oscillator.type = "square";
          [880, 1174, 880].forEach((freq, i) => {
            oscillator.frequency.setValueAtTime(freq, startAt + i * 0.14);
          });
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.02);
          gain.gain.setValueAtTime(0.16, startAt + 0.36);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.44);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + BEEP_LENGTH);
        }
      } catch (audioError) {
        console.warn("Alarm sound is unavailable:", audioError);
      }
    },
    [ensureContext]
  );

  // Buka kunci audio pada interaksi pengguna pertama, kalau tidak polling tidak
  // akan pernah menghasilkan suara karena autoplay masih diblokir.
  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = ensureContext();
        if (ctx && ctx.state === "suspended") void ctx.resume();
      } catch {
        /* abaikan, akan dicoba lagi pada interaksi berikutnya */
      }
    };
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((name) => window.addEventListener(name, unlock, { passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, unlock));
  }, [ensureContext]);

  return { play, audioContextRef };
};

// ── Pengambilan alert critical dari semua sumber ────────────────────────────
const fetchCriticalFeed = async ({ base, token, start, end, signal }) => {
  const headers = { Authorization: `Bearer ${token}` };
  const get = async (url) => {
    const res = await fetch(url, { headers, signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const rows = (body) => {
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.content)) return body.content;
    if (Array.isArray(body?.hits)) return body.hits;
    return [];
  };
  const totalPages = (body) => Number(body?.pagination?.totalPages || 0);
  const collect = async (url, pageSize) => {
    const out = [];
    for (let page = 1; ; page += 1) {
      const body = await get(`${url}&page=${page}&limit=${pageSize}`);
      const batch = rows(body);
      out.push(...batch);
      const pages = totalPages(body);
      if (!pages || page >= pages || batch.length === 0) break;
      if (page * pageSize > ES_MAX_WINDOW) break;
    }
    return out;
  };

  const rangeQs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  const [attackRes, fileRes, fimRes, mlRes, botRes] = await Promise.allSettled([
    collect(`${base}/api/linux-commands?suspicious=true&${rangeQs}`, 500),
    collect(`${base}/api/file-scans/suspicious?${rangeQs}`, 100),
    fetchAllEvents((url) => get(url), {
      baseUrl: `${base}/api/events`,
      start,
      end,
      slices: 6,
      pageSize: 1000,
    }).then((r) => r.rows),
    collect(`${base}/api/ml/predictions?${rangeQs}`, 500),
    // Cukup halaman 1: endpoint diurutkan timestamp desc, jadi dokumen baru
    // selalu ada di sana.
    get(`${base}/api/bot-detection/alerts?${rangeQs}&page=1&limit=200`).then(rows),
  ]);

  const value = (res) => (res.status === "fulfilled" && Array.isArray(res.value) ? res.value : []);

  const alerts = [];

  value(attackRes).forEach((a, i) => {
    // Severity memakai util yang sama dengan halaman Security Alerts, jadi
    // semua yang berlabel Critical di sana juga berbunyi di sini.
    if (!isCriticalSeverity(hostCommandSeverity(a))) return;
    alerts.push({
      key: `attack-${a.id || i}`,
      title: a.description || a.command || "Suspicious command detected",
      source: "Host Monitoring",
      asset: pick(a.hostName, a.hostname, a.host, a.agentName, a.agent_name) || "Unknown",
      timestamp: a.timestamp || a.created_at,
      link: "/attack-dashboard?status=suspicious",
    });
  });

  value(fileRes).forEach((f, i) => {
    const findings = Array.isArray(f.findings) ? f.findings : [];
    const count = Number(f.findingsCount ?? findings.length ?? 0);
    if (!isCriticalSeverity(fileScanSeverity(count))) return;
    alerts.push({
      key: `file-${f.id || i}`,
      title: pick(f.fileName, f.threat_name, f.file_name) || "Suspicious file detected",
      source: "File Scanner",
      asset: pick(f.filePath, f.file_path) || "Unknown",
      timestamp: f.timestamp || f.scan_time || f.created_at,
      link: "/file-security",
    });
  });

  value(fimRes).forEach((e, i) => {
    const ruleLevel = Number(e.ruleLevel ?? e.rule_level ?? e.level ?? e.severity ?? 0);
    if (!isCriticalSeverity(fimSeverity(ruleLevel))) return;
    const path = pick(e.syscheckPath, e.file, e.path, e.filePath) || "Unknown";
    alerts.push({
      key: `fim-${e.id || i}`,
      title: `${e.syscheckEvent && e.syscheckEvent !== "-" ? e.syscheckEvent : e.type || "File change"} detected (level ${ruleLevel})`,
      source: "FIM",
      asset: path,
      timestamp: e.timestamp || e.created_at || e.createdAt || e["@timestamp"],
      link: `/fim-events?path=${encodeURIComponent(path)}`,
    });
  });

  value(mlRes).forEach((p, i) => {
    if (!isMaliciousLabel(p.predictedLabel || p.label)) return;
    const rawConf = typeof p.confidence === "number" ? p.confidence : parseFloat(p.confidence);
    if (Number.isNaN(rawConf)) return;
    const conf = Math.min(Math.max(rawConf > 1 ? rawConf : rawConf * 100, 0), 100);
    if (!isCriticalSeverity(mlSeverity(conf))) return;
    alerts.push({
      key: `ml-${p.id || i}`,
      title: `${p.predictedLabel || p.label || "Threat"} detected by ML`,
      source: "ML Predictions",
      asset: p.agent || "Unknown",
      timestamp: p.timestamp || p.created_at || p.createdAt || p["@timestamp"],
      link: "/ml-dashboard",
    });
  });

  // Botnet ML: backend selalu mengirim severity null untuk tipe ini, jadi
  // seluruhnya diperlakukan sebagai critical.
  value(botRes).forEach((b, i) => {
    if (b?.detectorType !== "ml") return;
    const rawProb = typeof b.probability === "number" ? b.probability : parseFloat(b.probability);
    const probPct = Number.isNaN(rawProb) ? null : Math.round((rawProb > 1 ? rawProb : rawProb * 100) * 10) / 10;
    alerts.push({
      key: `botnet-${b.id || i}`,
      title: `Botnet activity detected by ML detector${probPct === null ? "" : ` (probability ${probPct}%)`}`,
      source: "Bot Detection",
      asset: pick(b.agent, b.hostname) || "Unknown",
      timestamp: b.timestamp || b.eventTimestamp,
      link: "/bot-detection",
    });
  });

  return alerts;
};

// ── Provider ────────────────────────────────────────────────────────────────
export const AlarmProvider = ({ children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { play, audioContextRef } = useAlarmSound();

  const [history, setHistory] = useState([]);
  const [unread, setUnread] = useState(0);
  const [popup, setPopup] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Preferensi pengguna: master on/off notifikasi + suara.
  // Disimpan di localStorage agar berlaku per-browser per-akun.
  const [alarmEnabled, setAlarmEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(ENABLED_KEY);
      return raw === null ? true : raw !== "0";
    } catch {
      return true;
    }
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(SOUND_KEY);
      return raw === null ? true : raw !== "0";
    } catch {
      return true;
    }
  });
  // null = baseline belum terbentuk, jadi load pertama tidak memicu alarm.
  const seenKeysRef = useRef(null);

  // Riwayat disimpan agar tetap ada setelah reload, tapi badge "belum dibaca"
  // sengaja tidak ikut disimpan supaya popup tidak langsung bertumpuk.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setHistory(parsed.slice(0, HISTORY_LIMIT));
    } catch {
      /* abaikan, riwayat hanya kosmetik */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ENABLED_KEY, alarmEnabled ? "1" : "0");
    } catch {
      /* abaikan */
    }
  }, [alarmEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_KEY, soundEnabled ? "1" : "0");
    } catch {
      /* abaikan */
    }
  }, [soundEnabled]);

  // Mematikan notifikasi juga menutup popup yang sedang tampil agar
  // tidak ada bunyi/tumpukan tertinggal.
  const toggleAlarm = useCallback(() => {
    setAlarmEnabled((v) => {
      if (v) setPopup(null);
      return !v;
    });
  }, []);
  const toggleSound = useCallback(() => setSoundEnabled((v) => !v), []);

  useEffect(() => {
    // Tunggu AuthContext selesai memulihkan sesi. Selama itu isAuthenticated
    // masih false, dan bila history ikut dibersihkan di sini maka riwayat
    // dari localStorage akan terhapus setiap kali halaman di-reload.
    if (authLoading) return undefined;

    if (!isAuthenticated) {
      setHistory([]);
      setUnread(0);
      setPopup(null);
      seenKeysRef.current = null;
      return undefined;
    }

    // Notifikasi dimatikan pengguna: jangan polling sama sekali supaya
    // tidak ada popup, badge, history baru, maupun suara.
    if (!alarmEnabled) {
      setPopup(null);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();

    const check = async () => {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      if (!token) return;
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      try {
        const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;
        const alerts = await fetchCriticalFeed({
          base,
          token,
          start: start.toISOString(),
          end: end.toISOString(),
          signal: controller.signal,
        });
        if (cancelled) return;

        const currentKeys = new Set(alerts.map((a) => a.key));
        const fresh = seenKeysRef.current
          ? alerts.filter((a) => !seenKeysRef.current.has(a.key))
          : [];
        seenKeysRef.current = currentKeys;

        if (import.meta.env.DEV) {
          const ctx = audioContextRef.current;
          console.log(
            `[alarm] total=${alerts.length} baru=${fresh.length}` +
            ` beep=${fresh.length > 0} audio=${ctx ? ctx.state : "none"}`
          );
        }

        if (fresh.length === 0) return;

        // Notifikasi yang sudah pernah berbunyi tidak diulang setelah reload.
        setHistory((prev) => {
          const existing = new Set(prev.map((a) => a.key));
          const incoming = fresh
            .filter((a) => !existing.has(a.key))
            .map((a) => ({ ...a, id: `${a.key}-${Date.now()}`, seenAt: new Date().toISOString() }));
          if (incoming.length === 0) return prev;
          const next = [...incoming, ...prev].slice(0, HISTORY_LIMIT);
          try {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(next.map(({ key, title, source, asset, timestamp, link }) => ({ key, title, source, asset, timestamp, link })))
            );
          } catch {
            /* abaikan */
          }
          return next;
        });
        setUnread((n) => n + fresh.length);
        setPopup({ items: fresh.slice(0, POPUP_LIST_LIMIT), total: fresh.length });
        if (soundEnabled) void play(fresh.length);
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        console.warn("Alarm check failed:", err);
      }
    };

    void check();
    const interval = setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [isAuthenticated, authLoading, alarmEnabled, soundEnabled, play, audioContextRef]);

  const dismissPopup = useCallback(() => setPopup(null), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const togglePanel = useCallback(() => setPanelOpen((v) => !v), []);
  const clearHistory = useCallback(() => {
    setHistory([]);
    setUnread(0);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* abaikan */
    }
  }, []);

  const value = useMemo(
    () => ({
      history,
      unread,
      popup,
      panelOpen,
      alarmEnabled,
      soundEnabled,
      setAlarmEnabled,
      setSoundEnabled,
      toggleAlarm,
      toggleSound,
      closePanel,
      togglePanel,
      clearHistory,
      dismissPopup,
    }),
    [history, unread, popup, panelOpen, alarmEnabled, soundEnabled, toggleAlarm, toggleSound, closePanel, togglePanel, clearHistory, dismissPopup]
  );

  return (
    <AlarmContext.Provider value={value}>
      {children}
      {alarmEnabled && <AlarmPopup popup={popup} onDismiss={dismissPopup} />}
    </AlarmContext.Provider>
  );
};

// ── Popup peringatan ────────────────────────────────────────────────────────
// Kartu memakai variabel tema (soc-card, soc-text-*) sehingga terbaca jelas
// di tema gelap maupun terang; hilang sendiri setelah AUTO_DISMISS_MS.
const AUTO_DISMISS_MS = 10000;

const AlarmPopup = ({ popup, onDismiss }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!popup) return undefined;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [popup, onDismiss]);

  if (!popup) return null;
  // key memaksa remount tiap batch baru agar animasi masuk + progress bar
  // selalu mulai dari awal.
  const batchKey = `${popup.items?.[0]?.key || "batch"}-${popup.total}`;

  // Klik item langsung menuju halaman + data yang sesuai (link sudah
  // dibawa tiap alert), lalu popup ditutup.
  const openItem = (link) => {
    onDismiss();
    navigate(link || "/alerts");
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[300] flex justify-center px-3 pt-3 pointer-events-none">
      <div
        key={batchKey}
        role="alertdialog"
        aria-label="Critical alert"
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-[var(--soc-border)] shadow-2xl overflow-hidden animate-fadeInUp"
        style={{ background: "var(--soc-card)" }}
      >
        <div className="h-1 bg-red-500" />

        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className="p-2 rounded-xl bg-red-500/15 shrink-0">
            <BellRing className="h-4 w-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0 leading-relaxed">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[12px] font-bold text-[var(--soc-text-primary)] leading-relaxed">
                {popup.total} Critical Alert{popup.total > 1 ? "s" : ""} incoming
              </h3>
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold text-white leading-none">
                {popup.total} new
              </span>
            </div>
            <p className="text-[10px] text-[var(--soc-text-muted)] leading-relaxed mt-1">
              New detections require your attention
            </p>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss alarm"
            className="p-1.5 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)] transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <ul className="max-h-56 overflow-y-auto divide-y divide-[var(--soc-border)]/60 border-t border-[var(--soc-border)]/60">
          {popup.items.map((item) => {
            const isBotnet = item.source === "Bot Detection";
            const Icon = isBotnet ? Bot : item.source === "FIM" ? ShieldAlert : AlertTriangle;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => openItem(item.link)}
                  title={`Buka ${item.source}`}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left leading-relaxed hover:bg-[var(--soc-elevated)]/60 transition-colors cursor-pointer"
                >
                  <div className="p-1.5 rounded-lg bg-red-500/10 shrink-0 mt-0.5">
                    <Icon className="h-3.5 w-3.5 text-red-500" />
                  </div>
                  <div className="min-w-0 flex-1 leading-relaxed">
                    <p className="text-[11px] font-medium text-[var(--soc-text-primary)] break-words leading-relaxed">{item.title}</p>
                    <p className="text-[9px] text-[var(--soc-text-muted)] mt-1 truncate leading-relaxed">
                      {item.source} &middot; {item.asset}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
          {popup.total > popup.items.length && (
            <li className="px-4 py-2.5 text-[9px] text-[var(--soc-text-muted)] leading-relaxed">
              +{popup.total - popup.items.length} more alert{popup.total - popup.items.length > 1 ? "s" : ""} in the alarm history
            </li>
          )}
        </ul>

        <div
          className="h-0.5 bg-[var(--soc-elevated)]"
          title="Closes automatically"
        >
          <div
            className="h-full bg-red-500 alarm-autodismiss"
            style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
          />
        </div>
      </div>
    </div>
  );
};

export const useAlarms = () => {
  const ctx = useContext(AlarmContext);
  if (!ctx) throw new Error("useAlarms harus dipakai di dalam AlarmProvider");
  return ctx;
};

export default AlarmContext;