import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: true }
    }
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
    proxy: {
      '/api': { target: backend, changeOrigin: true }
    }
  }
});
