// app.js
import express from "express";
import cors from "cors";

// 1. Ganti SEMUA require menjadi import murni
// PENTING: Wajib tambahkan ekstensi .js untuk file lokal
import es from "./config/elasticsearch.js";
import mlRoutes from "./routes/mlRoutes.js";
import fileScanRoutes from "./routes/fileScanRoutes.js";
import linuxCommandRoutes from "./routes/linuxCommandRoutes.js";

import asyncHandler from "./utils/asyncHandler.js";
import { unwrapEsResponse } from "./utils/esHelpers.js";

const app = express();

app.use(cors());
app.use(express.json());

// Root Endpoint
app.get("/", (req, res) => {
  res.json({
    message: "WebIDS Elasticsearch API is running",
    endpoints: {
      health: "/api/health",
      mlPredictions: "/api/ml/predictions",
      fileScans: "/api/file-scans",
      linuxCommands: "/api/linux-commands"
    }
  });
});

// Health Check Endpoint
app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    // Memanggil .info() dari client elasticsearch
    const info = await es.info(); 
    const data = unwrapEsResponse(info);

    res.json({
      success: true,
      cluster: data.cluster_name || null,
      version: data.version?.number || null
    });
  })
);

// 2. Daftarkan Routes
app.use("/api/ml", mlRoutes);
app.use("/api/file-scans", fileScanRoutes);
app.use("/api/linux-commands", linuxCommandRoutes);

// 404 Handler
// NOTE: 404 and global error handlers are intentionally left to be registered
// by the server entrypoint (server.js) so additional routes can be attached
// after this module is imported. See server.js for handlers.

export default app;