import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['lemua-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Lemua',
        short_name: 'Lemua',
        description: 'A calm, personal home for your EPUB library.',
        theme_color: '#863bff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'lemua-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'lemua-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'lemua-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
      },
    }),
  ],
})
