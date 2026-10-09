// services/presenceService.js
// Kehadiran user (siapa yang sedang online) untuk perintah /online di bot
// approval login. JWT stateless tidak melacak sesi, jadi frontend mengirim
// heartbeat berkala selama user login; backend mencatat lastSeen per user.
// "Online" = heartbeat dalam N menit terakhir (default 3). In-memory:
// restart backend mengosongkan daftar (wajar — sesi klien ikut terputus
// dari pantauan sampai heartbeat berikutnya, ≤60 detik).

const online = new Map(); // userId -> { userId, email, name, role, ip, lastSeen }

function onlineTimeoutMs() {
  return Number(process.env.PRESENCE_TIMEOUT_MS || 3 * 60 * 1000);
}

export function touchPresence({ userId, email, name, role, ip }) {
  const id = String(userId ?? "");
  if (!id) return null;
  const rec = {
    userId: id,
    email: email || "-",
    name: name || null,
    role: role || "user",
    ip: ip || "-",
    lastSeen: Date.now(),
  };
  online.set(id, rec);
  return rec;
}

export function removePresence(userId) {
  return online.delete(String(userId ?? ""));
}

export function listOnline(maxAgeMs) {
  const maxAge = Number(maxAgeMs ?? onlineTimeoutMs());
  const now = Date.now();
  return Array.from(online.values())
    .filter((r) => now - r.lastSeen <= maxAge)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map((r) => ({ ...r, activeSecondsAgo: Math.round((now - r.lastSeen) / 1000) }));
}

setInterval(() => {
  const now = Date.now();
  const maxAge = onlineTimeoutMs() * 2;
  for (const [id, rec] of online) {
    if (now - rec.lastSeen > maxAge) online.delete(id);
  }
}, 60 * 1000).unref?.();
