import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' — новая версия не применяется молча: показываем кнопку «Обновить».
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'icons/*.png', 'splash/*.png', 'favicon.svg'],
      manifest: {
        id: '/',
        name: 'Coach — тренировки',
        short_name: 'Coach',
        description: 'Личный дневник тренировок: зал, футбол, прогресс',
        lang: 'ru',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0B0D10',
        theme_color: '#0B0D10',
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Фото упражнений из Supabase Storage — держим офлайн надолго.
            urlPattern: /\/storage\/v1\/object\/public\/.*\.(?:webp|png|jpg|jpeg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'coach-exercise-media',
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Запросы к API никогда не кэшируем: правда о данных живёт в IndexedDB.
            urlPattern: /\/(rest|auth|functions)\/v1\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { include: ['src/domain/**/*.ts'], exclude: ['src/domain/**/*.test.ts'] },
  },
})
