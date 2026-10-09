import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base => the build works from any folder or sub-domain (e.g. /dashboard/ or dashboard.example.com).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev: React on :5173, PHP API (php -S 127.0.0.1:8000 backend/dev-router.php) on :8000
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
