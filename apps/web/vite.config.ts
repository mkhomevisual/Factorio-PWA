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
        theme_color: '#080a0b',
        background_color: '#080a0b',
        display: 'standalone',
        orientation: 'any',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: {
        navigateFallback: '/index.html',
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        importScripts: ['/pwa-migration.js'],
        runtimeCaching: [{
          urlPattern: /\/heroes\/.*\.webp$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'hal-section-heroes-v1',
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 }
          }
        }]
      }
    })
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } }
});
