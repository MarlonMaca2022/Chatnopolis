import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss()],
  // Build del render en el servidor (dist-server, ver server/seo.js): todo adentro
  // de un solo archivo, sin depender de que el servidor resuelva client/node_modules.
  // Los íconos y archivos de public/ solo hacen falta en dist.
  ssr: { noExternal: true },
  build: { copyPublicDir: !isSsrBuild },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
}));
