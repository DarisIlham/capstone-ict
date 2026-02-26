const express = require('express');
const axios = require('axios');
const https = require('https');
const cors = require('cors'); // <-- WAJIB ditambahkan untuk Vite
const { sendAlert } = require('./telegram');

const app = express();

// Mengizinkan Vite (frontend) mengambil data dari Express (backend)
app.use(cors());
app.use(express.json()); 

// --- KONFIGURASI WAZUH (GANTI SESUAI SERVER ANDA) ---
const WAZUH_API_URL = 'https://10.104.86.253:55000'; 
const WAZUH_USER = 'wazuh';
const WAZUH_PASS = '08F6oACn.1CoCX3v.mMs5DJk+WeW1y?+';

// Mengabaikan SSL certificate yang self-signed
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.get('/api/fim/:agent_id', async (req, res) => {
    try {
        const { agent_id } = req.params;

        // 1. Dapatkan Token
        const authResponse = await axios.post(`${WAZUH_API_URL}/security/user/authenticate`, {}, {
            auth: { username: WAZUH_USER, password: WAZUH_PASS },
            httpsAgent
        });
        const token = authResponse.data.data.token;

        // 2. Ambil data Syscheck menggunakan Token
        const syscheckResponse = await axios.get(`${WAZUH_API_URL}/syscheck/${agent_id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            httpsAgent
        });

        // 3. Kirim data ke Frontend
        res.json({
            success: true,
            data: syscheckResponse.data.data.affected_items 
        });

    } catch (error) {
        console.error("Error dari Wazuh:", error.message);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari Wazuh' });
    }
});

// --- KONFIGURASI WAZUH INDEXER (PORT 9200) ---
// Secara default jika Anda install Wazuh all-in-one, IP-nya sama dengan Manager
const INDEXER_URL = 'https://10.104.86.253:9200'; 
const INDEXER_USER = 'admin'; // Username bawaan Wazuh Indexer
const INDEXER_PASS = 'C?o4IFv1*OycPKaKr14sLtHlKn6Qers2'; // Password Wazuh Indexer Anda

// Route Baru: Mengambil riwayat Events Syscheck (FIM)
app.get('/api/events/:agent_id', async (req, res) => {
    try {
        const { agent_id } = req.params;

        // Query ala OpenSearch/Elasticsearch untuk mencari log FIM agen terkait
        const queryPayload = {
            query: {
                bool: {
                    must: [
                        { match: { "rule.groups": "syscheck" } },
                        { match: { "agent.id": agent_id } }
                    ]
                }
            },
            sort: [ { "@timestamp": { "order": "desc" } } ], // Urutkan dari terbaru
            size: 50 // Batasi mengambil 50 log terbaru (bisa diubah)
        };

        // Menembak endpoint wazuh-alerts di Wazuh Indexer
        const response = await axios.post(
            `${INDEXER_URL}/wazuh-alerts-*/_search`,
            queryPayload,
            {
                auth: { username: INDEXER_USER, password: INDEXER_PASS },
                httpsAgent // Menggunakan httpsAgent yg sama untuk bypass SSL
            }
        );

        // Merapikan struktur JSON dari OpenSearch agar Frontend mudah membacanya
        // Merapikan struktur JSON dari OpenSearch agar Frontend mudah membacanya
        const eventsData = response.data.hits.hits.map(hit => {
            const source = hit._source;
            
            // --- LOGIKA BARU UNTUK MENGAMBIL USERNAME ---
            // Cek apakah ada data audit (who-data), jika tidak ada ambil owner filenya
            const auditUser = source.syscheck?.audit?.login_user?.name;
            const fileOwner = source.syscheck?.uname_after || source.syscheck?.uname;
            const username = auditUser || fileOwner || '-';

            return {
                id: hit._id,
                timestamp: source['@timestamp'],
                agentName: source.agent.name,
                username: username, // <--- Field baru yang dikirim ke Frontend
                syscheckPath: source.syscheck.path,
                syscheckEvent: source.syscheck.event,
                ruleDescription: source.rule.description,
                ruleLevel: source.rule.level,
                ruleId: source.rule.id,
                fileDiff: source.syscheck?.diff || null
            };
        });

       const latestEvent = eventsData.find(e => Number(e.ruleLevel) >= 1);

        if (latestEvent) {
        await sendAlert(latestEvent);
        }
        
        res.json({ success: true, data: eventsData, total_hits: eventsData.length });

    } catch (error) {
        console.error("Error dari Wazuh Indexer:", error.message);
        res.status(500).json({ success: false, message: 'Gagal mengambil events dari Indexer' });
    }
});

app.listen(3000, () => console.log('Server Backend berjalan di http://localhost:3000'));