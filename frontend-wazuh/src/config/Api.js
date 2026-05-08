import axios from "axios";

const HOST = import.meta.env.VITE_HOST;
const API_PORT = import.meta.env.VITE_API_PORT;
const SOCKET_PORT = import.meta.env.VITE_SOCKET_PORT;
const APP_BASE_PATH =
  import.meta.env.BASE_URL && import.meta.env.BASE_URL !== "/"
    ? import.meta.env.BASE_URL.replace(/\/$/, "")
    : "";

export const API_BASE_URL = "http://127.0.0.1:5000";
export const SOCKET_URL = `http://${HOST}:${SOCKET_PORT}`;
export const LOGIN_PATH = `${APP_BASE_PATH}/login`;

// Create Axios instance with default config
const API = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to include token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to handle errors
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired, clear and redirect to login
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== LOGIN_PATH) {
        window.location.replace(LOGIN_PATH);
      }
    }
    return Promise.reject(error);
  }
);

export default API;
