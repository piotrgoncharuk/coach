import { expect, type Page } from '@playwright/test'

/**
 * Первый запуск в «Safari на iPhone» показывает экран установки — закрываем его.
 * Мастер первого входа пропускаем, если тест не проходит его сам.
 */
export async function openApp(page: Page, path = '', opts: { keepOnboarding?: boolean } = {}) {
  await page.goto('')
  const later = page.getByRole('button', { name: 'Потом' })
  await later.waitFor({ timeout: 15_000 })
  await later.click()
  const skip = page.getByRole('button', { name: 'Пропустить настройку' })
  await expect(skip.or(page.getByRole('link', { name: 'Сегодня' }))).toBeVisible()
  if (opts.keepOnboarding) return
  if (await skip.isVisible()) await skip.click()
  await expect(page.getByRole('link', { name: 'Сегодня' })).toBeVisible()
  if (path) await page.goto(path)
}

export async function skipOnboarding(page: Page) {
  const skip = page.getByRole('button', { name: 'Пропустить настройку' })
  if (await skip.isVisible({ timeout: 500 }).catch(() => false)) await skip.click()
}
