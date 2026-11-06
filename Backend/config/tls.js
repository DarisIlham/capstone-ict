import fs from "node:fs";
import https from "node:https";

const NODE_ENV = process.env.NODE_ENV || "production";
const IS_PRODUCTION = NODE_ENV === "production";

function readCa(envName) {
  const caPath = process.env[envName];
  if (!caPath) return undefined;
  try {
    return fs.readFileSync(caPath);
  } catch (error) {
    console.error(`[tls] Failed to read ${envName}: ${error.message}`);
    return undefined;
  }
}

function readBool(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function readRejectUnauthorized(envName) {
  const requested = readBool(envName, true);
  if (requested) return true;

  if (IS_PRODUCTION) {
    console.warn(
      `[tls] ${envName}=false ignored in production; certificate verification stays enabled.`
    );
    return true;
  }

  console.warn(
    `[tls] ${envName}=false enabled for ${NODE_ENV}; TLS verification is disabled for this process.`
  );
  return false;
}

const elasticCa = readCa("ELASTIC_CA_PATH");
const smtpCa = readCa("SMTP_CA_PATH");

export const ELASTIC_TLS = {
  ca: elasticCa,
  // Verification is on by default. Internal indexers using a private CA should
  // provide it through ELASTIC_CA_PATH; ELASTIC_TLS_REJECT_UNAUTHORIZED=0 can
  // only relax verification outside production.
  rejectUnauthorized: readRejectUnauthorized("ELASTIC_TLS_REJECT_UNAUTHORIZED"),
};

export const SMTP_TLS = {
  ca: smtpCa,
  // SMTP connections carry credentials and authentication material, so a
  // configuration value must not be able to weaken TLS verification.
  rejectUnauthorized: readRejectUnauthorized("SMTP_TLS_REJECT_UNAUTHORIZED"),
};

export function createIndexerHttpsAgent() {
  return new https.Agent(ELASTIC_TLS);
}
