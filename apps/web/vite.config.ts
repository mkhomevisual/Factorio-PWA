import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'HAL Factory Control',
        short_name: 'HAL Factory',
        description: 'Živý přehled výroby a společné řízení Factorio továrny.',
        lang: 'cs',
        id: '/',
        start_url: '/',
        scope: '/',
        theme_color: '#ff9f43',
        background_color: '#070b0d',
        display: 'standalone',
        orientation: 'any',
        categories: ['productivity', 'utilities'],
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: { navigateFallback: '/index.html', cleanupOutdatedCaches: true }
    })
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } }
});
