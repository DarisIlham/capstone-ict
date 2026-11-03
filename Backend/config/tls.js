import fs from "node:fs";
import https from "node:https";

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

const elasticCa = readCa("ELASTIC_CA_PATH");
const smtpCa = readCa("SMTP_CA_PATH");

export const ELASTIC_TLS = {
  ca: elasticCa,
  // Never disable certificate verification.  Internal indexers using a
  // private CA must provide it through ELASTIC_CA_PATH.
  rejectUnauthorized: true,
};

export const SMTP_TLS = {
  ca: smtpCa,
  // SMTP connections carry credentials and authentication material, so a
  // configuration value must not be able to weaken TLS verification.
  rejectUnauthorized: true,
};

export function createIndexerHttpsAgent() {
  return new https.Agent(ELASTIC_TLS);
}
