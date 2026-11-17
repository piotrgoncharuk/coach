import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test.beforeEach(async ({ page }) => {
  // вторник, 17 ноября 2026
  await page.clock.install({ time: new Date('2026-11-17T09:00:00') })
})

test('мастер первого входа собирает программу под ограничения, календарь без конфликтов', async ({ page }) => {
  await openApp(page, '', { keepOnboarding: true })
  await page.getByLabel('Имя').fill('Пётр')
  await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByLabel('Рост, см').fill('193')
  await page.getByLabel('Вес, кг').fill('97')
  await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Спина, поясница' }).click()
  await page.getByRole('button', { name: 'Задняя поверхность бедра' }).click()
  await page.getByRole('button', { name: 'Дальше' }).click()
  // зал вт/чт/сб уже отмечен по умолчанию, добавляем футбол в воскресенье (второй ряд кнопок)
  await page.getByRole('button', { name: 'вс', exact: true }).nth(1).click()
  await page.getByRole('button', { name: 'Дальше' }).click()
  await expect(page.getByLabel('Белок, г')).toHaveAttribute('placeholder', '195')
  await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Готово' }).click()

  await expect(page.getByRole('heading', { name: 'Привет, Пётр' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/День A — присед и жим/)).toBeVisible()

  await page.getByRole('link', { name: 'Программа' }).click()
  await expect(page.getByText('Эта неделя')).toBeVisible()
  // вт — A, чт — B, сб — C, вс — футбол, конфликтов нет
  await expect(page.getByRole('button', { name: /вторник, 17 ноября: зал День A/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /четверг, 19 ноября: зал День B/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /суббота, 21 ноября: зал День C/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /воскресенье, 22 ноября: .*футбол/ })).toBeVisible()
  await expect(page.getByText(/Ноги не успеют|ещё не восстановились/)).toHaveCount(0)

  // румынская тяга — в осторожном режиме
  const rdl = page.getByRole('button', { name: /Румынская тяга/ })
  await expect(rdl).toContainText('запас 3')
  await expect(rdl).toContainText('осторожно')

  // внеплановый футбол в среду: между двумя днями ног → конфликт и перенос
  await page.getByRole('button', { name: /среда, 18 ноября/ }).click()
  await page.getByRole('button', { name: '⚽ Добавить футбол' }).click()
  await page.getByRole('button', { name: 'Закрыть' }).last().click()
  // два конфликта: вторник накануне футбола и четверг после него
  await expect(page.getByText(/Ноги не успеют/)).toBeVisible()
  await expect(page.getByText(/ещё не восстановились/)).toBeVisible()
  await page.getByRole('button', { name: /^Перенести на пятницу/ }).first().click()
  // вторник уехал на пятницу — первый конфликт снят, на прошедший понедельник не предлагалось
  await expect(page.getByText(/Ноги не успеют/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /пятница, 20 ноября: зал День A/ })).toBeVisible()
})

test('тренировка из дня программы: упражнения дня A и подсказка калибровки', async ({ page }) => {
  await openApp(page, '', { keepOnboarding: true })
  await page.getByLabel('Имя').fill('Юлия')
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByRole('heading', { name: 'Привет, Юлия' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Начать тренировку' }).click()
  await expect(page.getByRole('heading', { name: 'Приседания со штангой' })).toBeVisible()
  await expect(page.getByText('Первый раз — подбери рабочий вес')).toBeVisible()
  await expect(page.getByRole('button', { name: /^6\. «Мёртвый жук»/ })).toBeVisible()
})
