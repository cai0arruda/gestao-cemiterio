import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` },
  },
});
