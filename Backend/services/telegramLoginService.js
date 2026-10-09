// services/telegramLoginService.js
// Bot APPROVAL LOGIN (@undip_soc_login_bot): di luar jam kerja, login yang
// sudah lolos OTP tidak langsung diberi JWT — admin menerima pesan Telegram
// berisi tombol Approve / Disapprove. Bot ini TERPISAH dari bot dangerous
// alert (lihat telegramAlertService.js).
//
// Cara kerja bot: long-polling getUpdates dari backend (tanpa webhook /
// tanpa URL publik). Callback dari tombol inline mengubah status request
// yang disimpan di memori (Map) — cukup karena request kedaluwarsa dalam
// hitungan menit.

import axios from "axios";
import { randomUUID } from "node:crypto";
import { listOnline } from "./presenceService.js";

const api = (token) => `https://api.telegram.org/bot${token}`;

function readConfig() {
  return {
    enabled: process.env.LOGIN_APPROVAL_ENABLED !== "0",
    token: String(process.env.TELEGRAM_LOGIN_TOKEN || ""),
    adminChatId: String(process.env.TELEGRAM_LOGIN_CHAT_ID || ""),
    tz: process.env.LOGIN_APPROVAL_TZ || "Asia/Jakarta",
    startHour: Number(process.env.LOGIN_APPROVAL_START_HOUR ?? 19),
    endHour: Number(process.env.LOGIN_APPROVAL_END_HOUR ?? 5),
    expiresMinutes: Number(
      process.env.LOGIN_APPROVAL_EXPIRES_MINUTES ||
        process.env.OTP_EXPIRES_MINUTES ||
        5
    ),
  };
}

export function isTelegramLoginConfigured() {
  const { token, adminChatId } = readConfig();
  return Boolean(token && adminChatId);
}

// ── Jendela jam kerja ──────────────────────────────────────────────
// Di luar [endHour, startHour) pada zona waktu acuan → butuh approval.
// Default: butuh approval bila jam lokal Asia/Jakarta >= 19:00 atau < 05:00.
export function hourInZone(date = new Date(), tz = "Asia/Jakarta") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  // "24" bisa muncul untuk tengah malam pada sebagian ICU — anggap 0.
  return Number.isFinite(hour) ? hour % 24 : new Date(date).getHours();
}

export function isOutsideWorkingHours(date = new Date()) {
  const { tz, startHour, endHour } = readConfig();
  const hour = hourInZone(date, tz);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return false;
  if (startHour === endHour) return false;
  // Jendela melewati tengah malam (mis. 19 -> 5): luar jam = >= 19 ATAU < 5.
  if (startHour > endHour) return hour >= startHour || hour < endHour;
  // Jendela normal (mis. 9 -> 17): luar jam = < 9 ATAU >= 17.
  return hour < startHour || hour >= endHour;
}

// Sabtu–Minggu (zona acuan) selalu butuh approval, jam berapa pun.
export function isWeekend(date = new Date()) {
  const { tz } = readConfig();
  if (process.env.LOGIN_APPROVAL_WEEKENDS === "0") return false;
  try {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date);
    return day === "Sat" || day === "Sun";
  } catch {
    const d = new Date(date).getDay();
    return d === 0 || d === 6;
  }
}

// Alasan approval: "weekend" | "night" | null (jam kerja biasa).
export function approvalReason(date = new Date()) {
  if (isWeekend(date)) return "weekend";
  if (isOutsideWorkingHours(date)) return "night";
  return null;
}

export function requiresLoginApproval(date = new Date()) {
  return approvalReason(date) !== null;
}

// ── Penyimpanan request approval (memori + kedaluwarsa) ────────────
const pending = new Map(); // id -> record

function sweepExpired() {
  const now = Date.now();
  for (const [id, rec] of pending) {
    // Simpan hasil keputusan sebentar untuk audit, hapus yang sudah basi.
    if (now > rec.expiresAt + 5 * 60 * 1000) pending.delete(id);
  }
}

setInterval(sweepExpired, 60 * 1000).unref?.();

