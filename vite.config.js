import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Same origin in development too, so the session cookie behaves exactly as
    // it does in production. Run the backend on 8787 alongside `npm run dev`.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
