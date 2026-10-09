// services/telegramAlertService.js
// STUB — Bot DANGEROUS ALERT (terpisah dari bot approval login).
//
// Isi TELEGRAM_ALERT_TOKEN + TELEGRAM_ALERT_CHAT_ID di .env (buat bot kedua
// via @BotFather), lalu panggil sendDangerousAlert({ title, detail }) dari
// detektor (mis. botnet ML / FIM critical). Selama token belum diisi,
// fungsi ini hanya log warning dan tidak mengirim apa pun.

import axios from "axios";

function readConfig() {
  return {
    token: String(process.env.TELEGRAM_ALERT_TOKEN || ""),
    chatId: String(process.env.TELEGRAM_ALERT_CHAT_ID || ""),
  };
}

export function isAlertBotConfigured() {
  const { token, chatId } = readConfig();
  return Boolean(token && chatId);
}

const esc = (v) =>
  String(v ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export async function sendDangerousAlert({ title, detail, source } = {}) {
  const { token, chatId } = readConfig();
  if (!token || !chatId) {
    console.warn("[telegram-alert] TELEGRAM_ALERT_TOKEN / TELEGRAM_ALERT_CHAT_ID belum diisi — alert tidak dikirim:", title);
    return null;
  }
  const text =
    `<b>${esc(title || "Dangerous Alert")}</b>\n` +
    (source ? `Sumber: <code>${esc(source)}</code>\n` : "") +
    (detail ? `${esc(detail)}` : "");
  const { data } = await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    { chat_id: chatId, text, parse_mode: "HTML" },
    { timeout: 15000 }
  );
  if (!data?.ok) throw new Error(data?.description || "Telegram sendMessage failed");
  return data.result;
}
