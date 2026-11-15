import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In dev, forward /api to the local backend (cd backend && npm run dev)
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
