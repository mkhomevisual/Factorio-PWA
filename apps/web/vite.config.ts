import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: 'HAL Factory Control',
        short_name: 'HAL Factory',
        description: 'Soukromé řízení továrny HAL1000.',
        id: '/',
        lang: 'cs',
        theme_color: '#0a100e',
        background_color: '#0a100e',
        display: 'standalone',
        orientation: 'any',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: {
        navigateFallback: '/index.html',
        clientsClaim: true,
        importScripts: ['/pwa-migration.js']
      }
    })
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } }
});
