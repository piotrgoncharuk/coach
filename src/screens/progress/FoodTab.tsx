import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { addDays, dayTotals, localDate, weekAverage } from '../../domain'
import { db } from '../../lib/db'
import { addFood, deleteFood, deleteMeal, repeatDay, saveMeal, savedMeals } from '../../lib/nutrition'
import { alive } from '../../lib/workout'
import { Button, Card, Field } from '../../ui/components'
import { Ring } from '../../ui/Ring'

/** Простой учёт: без базы продуктов, только название, калории и белок. */
export function FoodTab() {
  const today = localDate()
  const data = useLiveQuery(async () => {
    const entries = alive(await db.nutritionEntries.toArray())
    const profile = await db.profiles.toCollection().first()
    return {
      todayList: entries.filter((e) => e.date === today).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
      totals: dayTotals(entries, today),
      week: weekAverage(entries, today),
      yesterday: entries.filter((e) => e.date === addDays(today, -1)).length,
      meals: await savedMeals(),
      kcal: profile?.kcalTarget ?? 3000,
      protein: profile?.proteinTarget ?? 190,
    }
  }, [today])
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [keep, setKeep] = useState(false)

  if (!data) return null
  const valid = name.trim() && Number(kcal) >= 0 && kcal !== '' && protein !== ''

  async function add() {
    const k = Number(kcal.replace(',', '.'))
    const p = Number(protein.replace(',', '.'))
    const meal = keep ? await saveMeal(name, k, p) : null
    await addFood(today, name, k, p, meal?.id ?? null)
    setName(''); setKcal(''); setProtein(''); setKeep(false)
  }

  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-around">
        <Ring value={data.totals.proteinG} target={data.protein} label="Белок" unit="г" />
        <Ring value={data.totals.kcal} target={data.kcal} label="Калории" unit="ккал" />
      </Card>

      {data.meals.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm text-fg-3">Мои блюда — одно касание</h2>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
            {data.meals.map((m) => (
              <button key={m.id} onClick={() => void addFood(today, m.name, m.kcal, m.proteinG, m.id)}
                className="flex min-h-touch shrink-0 flex-col items-start justify-center rounded-card bg-raised px-3 py-1 text-left">
                <span className="text-sm">{m.name}</span>
                <span className="tnum text-xs text-fg-3">{m.kcal} ккал · {m.proteinG} г</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {data.yesterday > 0 && data.todayList.length === 0 && (
        <Button className="w-full" onClick={() => void repeatDay(addDays(today, -1), today)}>Повторить вчерашнее ({data.yesterday})</Button>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Добавить</h2>
        <div className="space-y-2">
          <Field label="Что съел" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Например: курица с рисом" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ккал" type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.currentTarget.value)} />
            <Field label="Белок, г" type="number" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.currentTarget.value)} />
          </div>
          <label className="flex min-h-touch items-center gap-3 text-sm">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.currentTarget.checked)} className="size-5 accent-[var(--c-accent)]" />
            Сохранить как блюдо
          </label>
          <Button variant="primary" className="w-full" disabled={!valid} onClick={() => void add()}>Добавить</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-semibold">Сегодня</h2>
          <span className="tnum text-sm text-fg-3">{data.totals.kcal} ккал · {data.totals.proteinG} г</span>
        </div>
        {data.todayList.length === 0 ? (
          <p className="py-2 text-sm text-fg-3">Пока ничего не записано.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.todayList.map((e) => (
              <li key={e.id} className="flex min-h-touch items-center gap-3">
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="tnum text-sm text-fg-2">{e.kcal} · {e.proteinG} г</span>
                <button aria-label={`Удалить «${e.name}»`} className="size-touch text-fg-3" onClick={() => void deleteFood(e.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">Среднее за неделю</h2>
        {data.week.daysLogged === 0 ? (
          <p className="text-sm text-fg-3">Записей за неделю нет.</p>
        ) : (
          <p className="tnum text-sm">{data.week.kcal} ккал и {data.week.proteinG} г белка в день <span className="text-fg-3">· по {data.week.daysLogged} дн. с записями</span></p>
        )}
      </Card>

      {data.meals.length > 0 && (
        <details className="rounded-card border border-border bg-surface p-4">
          <summary className="min-h-touch cursor-pointer font-semibold">Управлять блюдами</summary>
          <ul className="mt-2 divide-y divide-border">
            {data.meals.map((m) => (
              <li key={m.id} className="flex min-h-touch items-center gap-3">
                <span className="flex-1">{m.name}</span>
                <button aria-label={`Удалить блюдо «${m.name}»`} className="size-touch text-fg-3" onClick={() => void deleteMeal(m.id)}>✕</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
