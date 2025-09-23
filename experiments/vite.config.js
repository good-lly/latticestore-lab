import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: ['localhost', '*.ngrok-free.app'],
    port: 8080,
  },
});
