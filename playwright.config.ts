import { defineConfig, devices } from '@playwright/test'

/**
 * Ключевые сценарии на собранном приложении (vite preview, подкаталог /coach/).
 * Запуск: npm run e2e
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/coach/',
    trace: 'off',
    ...devices['iPhone 14 Pro'],
    // браузер, установленный в окружении, если версия совпадает — найдётся сам
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [{ name: 'iphone', use: { ...devices['iPhone 14 Pro'], browserName: 'chromium' } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/coach/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
