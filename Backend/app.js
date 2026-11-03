// app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";

// 1. Ganti SEMUA require menjadi import murni
// PENTING: Wajib tambahkan ekstensi .js untuk file lokal
import es from "./config/elasticsearch.js";
import mlRoutes from "./routes/mlRoutes.js";
import botDetectionRoutes from "./routes/botDetectionRoutes.js";
import fileScanRoutes from "./routes/fileScanRoutes.js";
import linuxCommandRoutes from "./routes/linuxCommandRoutes.js";
import virusTotalRoutes from "./routes/virusTotalRoutes.js";
import hostMonitoringRoutes from "./routes/hostMonitoringRoutes.js";

import asyncHandler from "./utils/asyncHandler.js";
import { CORS_ALLOWED_ORIGINS, TRUST_PROXY } from "./config/security.js";
import { dataLimiter } from "./middleware/rateLimiters.js";

const app = express();

if (TRUST_PROXY) {
  const normalized = String(TRUST_PROXY).trim().toLowerCase();
  if (["true", "yes", "on"].includes(normalized)) {
    app.set("trust proxy", 1);
  } else if (["false", "no", "off"].includes(normalized)) {
    app.set("trust proxy", false);
  } else if (/^\d+$/.test(normalized)) {
    app.set("trust proxy", Number(normalized));
  } else {
    app.set("trust proxy", TRUST_PROXY);
  }
}

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CORS_ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  })
);
app.use(express.json({ limit: "100kb" }));

// Root Endpoint
app.get("/", (req, res) => {
  res.json({ message: "WebIDS API is running" });
});
/*  */
// Health Check Endpoint
app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    await es.info();
    res.json({ success: true });
  })
);

// 2. Daftarkan Routes
app.use("/api/ml", dataLimiter, mlRoutes);
app.use("/api/bot-detection", dataLimiter, botDetectionRoutes);
app.use("/api/file-scans", dataLimiter, fileScanRoutes);
app.use("/api/linux-commands", dataLimiter, linuxCommandRoutes);
app.use("/api/virustotal", dataLimiter, virusTotalRoutes);
app.use("/api/host-monitoring", dataLimiter, hostMonitoringRoutes);

// 404 Handler
// NOTE: 404 and global error handlers are intentionally left to be registered
// by the server entrypoint (server.js) so additional routes can be attached
// after this module is imported. See server.js for handlers.

export default app;
