import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        viewer: resolve(__dirname, 'src/viewer/viewer.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Keep background and content scripts in their respective directories
          if (chunkInfo.name === 'background') {
            return 'background/service-worker.js';
          }
          if (chunkInfo.name === 'content') {
            return 'content/content.js';
          }
          return '[name]/[name].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          // Keep HTML files in their respective directories
          if (name.endsWith('.html')) {
            if (name.includes('popup')) {
              return 'popup/popup.html';
            }
            if (name.includes('viewer')) {
              return 'viewer/viewer.html';
            }
          }
          // Keep CSS files in their respective directories
          if (name.endsWith('.css')) {
            if (name.includes('popup')) {
              return 'popup/popup.css';
            }
            if (name.includes('viewer')) {
              return 'viewer/viewer.css';
            }
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
