import { expect, type Page } from '@playwright/test'

/**
 * Первый запуск в «Safari на iPhone» показывает экран установки — закрываем его
 * и ждём нижнюю навигацию: это значит, что приложение готово к касаниям.
 */
export async function openApp(page: Page, path = '') {
  await page.goto('')
  const later = page.getByRole('button', { name: 'Потом' })
  await later.waitFor({ timeout: 15_000 })
  await later.click()
  await expect(page.getByRole('link', { name: 'Сегодня' })).toBeVisible()
  await skipOnboarding(page)
  if (path) await page.goto(path)
}

/** Пройти мастер первого входа, если он есть. */
export async function skipOnboarding(page: Page) {
  const skip = page.getByRole('button', { name: 'Пропустить настройку' })
  if (await skip.isVisible({ timeout: 1000 }).catch(() => false)) await skip.click()
}
