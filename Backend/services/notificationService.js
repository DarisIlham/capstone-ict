import pool from "../config/pg.js";

export const createAdminLoginNotification = async ({ name, email }) => {
  const displayName = name || email || "Admin";
  const desc = `Admin login berhasil: ${displayName}${email ? ` (${email})` : ""}`;

  const q = `INSERT INTO notifikasi (deskripsi, timestamp) VALUES ($1, NOW()) RETURNING *`;
  const r = await pool.query(q, [desc]);
  const row = r.rows[0];

  return {
    id: row.id,
    id_notifikasi: row.id_notifikasi || row.id,
    deskripsi: row.deskripsi,
    timestamp: row.timestamp,
  };
};

export const getNotifications = async (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  const qItems = `SELECT * FROM notifikasi ORDER BY timestamp DESC LIMIT $1 OFFSET $2`;
  const qCount = `SELECT COUNT(*)::int AS total FROM notifikasi`;

  const [itemsRes, countRes] = await Promise.all([
    pool.query(qItems, [limit, offset]),
    pool.query(qCount),
  ]);

  const total = countRes.rows[0]?.total || 0;

  return {
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    },
    notifications: (itemsRes.rows || []).map((row) => ({
      id: row.id,
      id_notifikasi: row.id_notifikasi || row.id,
      deskripsi: row.deskripsi,
      timestamp: row.timestamp,
    })),
  };
};
