// services/mailerService.js
// Pengiriman email OTP via SMTP menggunakan SSL/TLS bawaan Node.
//
// CATATAN: terpaksa TIDAK memakai nodemailer karena di lingkungan ini
// koneksi nodemailer -> Google SMTP selalu menggantung (padahal koneksi
// mentah net/tls ke SMTP yang sama berjalan normal). Implementasi raw
// SMTP di bawah sudah terbukti terkirim ke Gmail (465 / implicit SSL).
//
// Konfigurasi lewat .env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
// SMTP_PASS (Gmail App Password), SMTP_FROM.

import net from "net";
import tls from "tls";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Logo SOC untuk template email (dikirim sebagai attachment CID agar tampil di Gmail;
// data: URI diblokir sebagian klien email).
const __mailerDir = path.dirname(fileURLToPath(import.meta.url));
let socLogoBase64 = "";
try {
  const logoPath = path.join(__mailerDir, "..", "assets", "soc_undip_dark_theme.png");
  socLogoBase64 = fs.readFileSync(logoPath).toString("base64");
} catch {
  socLogoBase64 = "";
}
const socLogoImg = (width) =>
  socLogoBase64
    ? `<img src="cid:soclogo" alt="SOC UNDIP" width="${width}" style="display: block; margin: 0 auto; max-width: 100%;">`
    : `<div style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #A855F7 50%, #D946EF 100%); color: #ffffff; font-size: 20px; font-weight: bold; width: 48px; height: 48px; line-height: 48px; border-radius: 14px;">S</div>`;
const socLogoAttachment = () =>
  socLogoBase64
    ? [{ cid: "soclogo", filename: "soc_undip_dark_theme.png", contentType: "image/png", base64: socLogoBase64 }]
    : [];

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = boolEnv(process.env.SMTP_SECURE, true);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

export function maskEmail(email) {
  const [local = "", domain = ""] = String(email).split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

/**
 * Kelas pembaca respons SMTP dengan batas waktu per baris.
 */
class SmtpReader {
  constructor(socket) {
    this.socket = socket;
    this.buf = "";
    this.socket.on("data", (d) => {
      this.buf += d.toString("utf8");
    });
  }

  // Kumpulkan baris hingga baris terakhir "250 " (bukan "250-"),
  // atau kembalikan null saat timeout. Kode awal 4xx/5xx langsung keluar.
  async response(timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const idx = this.buf.indexOf("\n");
      if (idx >= 0) {
        const line = this.buf.slice(0, idx).trimEnd();
        this.buf = this.buf.slice(idx + 1);
        const code = line.slice(0, 3);
        const isLast = line.length < 4 || line[3] === " ";
        if (isLast) {
          return { code, text: line };
        }
        // multiline (mis. EHLO) — lanjut baca baris berikutnya
      } else {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    return null;
  }
}

function waitSocketEvent(socket, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeAllListeners(event);
      reject(new Error("Timeout menunggu koneksi SMTP"));
    }, timeoutMs);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Wrapper dengan hard-timeout untuk seluruh sesi SMTP.
 */
function withSessionTimeout(ms, fn) {
  let socketRef = null;
  let timer;
  const watchdog = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        socketRef && socketRef.destroy();
      } catch {
        // abaikan
      }
      reject(new Error("Timeout mengirim email OTP (SMTP tidak merespons). Coba lagi."));
    }, ms);
  });
  const runner = (async () => {
    const result = await fn((s) => (socketRef = s));
    return result;
  })();
  return Promise.race([runner, watchdog]).finally(() => clearTimeout(timer));
}

async function sendCommand(socket, reader, command, expectedCodes = ["250"], label = "") {
  socket.write(command + "\r\n");
  const resp = await reader.response(10000);
  if (!resp) {
    throw new Error(`SMTP ${label || command.split(" ")[0]}: tidak ada respons (server menggantung)`);
  }
  if (!expectedCodes.includes(resp.code)) {
    throw new Error(`SMTP ${label || command.split(" ")[0]}: ${resp.code} ${resp.text}`);
  }
  return resp;
}

/**
 * Kirim email via sesi SMTP. Mendukung port 465 (implicit TLS) maupun
 * 587 + STARTTLS sesuai nilai SMTP_SECURE di .env.
 */
