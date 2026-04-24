// config/env.js
import dotenv from "dotenv";

// Inisialisasi dotenv
dotenv.config();

// Ekspor konstanta 'port' secara bernama (Named Export)
export const port = Number(process.env.PORT) || 3001;

// Ekspor konstanta 'elastic' secara bernama (Named Export)
export const elastic = {
  node: process.env.ELASTIC_NODE || "http://localhost:9200",
  username: process.env.ELASTIC_USERNAME || "",
  password: process.env.ELASTIC_PASSWORD || "",
  index: process.env.ELASTIC_INDEX || "filebeat-*"
};