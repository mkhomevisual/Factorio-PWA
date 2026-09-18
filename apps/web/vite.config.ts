import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HAL Factory Control',
        short_name: 'HAL Factory',
        theme_color: '#e69636',
        background_color: '#101313',
        display: 'standalone',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: { navigateFallback: '/index.html' }
    })
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } }
});
