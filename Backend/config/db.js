// config/db.js
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',           // Ganti dengan user postgres Anda
    host: 'localhost',          // IP server database
    database: 'wazuh_events',   // Nama database Anda
    password: 'wazuh123',  // Password database Anda
    port: 5432,
});

// Test koneksi saat server baru nyala
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Gagal koneksi ke PostgreSQL:', err.stack);
    }
    console.log('Berhasil terhubung ke database PostgreSQL');
    release();
});

module.exports = pool;