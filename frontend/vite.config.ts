import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS activé sur le serveur de dev (certificat auto-signé) : condition
// nécessaire pour que le cookie `Secure` posé par le backend soit conservé
// par un vrai navigateur (voir Design Notes de spec-1-1). Le proxy /api
// garde l'appel côté navigateur same-origin (https://localhost:5173).
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    https: {},
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
