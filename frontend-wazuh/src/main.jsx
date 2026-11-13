import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installDemoInterceptor } from './utils/demoApi.js'
import { installAuthFetchInterceptor } from './utils/authFetch.js'

// Mode demo (data dummy): pasang interseptor fetch sebelum apa pun me-render.
installDemoInterceptor();
// Tempelkan JWT ke semua request /api agar endpoint backend yang kini
// diproteksi verifyToken tetap bisa diakses setelah login.
installAuthFetchInterceptor();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
