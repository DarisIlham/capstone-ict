import bcrypt from "bcryptjs";
import pool from "../config/pg.js";

// Helper to map DB row -> user object shape used by controllers
const mapRowToUser = (row) => ({
  id: row.id,
  user_id: row.user_id || null,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.status,
  pendingUntil: row.pending_until || null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/**
 * Tambah user baru (hanya admin)
 */
export const addUser = async (name, email, password, role = "user") => {
  try {
    if (!name || !email || !password) throw new Error("Nama, email, dan password harus diisi");
    if (!["admin", "user"].includes(role)) throw new Error("Role harus 'admin' atau 'user'");

    // Cek apakah email sudah ada
    const exists = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (exists.rows.length > 0) throw new Error('Email sudah terdaftar');

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();

    const insertQ = `
      INSERT INTO users (name, email, password, role, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$6)
      RETURNING *
    `;
    const result = await pool.query(insertQ, [name, email, hashedPassword, role, 'active', now]);
    const row = result.rows[0];

    return {
      success: true,
      user: mapRowToUser(row),
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Hapus user berdasarkan id
 */
export const deleteUser = async (userId) => {
  try {
    if (!userId) throw new Error("User ID harus diisi");
    const res = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [userId]);
    if (res.rows.length === 0) throw new Error('User tidak ditemukan');
    return { success: true, message: `User '${res.rows[0].name}' berhasil dihapus` };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Set user ke status pending selama 2 jam
 */
export const pendingUser = async (userId, durationMinutes = 120) => {
  try {
    if (!userId) throw new Error('User ID harus diisi');
    if (typeof durationMinutes !== 'number' || durationMinutes <= 0) throw new Error('Duration harus bilangan positif (dalam menit)');

    const now = new Date();
    const pendingUntil = new Date(now.getTime() + durationMinutes * 60000);
    const res = await pool.query('UPDATE users SET status=$1, pending_until=$2, updated_at=$3 WHERE id=$4 RETURNING *', ['pending', pendingUntil, now, userId]);
    if (res.rows.length === 0) throw new Error('User tidak ditemukan');
    return { success: true, message: `User '${res.rows[0].name}' berhasil dipending selama ${durationMinutes} menit`, user: mapRowToUser(res.rows[0]) };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Batalkan pending status user
 */
export const unpendingUser = async (userId) => {
  try {
    if (!userId) throw new Error('User ID harus diisi');
    const now = new Date();
    const res = await pool.query('UPDATE users SET status=$1, pending_until=$2, updated_at=$3 WHERE id=$4 RETURNING *', ['active', null, now, userId]);
    if (res.rows.length === 0) throw new Error('User tidak ditemukan');
    return { success: true, message: `User '${res.rows[0].name}' dipulihkan dari pending`, user: mapRowToUser(res.rows[0]) };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Ambil semua user (untuk admin)
 */
export const getAllUsers = async (page = 1, limit = 10) => {
  try {
    const offset = (page - 1) * limit;
    const res = await pool.query('SELECT id, name, email, role, status, pending_until, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    const countRes = await pool.query('SELECT COUNT(*) as cnt FROM users');
    const total = Number(countRes.rows[0].cnt || 0);
    return {
      success: true,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      users: res.rows.map(mapRowToUser),
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Ambil user berdasarkan id
 */
export const getUserById = async (userId) => {
  try {
    const res = await pool.query('SELECT id, name, email, role, status, pending_until, created_at, updated_at FROM users WHERE id = $1', [userId]);
    if (res.rows.length === 0) throw new Error('User tidak ditemukan');
    return { success: true, user: mapRowToUser(res.rows[0]) };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Update role user
 */
export const updateUserRole = async (userId, newRole) => {
  try {
    if (!userId) throw new Error('User ID harus diisi');
    if (!['admin','user'].includes(newRole)) throw new Error("Role harus 'admin' atau 'user'");
    const now = new Date();
    const res = await pool.query('UPDATE users SET role=$1, updated_at=$2 WHERE id=$3 RETURNING *', [newRole, now, userId]);
    if (res.rows.length === 0) throw new Error('User tidak ditemukan');
    return { success: true, message: `Role user '${res.rows[0].name}' diubah menjadi '${newRole}'`, user: mapRowToUser(res.rows[0]) };
  } catch (error) {
    throw new Error(error.message);
  }
};
