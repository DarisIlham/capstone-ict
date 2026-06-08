import axios from "axios";
import https from "https";

export const httpsAgent = new https.Agent({ rejectUnauthorized: false });
export const INDEXER_URL = process.env.INDEXER_URL;
export const INDEXER_USER = "admin";
export const INDEXER_PASS = "3Hul7FhbSClUQe0AI8J?6CcyoluD36wg";

export async function postToIndexer(body) {
  if (!INDEXER_URL) throw new Error("INDEXER_URL not configured");
  return axios.post(`${INDEXER_URL}/wazuh-alerts-*/_search`, body, {
    auth: { username: INDEXER_USER, password: INDEXER_PASS },
    httpsAgent,
  });
}
