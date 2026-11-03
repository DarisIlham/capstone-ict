import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`${name} must be set in the environment`);
  }
  return String(value);
}

export const NODE_ENV = process.env.NODE_ENV || "production";
export const IS_PRODUCTION = NODE_ENV === "production";
export const JWT_SECRET = required("JWT_SECRET");
export const RECAPTCHA_SECRET_KEY = required("RECAPTCHA_SECRET_KEY");

export const FRONTEND_URL = String(process.env.FRONTEND_URL || "").replace(/\/+$/, "");
export const FRONTEND_BASE_PATH = `/${String(process.env.FRONTEND_BASE_PATH || "project").replace(/^\/+|\/+$/g, "")}`;

function toOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return String(value || "").replace(/\/+$/, "");
  }
}

export const FRONTEND_ORIGIN = FRONTEND_URL ? toOrigin(FRONTEND_URL) : "";

const configuredOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => toOrigin(origin.trim()))
  .filter(Boolean);

const developmentOrigins = IS_PRODUCTION
  ? []
  : [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];

export const CORS_ALLOWED_ORIGINS = Array.from(
  new Set([...configuredOrigins, FRONTEND_ORIGIN, ...developmentOrigins].filter(Boolean))
);

export const TRUST_PROXY = process.env.TRUST_PROXY || "";
