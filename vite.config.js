import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200
  },
  server: {
    port: 5173,
    // durante `vite dev`, encaminha /api para o `vercel dev` na 3000
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true }
    }
  }
});
