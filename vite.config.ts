import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      // Development only: forward /api to the local alerts server (see server/).
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: false,
      },
    },
  },
});
