import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config Vitest séparée de `vite.config.ts` : ce dernier configure HTTPS +
// le proxy `/api` vers le backend (nécessaires en dev, sans objet pour des
// tests unitaires qui mockent `api/client.ts`).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
