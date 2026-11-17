import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('справочник: поиск по-русски, карточка с фото и техникой', async ({ page }) => {
  await openApp(page)
  await page.getByRole('link', { name: 'Упражнения' }).click()
  await page.getByLabel('Поиск упражнений').fill('жим лежа')
  await expect(page.getByText('Жим штанги лёжа средним хватом')).toBeVisible({ timeout: 20_000 })
  await page.getByText('Жим штанги лёжа средним хватом').click()
  await expect(page.getByRole('heading', { name: 'Жим штанги лёжа средним хватом' })).toBeVisible()
  await expect(page.getByText('Главное в технике')).toBeVisible()
  await expect(page.getByRole('link', { name: /Найти технику на YouTube/ })).toBeVisible()
  const photo = page.getByRole('img', { name: /начало движения/ })
  await expect(photo).toBeVisible()
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})

test('видео: неверная ссылка отклоняется, верная закрепляется', async ({ page }) => {
  await openApp(page, 'exercises')
  await page.getByLabel('Поиск упражнений').fill('Face Pull')
  await page.getByText('Тяга каната к лицу').first().click()
  const input = page.getByLabel('Ссылка на видео YouTube')
  await input.fill('https://vimeo.com/1')
  await page.getByRole('button', { name: 'Закрепить' }).click()
  await expect(page.getByText(/не похоже на ссылку YouTube/)).toBeVisible()
  await input.fill('https://youtu.be/dQw4w9WgXcQ')
  await page.getByRole('button', { name: 'Закрепить' }).click()
  await expect(page.getByRole('button', { name: 'Смотреть видео' })).toBeVisible()
})

test('тренировка: запись подхода в одно касание, таймер, итог, история', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: /Начать тренировку|Всё равно потренироваться/ }).click()
  await page.getByRole('button', { name: 'Пустая тренировка' }).click()
  await page.getByRole('button', { name: 'Добавить упражнение' }).first().click()
  await page.getByLabel('Поиск упражнения').fill('приседания со штангой')
  await page.getByRole('dialog').getByText('Приседания со штангой', { exact: true }).click()

  // первый раз — подбираем вес степпером
  for (let i = 0; i < 24; i++) await page.getByRole('button', { name: 'Вес: больше на 2.5' }).click()
  await expect(page.locator('output').filter({ hasText: /^60$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Записать подход' }).click()
  await expect(page.getByText('Отдых')).toBeVisible()
  await expect(page.getByText('60 кг × 8')).toBeVisible()

  // второй подход: пропустить отдых и снова одно касание — вес подставился
  await page.getByRole('button', { name: 'Пропустить отдых' }).click()
  await expect(page.locator('output').filter({ hasText: /^60$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Записать подход' }).click()
  await expect(page.getByText('2 из 3')).toBeVisible()

  // незавершённая тренировка переживает перезагрузку
  await page.reload()
  await expect(page.getByText('60 кг × 8').first()).toBeVisible()

  await page.getByRole('button', { name: 'Завершить' }).click()
  await page.getByRole('button', { name: '7', exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить тренировку' }).click()
  await expect(page.getByText('Свободная тренировка')).toBeVisible()
  await expect(page.getByText('60 кг × 8').first()).toBeVisible()
})