async function sendRealSmtp({ to, from, subject, text, html, attachments = [] }) {
  return withSessionTimeout(15000, async (setSocket) => {
    let socket;
    if (SMTP_SECURE) {
      socket = tls.connect({
        host: SMTP_HOST,
        port: SMTP_PORT,
        servername: SMTP_HOST,
        rejectUnauthorized: false,
      });
    } else {
      socket = net.connect({ host: SMTP_HOST, port: SMTP_PORT });
    }
    setSocket(socket);
    socket.on("error", () => {
      // error socket biasanya sudah tampil lewat timeout/response reader
    });

    const reader = new SmtpReader(socket);

    if (SMTP_SECURE) {
      await waitSocketEvent(socket, "secureConnect", 10000);
    } else {
      await waitSocketEvent(socket, "connect", 10000);
    }

    const greeting = await reader.response(10000);
    if (!greeting || greeting.code !== "220") {
      throw new Error(`SMTP greeting gagal: ${greeting ? greeting.text : "timeout"}`);
    }

    await sendCommand(socket, reader, `EHLO ${osHostname()}`, ["250"], "EHLO");

    // STARTTLS bila koneksi awal polos (587)
    if (!SMTP_SECURE) {
      await sendCommand(socket, reader, "STARTTLS", ["220"], "STARTTLS");
      const upgraded = tls.connect({ socket, servername: SMTP_HOST, rejectUnauthorized: false });
      setSocket(upgraded);
      socket = upgraded;
      await new Promise((resolve, reject) => {
        socket.once("secureConnect", resolve);
        socket.once("error", reject);
        setTimeout(() => reject(new Error("STARTTLS handshake timeout")), 10000);
      });
      await sendCommand(socket, reader, `EHLO ${osHostname()}`, ["250"], "EHLO");
    }

    // AUTH PLAIN
    const b64 = Buffer.from(`\u0000${SMTP_USER}\u0000${SMTP_PASS}`).toString("base64");
    await sendCommand(socket, reader, "AUTH PLAIN " + b64, ["235"], "AUTH");

    await sendCommand(socket, reader, `MAIL FROM:<${SMTP_USER}>`, ["250"], "MAIL FROM");
    await sendCommand(socket, reader, `RCPT TO:<${to}>`, ["250", "251"], "RCPT TO");

    const boundary = "socundip01boundary";
    const relBoundary = "socundip02related";
    const crlf = (s) => s.replace(/\n/g, "\r\n");
    const chunk64 = (b64) => (String(b64).match(/.{1,76}/g) || []).join("\r\n");
    const altPart = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const rawMessage = hasAttachments
      ? crlf(
          [
            `From: SOC UNDIP <${from}>`,
            `To: <${to}>`,
            `Subject: ${subject}`,
            "MIME-Version: 1.0",
            `Content-Type: multipart/related; boundary="${relBoundary}"`,
            "",
            `--${relBoundary}`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            "",
            altPart,
            ...attachments.flatMap((a) => [
              `--${relBoundary}`,
              `Content-Type: ${a.contentType}; name="${a.filename}"`,
              "Content-Transfer-Encoding: base64",
              `Content-ID: <${a.cid}>`,
              `Content-Disposition: inline; filename="${a.filename}"`,
              "",
              chunk64(a.base64),
            ]),
            `--${relBoundary}--`,
            "",
          ].join("\r\n")
        )
      : crlf(
          [
            `From: SOC UNDIP <${from}>`,
            `To: <${to}>`,
            `Subject: ${subject}`,
            "MIME-Version: 1.0",
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            "",
            altPart,
          ].join("\r\n")
        );

    await sendCommand(socket, reader, "DATA", ["354"], "DATA");
    const dotStuffed = rawMessage.replace(/^\./gm, "..");
    socket.write(dotStuffed + "\r\n.\r\n");
    const final = await reader.response(15000);
    if (!final || final.code !== "250") {
      throw new Error(`SMTP DATA: ${final ? final.text : "timeout"}`);
    }

    try {
      socket.write("QUIT\r\n");
    } catch {
      // abaikan
    }
    socket.end();
  });
}

function osHostname() {
  // gunakan nama host lokal sederhana agar sesuai sintaks EHLO
  return "soc-ict.local";
}

/**
 * Ekspor utama: kirim email OTP.
 */
