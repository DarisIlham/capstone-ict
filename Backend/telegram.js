// telegram.js
const axios = require('axios');

const TELEGRAM_TOKEN = '8608449792:AAHBLroi5omcNC_iimKQoN77PACV9Nfj4O0'; // Gunakan process.env lebih baik
const TELEGRAM_CHAT_ID = '8292605253';

const tg = axios.create({
  baseURL: `https://api.telegram.org/bot${TELEGRAM_TOKEN}`,
  timeout: 10_000,
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const escapeHTML = (text) => {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Potong biar tidak tembus limit Telegram
const clamp = (s, max = 3800) => { // kasih ruang untuk header
  s = s || '';
  return s.length > max ? (s.slice(0, max) + '…(truncated)') : s;
};

async function sendMessageWithRetry(payload, maxAttempts = 5) {
  let attempt = 0;
  let backoff = 800;

  while (true) {
    attempt++;
    try {
      await tg.post('/sendMessage', payload);
      return;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;

      // Handle Telegram rate limit 429
      if (status === 429) {
        const retryAfterSec = data?.parameters?.retry_after || 2;
        await sleep((retryAfterSec + 1) * 1000);
      }
      // Transient errors: 5xx atau network/timeout
      else if (!status || status >= 500) {
        if (attempt >= maxAttempts) throw err;
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 8000);
      } else {
        // 4xx lain biasanya error permanen (bad request, dsb)
        throw err;
      }

      if (attempt >= maxAttempts) throw err;
    }
  }
}

const sendAlert = async (event) => {
  const diffSafe = event.fileDiff ? clamp(escapeHTML(event.fileDiff), 2500) : '-';

  const message = `
🚨 <b>WAZUH ALERT</b> 🚨
-------------------------
<b>Agent:</b> ${escapeHTML(event.agentName)}
<b>User:</b> ${escapeHTML(event.username)}
<b>Path:</b> <code>${escapeHTML(event.syscheckPath)}</code>
<b>Event:</b> ${escapeHTML(event.syscheckEvent)}
<b>Description:</b> ${escapeHTML(event.ruleDescription)}
<b>Payload:</b> <pre>${diffSafe}</pre>
<b>Rule ID:</b> ${escapeHTML(event.ruleId)}
<b>Level:</b> ${escapeHTML(event.ruleLevel)}
  `.trim();

  try {
    await sendMessageWithRetry({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error("Gagal kirim Telegram:", error.response?.data || error.message);
  }
};

module.exports = { sendAlert };