export function createLoginApproval({ userId, email, name, role, rememberMe, ip, userAgent, reason }) {
  const { expiresMinutes } = readConfig();
  const id = randomUUID();
  const now = Date.now();
  const rec = {
    id,
    userId,
    email: email || "-",
    name: name || null,
    role: role || "user",
    rememberMe: rememberMe === true,
    ip: ip || "-",
    userAgent: userAgent || "-",
    reason: reason || "night",
    status: "pending", // pending | approved | denied
    createdAt: now,
    expiresAt: now + Math.max(1, expiresMinutes) * 60 * 1000,
    decidedAt: null,
    decidedBy: null,
    messageId: null,
  };
  pending.set(id, rec);
  return rec;
}

export function getLoginApproval(id) {
  const rec = pending.get(String(id || ""));
  if (!rec) return null;
  if (rec.status === "pending" && Date.now() > rec.expiresAt) {
    rec.status = "expired";
  }
  return rec;
}

// Kembalikan record DAN hapus (sekali pakai) — untuk penerbitan JWT.
export function consumeLoginApproval(id) {
  const rec = getLoginApproval(id);
  if (!rec) return null;
  pending.delete(String(id));
  return rec;
}

export function decideLoginApproval(id, decision, by) {
  const rec = pending.get(String(id || ""));
  if (!rec || rec.status !== "pending") return null;
  if (decision !== "approved" && decision !== "denied") return null;
  rec.status = decision;
  rec.decidedAt = Date.now();
  rec.decidedBy = by != null ? String(by) : null;
  return rec;
}

// ── Telegram Bot API ──────────────────────────────────────────────
async function tg(token, method, payload, timeoutMs = 15000) {
  const { data } = await axios.post(`${api(token)}/${method}`, payload, {
    timeout: timeoutMs,
  });
  if (!data?.ok) {
    throw new Error(data?.description || `Telegram ${method} failed`);
  }
  return data.result;
}

const esc = (v) =>
  String(v ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function fmtTimeWib(ms, tz) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export async function sendLoginApprovalMessage(rec) {
  const { token, adminChatId, tz } = readConfig();
  if (!token || !adminChatId) {
    throw new Error("TELEGRAM_LOGIN_TOKEN / TELEGRAM_LOGIN_CHAT_ID belum dikonfigurasi");
  }
  const title =
    rec.reason === "weekend"
      ? `🔐 <b>Permintaan Login (Akhir Pekan)</b>`
      : `🔐 <b>Permintaan Login di Luar Jam Kerja</b>`;
  const text =
    `${title}\n` +
    `Nama: <b>${esc(rec.name || rec.email)}</b>\n` +
    `Email: <code>${esc(rec.email)}</code>\n` +
    `Role: <code>${esc(rec.role)}</code>\n` +
    `IP: <code>${esc(rec.ip)}</code>\n` +
    `Waktu: ${esc(fmtTimeWib(rec.createdAt, tz))} (${esc(tz)})\n` +
    `Berlaku hingga: ${esc(fmtTimeWib(rec.expiresAt, tz))}\n\n` +
    `Setujui login ini?`;
  const result = await tg(token, "sendMessage", {
    chat_id: adminChatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: `login:approve:${rec.id}` },
          { text: "❌ Disapprove", callback_data: `login:deny:${rec.id}` },
        ],
      ],
    },
  });
  rec.messageId = result?.message_id ?? null;
  return result;
}

async function editApprovalMessage(rec) {

  const { token, adminChatId, tz } = readConfig();
  if (!token || !adminChatId || !rec.messageId) return;
  const verdict =
    rec.status === "approved"
      ? "✅ <b>DISETUJUI</b> — user bisa masuk."
      : rec.status === "denied"
        ? "❌ <b>DITOLAK</b> — login dibatalkan."
        : "⌛ <b>KEDALUWARSA</b>.";
  const text =
    `${verdict}\n\n` +
    `Nama: <b>${esc(rec.name || rec.email)}</b>\n` +
    `Email: <code>${esc(rec.email)}</code>\n` +
    `Waktu request: ${esc(fmtTimeWib(rec.createdAt, tz))}`;
  try {
    await tg(token, "editMessageText", {
      chat_id: adminChatId,
      message_id: rec.messageId,
      text,
      parse_mode: "HTML",
    });
  } catch (err) {
    console.warn("[telegram-login] editMessage gagal:", err.message);
  }
}

