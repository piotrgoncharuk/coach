import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openApp } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T08:00:00') })
})

test('утренний чек-ин на главном: готовность с открытой формулой', async ({ page }) => {
  await openApp(page)
  await page.getByRole('radiogroup', { name: 'Энергия' }).getByRole('radio', { name: '4' }).click()
  await page.getByRole('radiogroup', { name: 'Мышцы болят' }).getByRole('radio', { name: '2' }).click()
  await page.getByRole('radiogroup', { name: 'Стресс' }).getByRole('radio', { name: '2' }).click()
  await page.getByRole('button', { name: 'Посчитать готовность' }).click()
  await expect(page.getByText('Зелёный')).toBeVisible()
  await page.getByRole('button', { name: 'Как посчитано' }).click()
  await expect(page.getByText(/75 базовых \+ сон \+ энергия/)).toBeVisible()
})

test('вес и питание: запись, блюдо одним касанием, повтор вчерашнего', async ({ page }) => {
  await openApp(page, 'progress')
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Вес: больше на 0.1' }).click()
  await page.getByRole('button', { name: 'Записать вес' }).click()
  await expect(page.getByText('Записано ✓')).toBeVisible()

  await page.getByRole('link', { name: 'Питание' }).click()
  await page.getByLabel('Что съел').fill('Творог 5%')
  await page.getByLabel('Ккал', { exact: true }).fill('300')
  await page.getByLabel('Белок, г').fill('35')
  await page.getByLabel('Сохранить как блюдо').check()
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(page.getByText('300 ккал · 35 г').first()).toBeVisible()
  // сохранённое блюдо — одним касанием
  await page.getByRole('button', { name: /Творог 5% 300 ккал · 35 г/ }).click()
  await expect(page.getByLabel('Белок: 70 из 195 г').or(page.getByText('600 ккал · 70 г'))).toBeVisible()

  // на следующий день — «повторить вчерашнее»
  await page.clock.setFixedTime(new Date('2026-11-18T08:00:00'))
  await page.reload()
  await page.getByRole('button', { name: /Повторить вчерашнее \(2\)/ }).click()
  await expect(page.getByText('600 ккал · 70 г')).toBeVisible()
})

test('импорт прошлых тренировок и экспорт всех данных', async ({ page }) => {
  await openApp(page, 'progress/analytics')
  const json = JSON.stringify({ sessions: [
    { date: '2026-11-03', exercises: [{ exercise: 'Приседания со штангой', sets: [{ weightKg: 80, reps: 8, rir: 2 }, { weightKg: 80, reps: 8 }] }] },
    { date: '2026-11-10', exercises: [{ exercise: 'barbell squat', sets: [{ weightKg: 85, reps: 6, rir: 2 }] }] },
  ] })
  await page.getByLabel('JSON для импорта').fill(json)
  await page.getByRole('button', { name: 'Импортировать' }).click()
  await expect(page.getByText('Тренировок добавлено: 2.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Расчётный 1ПМ' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Упражнение' })).toHaveValue(/.+/)

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать всё (JSON)' }).click()])
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(backup.format).toBe('coach-export')
  expect(backup.tables.sessions).toHaveLength(2)
  expect(backup.tables.sets).toHaveLength(3)
})

test('вкладки прогресса подсвечивают открытый раздел', async ({ page }) => {
  await openApp(page, 'progress/analytics')
  await expect(page.getByRole('link', { name: 'Аналитика' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Тело' })).not.toHaveAttribute('aria-current', 'page')
})