export async function sendOtpEmail({ to, name, code, expiresMinutes }) {
  const user = SMTP_USER;
  const pass = SMTP_PASS;

  if (!user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_USER and SMTP_PASS (Gmail App Password) in Backend/.env"
    );
  }

  const from = process.env.SMTP_FROM || user;

  const subject = `Your SOC UNDIP Login Code: ${code}`;
  const text = [
    `Hello ${name || "User"},`,
    "",
    `Your OTP code to log in to SOC UNDIP: ${code}`,
    `The code is valid for ${expiresMinutes} minutes. Do not share it with anyone.`,
    "",
    "If you did not request this code, please ignore this email.",
  ].join("\n");

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="UTF-8">
      <title>Your SOC UNDIP Login Code</title>
  </head>
  <body style="font-family: Arial, sans-serif; background-color: #080B1A; margin: 0; padding: 24px;">
      <div style="max-width: 560px; margin: 0 auto; background: #121836; padding: 32px; border-radius: 12px; border: 1px solid #1E2A4A;">
          <div style="text-align: center; margin-bottom: 24px;">
              ${socLogoImg(220)}
          </div>
          <h2 style="color: #F1F5F9; text-align: center; margin: 0 0 4px;">Your Login Code</h2>
          <p style="color: #94A3B8; text-align: center; font-size: 13px; margin: 0 0 20px;">Security Operation Center UNDIP</p>
          <p style="color: #CBD5E1; font-size: 15px;">Hello <strong>${name || "User"}</strong>,</p>
          <p style="color: #94A3B8; font-size: 14px; line-height: 1.6;">Use the code below to complete your login verification:</p>

          <div style="text-align: center; margin: 28px 0;">
              <span style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #A855F7 50%, #D946EF 100%); color: #ffffff; font-size: 28px; font-weight: bold; letter-spacing: 5px; padding: 15px 30px; border-radius: 8px;">${code}</span>
          </div>

          <p style="color: #94A3B8; font-size: 14px; text-align: center;">This code is valid for <strong style="color: #F1F5F9;">${expiresMinutes} minutes</strong>. Do not share it with anyone.</p>
          <hr style="border: none; border-top: 1px solid #1E2A4A; margin: 24px 0 16px;">
          <p style="color: #64748B; font-size: 12px; text-align: center;">If you did not request this code, please ignore this email.<br>&copy; 2026 SOC UNDIP. All rights reserved.</p>
      </div>
  </body>
  </html>`;

  await sendRealSmtp({ to, from, subject, text, html, attachments: socLogoAttachment() });
  return { messageId: `${Date.now()}@${SMTP_HOST}` };
}

// Email link reset password — konsep desain SOC (navy + aksen violet).
export async function sendPasswordResetEmail({ to, name, resetUrl, expiresMinutes }) {
  const user = SMTP_USER;
  const pass = SMTP_PASS;

  if (!user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_USER and SMTP_PASS (Gmail App Password) in Backend/.env"
    );
  }

  const from = process.env.SMTP_FROM || user;
  const subject = "Reset Your SOC UNDIP Password";

  const text = [
    `Hello ${name || "User"},`,
    "",
    "We received a request to reset the password for your SOC UNDIP account.",
    `Click the link below (valid for ${expiresMinutes} minutes, one-time use):`,
    resetUrl,
    "",
    "If you did not request this reset, please ignore this email.",
  ].join("\n");

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="UTF-8">
      <title>Reset Your SOC UNDIP Password</title>
  </head>
  <body style="font-family: Arial, sans-serif; background-color: #080B1A; margin: 0; padding: 24px;">
      <div style="max-width: 560px; margin: 0 auto; background: #121836; padding: 32px; border-radius: 12px; border: 1px solid #1E2A4A;">
          <div style="text-align: center; margin-bottom: 24px;">
              ${socLogoImg(220)}
          </div>
          <h2 style="color: #F1F5F9; text-align: center; margin: 0 0 4px;">Reset Your Password</h2>
          <p style="color: #94A3B8; text-align: center; font-size: 13px; margin: 0 0 20px;">Security Operation Center UNDIP</p>
          <p style="color: #CBD5E1; font-size: 15px;">Hello <strong>${name || "User"}</strong>,</p>
          <p style="color: #94A3B8; font-size: 14px; line-height: 1.6;">We received a request to reset the password for your account. Click the button below to create a new password. The link is valid for <strong style="color: #F1F5F9;">${expiresMinutes} minutes</strong> and can only be used <strong style="color: #F1F5F9;">once</strong>.</p>
          <div style="text-align: center; margin: 28px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #A855F7 50%, #D946EF 100%); color: #ffffff; font-size: 15px; font-weight: bold; padding: 13px 36px; border-radius: 8px; text-decoration: none;">Reset Password</a>
          </div>
          <p style="color: #64748B; font-size: 12px; text-align: center; word-break: break-all;">Or copy this link:<br><span style="color: #A78BFA;">${resetUrl}</span></p>
          <hr style="border: none; border-top: 1px solid #1E2A4A; margin: 24px 0 16px;">
          <p style="color: #64748B; font-size: 12px; text-align: center;">If you did not request this reset, please ignore this email.<br>&copy; 2026 SOC UNDIP. All rights reserved.</p>
      </div>
  </body>
  </html>`;

  await sendRealSmtp({ to, from, subject, text, html, attachments: socLogoAttachment() });
  return { messageId: `${Date.now()}@${SMTP_HOST}` };
}