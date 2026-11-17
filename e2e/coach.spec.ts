import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.clock.install({ time: new Date('2026-11-17T09:00:00') })
})

test('тренер без MCP: сводка в буфер, правка обратно, «было/стало», принять → новая версия', async ({ page }) => {
  await openApp(page, '', { keepOnboarding: true })
  await page.getByLabel('Имя').fill('Пётр')
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByRole('heading', { name: 'Привет, Пётр' })).toBeVisible({ timeout: 20_000 })

  await page.goto('coach')
  await expect(page.getByText(/синхронизация пока не включена/)).toBeVisible()
  await page.getByRole('button', { name: 'Сводка за 7 дней' }).click()
  await expect(page.getByText(/скопирована/)).toBeVisible()
  const summary = await page.evaluate(() => navigator.clipboard.readText())
  expect(summary).toContain('Сводка Coach за 7 дн.')
  expect(summary).toContain('[Barbell_Squat]')

  // «ответ тренера»
  const answer = JSON.stringify({
    title: 'Фронтальный присед вместо классики', rationale: 'Бережнее для поясницы',
    changes: [{ op: 'replace_exercise', day: 1, exercise: 'Barbell_Squat', with: 'Front_Barbell_Squat' }, { op: 'update_exercise', day: 2, exercise: 'Face_Pull', sets: 4 }],
  })
  await page.getByLabel('Правка от тренера').fill('Вот правка:\n' + answer)
  await page.getByRole('button', { name: 'Проверить и добавить во входящие' }).click()
  await expect(page.getByText(/не JSON/)).toBeVisible()
  await page.getByLabel('Правка от тренера').fill(answer)
  await page.getByRole('button', { name: 'Проверить и добавить во входящие' }).click()
  await expect(page.getByText('Правка ждёт решения во вкладке «Программа».')).toBeVisible()

  await page.getByRole('link', { name: 'Сегодня' }).click()
  await expect(page.getByText('Тренер предлагает правку программы (1).')).toBeVisible()

  await page.getByRole('link', { name: 'Программа' }).click()
  await expect(page.getByRole('heading', { name: 'Фронтальный присед вместо классики' })).toBeVisible()
  await expect(page.getByLabel('убрано').first()).toBeVisible()
  await expect(page.getByText('Фронтальные приседания').first()).toBeVisible()
  await expect(page.getByText(/стало:.*4 × 12–20/)).toBeVisible()
  await page.getByRole('button', { name: 'Принять' }).click()
  await expect(page.getByText('версия 2')).toBeVisible()
  await expect(page.getByRole('button', { name: /Фронтальные приседания/ })).toBeVisible()

  await page.getByRole('button', { name: 'Версии' }).click()
  await expect(page.getByRole('button', { name: 'Откатиться' })).toBeVisible()
})
