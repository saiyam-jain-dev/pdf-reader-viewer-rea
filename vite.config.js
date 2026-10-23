import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: '.paper-build',
    emptyOutDir: false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('pdf-lib')) return 'pdf-lib';
        },
      },
    },
  },
  server: { host: '127.0.0.1', strictPort: true },
});
