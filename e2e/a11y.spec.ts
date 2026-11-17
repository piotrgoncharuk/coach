import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

/** Серьёзные и критические нарушения доступности на всех основных экранах, в обеих темах. */
async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const report = bad.map((v) => `${name}: ${v.id} — ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`)
  expect(report, report.join('\n')).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T09:00:00') })
})

for (const theme of ['dark', 'light'] as const) {
  test(`доступность, тема ${theme}`, async ({ page }) => {
    await openApp(page, '', { keepOnboarding: true })
    await audit(page, 'мастер первого входа')
    await page.getByLabel('Имя').fill('Пётр')
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Дальше' }).click()
    await page.getByRole('button', { name: 'Готово' }).click()
    await expect(page.getByRole('heading', { name: 'Привет, Пётр' })).toBeVisible({ timeout: 20_000 })
    if (theme === 'light') await page.evaluate(() => document.documentElement.classList.add('light'))

    const screens: [string, string][] = [
      ['сегодня', ''], ['программа', 'program'], ['упражнения', 'exercises'], ['тело', 'progress'],
      ['питание', 'progress/food'], ['восстановление', 'progress/recovery'], ['аналитика', 'progress/analytics'],
      ['профиль', 'profile'], ['тренер', 'coach'], ['история', 'history'], ['версии', 'program/versions'],
    ]
    for (const [name, path] of screens) {
      await page.goto(path)
      if (theme === 'light') await page.evaluate(() => document.documentElement.classList.add('light'))
      await page.waitForTimeout(500)
      await audit(page, name)
    }
    await page.goto('exercises')
    await page.getByLabel('Поиск упражнений').fill('жим лежа')
    await page.getByText('Жим штанги лёжа средним хватом').click()
    if (theme === 'light') await page.evaluate(() => document.documentElement.classList.add('light'))
    await page.waitForTimeout(500)
    await audit(page, 'карточка упражнения')

    await page.goto('')
    await page.getByRole('button', { name: 'Начать тренировку' }).click()
    if (theme === 'light') await page.evaluate(() => document.documentElement.classList.add('light'))
    await page.waitForTimeout(500)
    await audit(page, 'тренировка')
    await page.getByRole('button', { name: 'Записать подход' }).click()
    await audit(page, 'таймер отдыха')
  })
}
