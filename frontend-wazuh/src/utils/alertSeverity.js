// Pemetaan severity alert dipakai bersama oleh halaman Security Alerts
// (pages/Alert.jsx) dan detektor alarm global (context/AlarmContext.jsx).
// Dulu logikanya ditulis terpisah di kedua file sehingga keduanya bisa melenceng
// tanpa terlihat, jadi semua ambang batas dikumpulkan di sini satu saja.

// Urutan dari yang paling ringan ke yang paling berat.
export const SEVERITY_ORDER = ["low", "medium", "high", "critical"];
export const SEVERITIES = ["critical", "high", "medium", "low"];

// Nilai severity dari backend hanya dipercaya kalau memang salah satu dari
// empat level yang valid, supaya "high" tidak diam-diam diturunkan jadi
// "medium" dan sebaliknya.
export const normalizeSeverity = (value, fallback = null) => {
  const s = String(value ?? "").trim().toLowerCase();
  return SEVERITIES.includes(s) ? s : fallback;
};

// Host Monitoring / Linux Commands.
// Backend TIDAK PERNAH mengirim field risk_level (lihat services/linuxCommandService.js
// yang hanya mengisi riskIndicators), jadi severity diturunkan dari riskIndicators.
const LINUX_COMMAND_INDICATOR_SEVERITY = {
  // Tindakan destruktif atau yang langsung membuka celah remoting.
  destructive_delete: "critical",
  permission_change_777: "critical",
  remote_shell_tool: "critical",
  // Eksekusi kode inline dan pemrosesan payload.
  base64_decode: "high",
  shell_inline_exec: "high",
  python_inline_exec: "high",
  perl_inline_exec: "high",
  php_inline_exec: "high",
  // Anti-forensik.
  history_tampering: "high",
  // Alat unduh/rekognisi yang umum dipakai pada aktivitas legitimate.
  network_fetch: "medium",
};

export const hostCommandSeverity = (record) => {
  const explicit = normalizeSeverity(record?.risk_level ?? record?.riskLevel);
  if (explicit) return explicit;

  const raw = record?.riskIndicators;
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const indicators = list
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean);
  if (indicators.length === 0) return "medium";

  // Satu perintah bisa punya beberapa indicator, yang terberat yang dipakai.
  let best = "low";
  indicators.forEach((indicator) => {
    const severity = LINUX_COMMAND_INDICATOR_SEVERITY[indicator];
    if (severity && SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(best)) {
      best = severity;
    }
  });
  return best;
};

export const fileScanSeverity = (findingsCount) => {
  const count = Number(findingsCount) || 0;
  return count >= 5 ? "critical" : count >= 2 ? "high" : count >= 1 ? "medium" : "low";
};

export const fimSeverity = (ruleLevel) => {
  const level = Number(ruleLevel) || 0;
  return level >= 10 ? "critical" : level >= 7 ? "high" : level >= 4 ? "medium" : "low";
};

// confidence sudah dalam persen 0-100. null = tidak terbaca, dianggap medium
// supaya tetap terlihat tanpa dianggap kritis.
export const mlSeverity = (confidence) => {
  if (confidence === null || confidence === undefined || Number.isNaN(confidence)) return "medium";
  const conf = Math.min(Math.max(Number(confidence), 0), 100);
  return conf >= 80 ? "critical" : conf >= 60 ? "high" : conf >= 40 ? "medium" : "low";
};

export const isMaliciousLabel = (label) => {
  const s = String(label || "").toLowerCase();
  return Boolean(s) && !s.includes("benign") && !s.includes("normal");
};

export const isCriticalSeverity = (severity) => severity === "critical";