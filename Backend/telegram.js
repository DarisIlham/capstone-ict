// telegram.js
const axios = require('axios');

const TELEGRAM_TOKEN = '8608449792:AAHBLroi5omcNC_iimKQoN77PACV9Nfj4O0'; // Gunakan process.env lebih baik
const TELEGRAM_CHAT_ID = '8292605253';

const sendAlert = async (event) => {
    // Escape HTML special characters
    const escapeHTML = (text) => {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const message = `
🚨 <b>WAZUH ALERT</b> 🚨
-------------------------
<b>Agent:</b> ${escapeHTML(event.agentName)}
<b>User:</b> ${escapeHTML(event.username)}
<b>Path:</b> <code>${escapeHTML(event.syscheckPath)}</code>
<b>Event:</b> ${escapeHTML(event.syscheckEvent)}
<b>Description:</b> ${escapeHTML(event.ruleDescription)}
<b>Payload:</b> <pre>${escapeHTML(event.fileDiff)}</pre>
<b>Rule ID:</b> ${escapeHTML(event.ruleId)}
<b>Level:</b> ${escapeHTML(event.ruleLevel)}
    `.trim();

    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error("Gagal kirim Telegram:", error.response?.data || error.message);
    }
};

module.exports = { sendAlert };