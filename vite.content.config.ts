import { defineConfig } from 'vite';
import { resolve } from 'path';

// Separate config for content script (IIFE format)
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't clear dist, we're adding to it
    lib: {
      entry: resolve(__dirname, 'src/content/content.ts'),
      name: 'ContentScript',
      formats: ['iife'],
      fileName: () => 'content/content.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'content/content.js',
        extend: true,
      },
    },
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
