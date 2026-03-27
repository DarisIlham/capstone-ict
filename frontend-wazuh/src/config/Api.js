const HOST = import.meta.env.VITE_HOST;
const API_PORT = import.meta.env.VITE_API_PORT;
const SOCKET_PORT = import.meta.env.VITE_SOCKET_PORT;

export const API_BASE_URL = "http://127.0.0.1:5000";
export const SOCKET_URL = `http://${HOST}:${SOCKET_PORT}`;