// ── Info login jam kerja (tanpa tombol, fire-and-forget) ──────────
// Dipanggil setiap login yang TIDAK lewat approval (jam kerja). Untuk login
// malam yang disetujui, pesan request + hasil keputusan sudah tercatat,
// jadi fungsi ini tidak dipanggil di sana (hindari pesan ganda).
export async function sendLoginInfoMessage({ name, email, role, ip, userAgent } = {}) {
  const { enabled, token, adminChatId, tz } = readConfig();
  if (!enabled || !token || !adminChatId) return null;
  const text =
    `ℹ️ <b>Login Berhasil (Jam Kerja)</b>\n` +
    `Nama: <b>${esc(name || email)}</b>\n` +
    `Email: <code>${esc(email)}</code>\n` +
    `Role: <code>${esc(role)}</code>\n` +
    `IP: <code>${esc(ip)}</code>\n` +
    `Waktu: ${esc(fmtTimeWib(Date.now(), tz))} (${esc(tz)})`;
  try {
    return await tg(token, "sendMessage", {
      chat_id: adminChatId,
      text,
      parse_mode: "HTML",
    });
  } catch (err) {
    // Info login tidak boleh menggagalkan login.
    console.warn("[telegram-login] kirim info login gagal:", err.message);
    return null;
  }
}

async function handleCallback(query) {
  const { token, adminChatId } = readConfig();
  const fromId = String(query?.from?.id ?? "");
  const data = String(query?.data ?? "");
  console.log(`[telegram-login] callback diterima: ${data} by=${fromId}`);
  const match = data.match(/^login:(approve|deny):([0-9a-f-]{36})$/);

  const answer = (text) =>
    tg(token, "answerCallbackQuery", {
      callback_query_id: query.id,
      text,
    }).catch(() => {});

  // Otorisasi penekan tombol:
  // - chat pribadi: harus sama persis dengan TELEGRAM_LOGIN_CHAT_ID;
  // - channel/grup (ID diawali "-"): siapa pun ADMIN channel/grup boleh
  //   memutuskan (dicek via getChatAdministrators + cache 10 menit).
  if (!(await isAuthorizedDecider(fromId))) {
    await answer("⛔ Hanya admin yang bisa memutuskan.");
    return;
  }
  if (!match) return;

  const decision = match[1] === "approve" ? "approved" : "denied";
  const rec = decideLoginApproval(match[2], decision, fromId);
  if (!rec) {
    console.warn(`[telegram-login] callback ${decision} untuk request tak dikenal/kedaluwarsa id=${match[2]} by=${fromId}`);
    await answer("⌛ Request sudah tidak berlaku (mungkin kedaluwarsa atau dari pesan lama).");
    return;
  }
  await answer(decision === "approved" ? "✅ Login disetujui" : "❌ Login ditolak");
  await editApprovalMessage(rec);
  console.log(`[telegram-login] ${decision} id=${rec.id} email=${rec.email} by=${fromId}`);
}

// Cache daftar admin channel/grup agar tidak memanggil Telegram tiap tap.
const channelAdminCache = { ids: new Set(), at: 0 };

async function isAuthorizedDecider(fromId) {
  const { token, adminChatId } = readConfig();
  const admin = String(adminChatId);
  if (String(fromId) === admin) return true;
  if (!admin.startsWith("-")) return false;
  const now = Date.now();
  if (now - channelAdminCache.at > 10 * 60 * 1000 || channelAdminCache.ids.size === 0) {
    try {
      const { data } = await axios.get(`${api(token)}/getChatAdministrators`, {
        params: { chat_id: admin },
        timeout: 15000,
      });
      const list = data?.result || [];
      channelAdminCache.ids = new Set(list.map((m) => String(m?.user?.id ?? "")));
      channelAdminCache.at = now;
    } catch (err) {
      console.warn("[telegram-login] getChatAdministrators gagal:", err.message);
      return false;
    }
  }
  const ok = channelAdminCache.ids.has(String(fromId));
  if (!ok) console.warn(`[telegram-login] penekan ${fromId} bukan admin channel ${admin}`);
  return ok;
}

