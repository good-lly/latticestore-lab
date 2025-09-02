import { defineConfig } from 'vite';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: path.resolve(__dirname, 'static'),
  root: path.resolve(__dirname, './src_web'),
  plugins: [tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, './docs'), // output dir
    assetsDir: 'static',
    emptyOutDir: true,
  },
  server: {
    middlewareMode: true,
  },
});
