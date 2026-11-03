// config/elasticsearch.js
import { Client } from "@elastic/elasticsearch";
import { elastic } from "./env.js"; // Pastikan env.js juga sudah menggunakan export
import { ELASTIC_TLS } from "./tls.js";

const clientConfig = {
  node: elastic.node
};

if (elastic.username && elastic.password) {
  clientConfig.auth = {
    username: elastic.username,
    password: elastic.password
  };
}

// ES 8.x default memakai HTTPS. Verifikasi sertifikat aktif secara default
// di production; set ELASTIC_CA_PATH untuk CA internal. Di development,
// verifikasi hanya dimatikan bila CA tidak tersedia (dengan peringatan).
if (typeof elastic.node === "string" && elastic.node.startsWith("https")) {
  clientConfig.tls = ELASTIC_TLS;
}

// Ganti module.exports dengan export default
const client = new Client(clientConfig);
export default client;