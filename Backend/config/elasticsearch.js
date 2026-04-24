// config/elasticsearch.js
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

// Ganti module.exports dengan export default
const client = new Client(clientConfig);
export default client;