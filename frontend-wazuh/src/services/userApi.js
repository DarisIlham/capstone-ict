import API from "../config/Api.js";

/**
 * Tambah user baru (admin only)
 */
export const addNewUser = async (userData) => {
  const response = await API.post("/api/users", userData);
  return response.data;
};

/**
 * Ambil semua user dengan pagination (admin only)
 */
export const fetchAllUsers = async (page = 1, limit = 10) => {
  const response = await API.get(`/api/users?page=${page}&limit=${limit}`);
  return response.data;
};

/**
 * Ambil detail user (admin only)
 */
export const fetchUserDetail = async (userId) => {
  const response = await API.get(`/api/users/${userId}`);
  return response.data;
};

/**
 * Hapus user (admin only)
 */
export const deleteUserAccount = async (userId) => {
  const response = await API.delete(`/api/users/${userId}`);
  return response.data;
};

/**
 * Suspend user untuk 2 jam (admin only)
 */
export const suspendUserAccount = async (userId, durationMinutes = 120) => {
  const response = await API.post(`/api/users/${userId}/suspend`, {
    durationMinutes,
  });
  return response.data;
};

/**
 * Restore user dari pending (admin only)
 */
export const restoreUserAccount = async (userId) => {
  const response = await API.post(`/api/users/${userId}/restore`);
  return response.data;
};

/**
 * Ubah role user (admin only)
 */
export const changeUserRole = async (userId, role) => {
  const response = await API.put(`/api/users/${userId}/role`, { role });
  return response.data;
};