async function handleCommand(message) {
  const { token } = readConfig();
  const chatId = message?.chat?.id;
  const fromId = String(message?.from?.id ?? "");
  const text = String(message?.text || "").trim().toLowerCase();
  if (!chatId) return;
  if (text === "/start" || text === "/id") {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        `Halo! Saya bot approval login SOC UNDIP.\n\n` +
        `Chat ID Anda: <code>${chatId}</code>\n` +
        `Pasang nilai ini ke <code>TELEGRAM_LOGIN_CHAT_ID</code> di .env backend agar tombol Approve/Disapprove berfungsi.\n\n` +
        `Login di luar jam kerja (19:00–05:00 WIB) akan meminta persetujuan Anda di sini.`,
      parse_mode: "HTML",
    }).catch(() => {});
    return;
  }
  if (text === "/online" || text === "/help") {
    // Hanya admin yang boleh mengintip daftar user online.
    if (!(await isAuthorizedDecider(fromId))) {
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text: "⛔ Hanya admin yang bisa memakai perintah ini.",
      }).catch(() => {});
      return;
    }
    if (text === "/help") {
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text:
          `<b>Perintah bot login SOC UNDIP</b>\n` +
          `/online — user yang sedang online di website\n` +
          `/id — lihat chat ID Anda\n` +
          `Tombol <b>Approve/Disapprove</b> muncul otomatis saat ada login di luar jam kerja.`,
        parse_mode: "HTML",
      }).catch(() => {});
      return;
    }
    const users = listOnline();
    const lines = users.length
      ? users.map(
          (u, i) =>
            `${i + 1}. <b>${esc(u.name || u.email)}</b> (<code>${esc(u.email)}</code>)\n   ${esc(u.role)} · aktif ${u.activeSecondsAgo}d lalu`
        )
      : ["(tidak ada user online saat ini)"];
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: `🟢 <b>User Online (${users.length})</b>\n${lines.join("\n")}`,
      parse_mode: "HTML",
    }).catch(() => {});
  }
}

// Long-polling getUpdates — tidak butuh webhook / URL publik.
let polling = false;

export function startLoginBotPolling() {
  if (polling) return true;
  const { enabled, token } = readConfig();
  if (!enabled) {
    console.log("[telegram-login] nonaktif (LOGIN_APPROVAL_ENABLED=0)");
    return false;
  }
  if (!isTelegramLoginConfigured()) {
    console.warn(
      "[telegram-login] TELEGRAM_LOGIN_TOKEN / TELEGRAM_LOGIN_CHAT_ID belum diisi — approval login nonaktif, login malam berjalan normal tanpa approval."
    );
    return false;
  }
  polling = true;
  console.log("[telegram-login] polling bot aktif (@undip_soc_login_bot)");

  (async () => {
    // Daftarkan menu perintah bot (best-effort).
    try {
      await axios.post(
        `${api(token)}/setMyCommands`,
        {
          commands: [
            { command: "online", description: "User yang sedang online" },
            { command: "id", description: "Lihat chat ID Anda" },
            { command: "help", description: "Bantuan" },
          ],
        },
        { timeout: 15000 }
      );
    } catch (err) {
      console.warn("[telegram-login] setMyCommands gagal:", err.message);
    }
    // Lewati backlog lama saat start (request-nya sudah tidak ada di memori).
    let offset = 0;
    try {
      const { data } = await axios.get(`${api(token)}/getUpdates`, {
        params: { timeout: 0 },
        timeout: 15000,
      });
      const updates = data?.result || [];
      if (updates.length) offset = updates[updates.length - 1].update_id + 1;
    } catch (err) {
      console.warn("[telegram-login] getUpdates awal gagal:", err.message);
    }

    let failCount = 0;
    while (polling) {
      try {
        const { data } = await axios.get(`${api(token)}/getUpdates`, {
          params: { offset, timeout: 25 },
          timeout: 35000,
        });
        failCount = 0;
        for (const update of data?.result || []) {
          offset = update.update_id + 1;
          try {
            if (update.callback_query) await handleCallback(update.callback_query);
            else if (update.message?.text) await handleCommand(update.message);
          } catch (err) {
            console.warn("[telegram-login] gagal memproses update:", err.message);
          }
        }
      } catch (err) {
        // Jaringan/Telegram bermasalah — tunggu lalu coba lagi, jangan mati.
        failCount += 1;
        if (failCount === 1 || failCount % 20 === 0) {
          console.warn(`[telegram-login] getUpdates gagal (${failCount}x):`, err.message);
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  })().catch((err) => {
    polling = false;
    console.error("[telegram-login] polling berhenti:", err.message);
  });

  return true;
}
