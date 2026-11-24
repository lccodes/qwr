import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/qwr-icon.svg',
        'icons/qwr-maskable.svg',
        'data/trail-network.json',
        'data/trail-status.json'
      ],
      manifest: {
        name: 'Quogue Wildlife Refuge Trail Map',
        short_name: 'QWR Trails',
        description: 'Offline GPS trail navigator for Quogue Wildlife Refuge in Quogue, NY.',
        theme_color: '#1B4332',
        background_color: '#F7F4EC',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icons/qwr-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icons/qwr-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/data/trail-status.json') || url.pathname.endsWith('trail-status.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'qwr-trail-status-v1',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
