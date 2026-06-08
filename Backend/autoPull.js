import axios from "axios";

export function startAutoPull(port) {
  const ENABLE_AUTO_PULL = process.env.ENABLE_AUTO_PULL !== "0";
  const AUTO_PULL_AGENT_ID = process.env.AUTO_PULL_AGENT_ID || null;
  const AUTO_PULL_INTERVAL_MS = Number(process.env.AUTO_PULL_INTERVAL_MS || 15000);

  async function autoPullEvents() {
    if (!ENABLE_AUTO_PULL) return;
    if (!AUTO_PULL_AGENT_ID) return;

    try {
      await axios.get(`http://127.0.0.1:${port}/api/events/${AUTO_PULL_AGENT_ID}`);
      console.log(`[auto-pull] ok agent=${AUTO_PULL_AGENT_ID}`);
    } catch (e) {
      console.log("[auto-pull] gagal:", e.message);
    }
  }

  // run once + interval
  autoPullEvents();
  const id = setInterval(autoPullEvents, AUTO_PULL_INTERVAL_MS);
  return () => clearInterval(id);
}
