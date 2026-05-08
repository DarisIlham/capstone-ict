import { randomUUID } from "crypto";
import pool from "../config/pg.js";

let initializationPromise = null;

function mapRowToEndpoint(row) {
  return {
    id: row.id,
    url: row.endpoint_url,
    status: "review",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeStoredEndpoint(endpoint = "") {
  const trimmed = String(endpoint).trim();
  if (!trimmed) {
    const error = new Error("Endpoint URL harus diisi");
    error.statusCode = 400;
    throw error;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsedUrl;
  try {
    parsedUrl = new URL(withProtocol);
  } catch {
    const error = new Error("Format endpoint URL tidak valid");
    error.statusCode = 400;
    throw error;
  }

  if (!parsedUrl.hostname) {
    const error = new Error("Format endpoint URL tidak valid");
    error.statusCode = 400;
    throw error;
  }

  const pathname =
    parsedUrl.pathname && parsedUrl.pathname !== "/"
      ? parsedUrl.pathname.replace(/\/+$/, "")
      : "";

  return `${parsedUrl.host.toLowerCase()}${pathname}${parsedUrl.search}`;
}

export async function initializeWebDefacementEndpointStore() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS web_defacement_endpoints (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          endpoint_url TEXT NOT NULL UNIQUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

export async function listWebDefacementEndpoints() {
  await initializeWebDefacementEndpointStore();

  const result = await pool.query(`
    SELECT id, endpoint_url, created_at, updated_at
    FROM web_defacement_endpoints
    ORDER BY created_at ASC, endpoint_url ASC
  `);

  return result.rows.map(mapRowToEndpoint);
}

export async function createWebDefacementEndpoint(endpointUrl) {
  await initializeWebDefacementEndpointStore();

  const normalizedUrl = normalizeStoredEndpoint(endpointUrl);

  try {
    const result = await pool.query(
      `
        INSERT INTO web_defacement_endpoints (id, endpoint_url, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        RETURNING id, endpoint_url, created_at, updated_at
      `,
      [randomUUID(), normalizedUrl]
    );

    return mapRowToEndpoint(result.rows[0]);
  } catch (error) {
    if (error?.code === "23505") {
      const duplicateError = new Error("Endpoint URL sudah terdaftar");
      duplicateError.statusCode = 409;
      throw duplicateError;
    }

    throw error;
  }
}

export async function deleteWebDefacementEndpoint(endpointId) {
  await initializeWebDefacementEndpointStore();

  const result = await pool.query(
    `
      DELETE FROM web_defacement_endpoints
      WHERE id = $1
      RETURNING id, endpoint_url, created_at, updated_at
    `,
    [endpointId]
  );

  if (!result.rows.length) {
    const error = new Error("Endpoint URL tidak ditemukan");
    error.statusCode = 404;
    throw error;
  }

  return mapRowToEndpoint(result.rows[0]);
}
