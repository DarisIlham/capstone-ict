import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Local dev serves from "/" while the production build stays under "/project"
  // (csirt.undip.ac.id/project).
  base: command === 'build' ? '/project' : '/',
  plugins: [react(), tailwindcss(),],
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
}));
