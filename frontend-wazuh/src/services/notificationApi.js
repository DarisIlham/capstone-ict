import API from "../config/Api.js";

export const fetchNotifications = async (page = 1, limit = 10) => {
  const response = await API.get(`/api/notifications?page=${page}&limit=${limit}`);
  return response.data;
};
