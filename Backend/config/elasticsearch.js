// config/elasticsearch.js
import fs from "node:fs";
import { Client } from "@elastic/elasticsearch";
import { elastic } from "./env.js"; // Pastikan env.js juga sudah menggunakan export

const clientConfig = {
  node: elastic.node
};

if (elastic.username && elastic.password) {
  clientConfig.auth = {
    username: elastic.username,
    password: elastic.password
  };
}

// ES 8.x default memakai HTTPS dengan self-signed certificate.
// Tanpa opsi TLS, Node menolak chain ("self-signed certificate in
// certificate chain") dan SEMUA query ES gagal total.
// Prioritas: CA resmi via ELASTIC_CA_PATH; fallback dev: skip verifikasi
// (konsisten dengan https.Agent rejectUnauthorized:false di server.js).
if (typeof elastic.node === "string" && elastic.node.startsWith("https")) {
  const caPath = process.env.ELASTIC_CA_PATH;
  if (caPath && fs.existsSync(caPath)) {
    clientConfig.tls = { ca: fs.readFileSync(caPath) };
  } else {
    clientConfig.tls = { rejectUnauthorized: false };
  }
}

// Ganti module.exports dengan export default
const client = new Client(clientConfig);
export default client;