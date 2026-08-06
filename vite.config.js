import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    /* alcança celulares um pouco mais antigos sem perder desempenho */
    target: ['es2019', 'chrome80', 'safari13'],
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
