import { db } from './db'
import { save, softDelete } from './repo'
import { alive } from './workout'
import { addDays } from '../domain'
import type { NutritionEntry, SavedMeal } from './models'

export async function addFood(date: string, name: string, kcal: number, proteinG: number, savedMealId: string | null = null): Promise<NutritionEntry> {
  if (savedMealId) {
    const meal = await db.savedMeals.get(savedMealId)
    if (meal) await save('savedMeals', { id: meal.id, useCount: meal.useCount + 1 })
  }
  return save('nutritionEntries', { date, name: name.trim(), kcal: Math.round(kcal), proteinG: Math.round(proteinG), savedMealId })
}

export async function saveMeal(name: string, kcal: number, proteinG: number): Promise<SavedMeal> {
  const same = alive(await db.savedMeals.toArray()).find((m) => m.name.toLowerCase() === name.trim().toLowerCase())
  return save('savedMeals', { id: same?.id, name: name.trim(), kcal: Math.round(kcal), proteinG: Math.round(proteinG), useCount: same?.useCount ?? 0 })
}

export async function savedMeals(): Promise<SavedMeal[]> {
  return alive(await db.savedMeals.toArray()).sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name, 'ru'))
}

/** «Повторить вчерашнее»: копии записей вчерашнего дня на сегодня. */
export async function repeatDay(fromDate: string, toDate: string): Promise<number> {
  const src = alive(await db.nutritionEntries.where('date').equals(fromDate).toArray())
  for (const e of src) await addFood(toDate, e.name, e.kcal, e.proteinG, e.savedMealId)
  return src.length
}

export async function yesterdayCount(today: string): Promise<number> {
  return alive(await db.nutritionEntries.where('date').equals(addDays(today, -1)).toArray()).length
}

export async function deleteFood(id: string) {
  await softDelete('nutritionEntries', id)
}

export async function deleteMeal(id: string) {
  await softDelete('savedMeals', id)
}
