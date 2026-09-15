// services/virusTotalService.js
import { virusTotalApiKey } from "../config/env.js";

const VT_API_BASE = "https://www.virustotal.com/api/v3";

const HASH_PATTERN = /^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i;

// Lookup tunggal (tanpa upload): hanya cek apakah hash sudah terindeks VirusTotal.
export async function getFileReport(inputHash) {
  const hash = String(inputHash || "").trim().toLowerCase();

  if (!HASH_PATTERN.test(hash)) {
    return { error: "invalid_hash", message: "Hash tidak valid. Gunakan md5, sha1, atau sha256." };
  }

  if (!virusTotalApiKey) {
    return {
      error: "missing_api_key",
      message: "API key VirusTotal belum dikonfigurasi di server (VIRUSTOTAL_API_KEY)."
    };
  }

  try {
    const response = await fetch(`${VT_API_BASE}/files/${hash}`, {
      headers: {
        "x-apikey": virusTotalApiKey,
        Accept: "application/json"
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      return { error: "unauthorized", message: "API key VirusTotal tidak valid atau tidak diizinkan." };
    }
    if (response.status === 404) {
      return { error: "not_found", message: "Hash ini belum pernah dianalisis VirusTotal." };
    }
    if (response.status === 429) {
      return { error: "rate_limited", message: "Terkena rate limit VirusTotal. Tunggu sebentar lalu coba lagi." };
    }
    if (!response.ok) {
      return { error: "upstream_error", message: `VirusTotal API error ${response.status}` };
    }

    const attributes = (payload.data && payload.data.attributes) || {};
    const stats = attributes.last_analysis_stats || {};
    const total =
      Number(stats.harmless || 0) +
      Number(stats.malicious || 0) +
      Number(stats.suspicious || 0) +
      Number(stats.undetected || 0) +
      Number(stats.timeout || 0) +
      Number(stats["type-unsupported"] || 0);

    return {
      success: true,
      hash,
      stats: {
        malicious: Number(stats.malicious || 0),
        suspicious: Number(stats.suspicious || 0),
        harmless: Number(stats.harmless || 0),
        undetected: Number(stats.undetected || 0),
        total
      },
      threatLabel:
        attributes.popular_threat_classification &&
        attributes.popular_threat_classification.suggested_threat_label
          ? attributes.popular_threat_classification.suggested_threat_label
          : null,
      meaningfulNames: Array.isArray(attributes.meaningful_names)
        ? attributes.meaningful_names.slice(0, 5)
        : [],
      reportUrl: `https://www.virustotal.com/gui/file/${hash}`,
      status: "completed"
    };
  } catch (error) {
    return { error: "network_error", message: error.message || "Gagal menghubungi VirusTotal." };
  }
}