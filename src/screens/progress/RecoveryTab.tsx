import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, localDate, MUSCLE_GROUP_RU, MUSCLE_GROUPS, shortDate, VOLUME_TARGET, weekDates, weekKey, weeklyVolume, footballLoadPoints } from '../../domain'
import { db } from '../../lib/db'
import { loadAnalytics } from '../../lib/analytics'
import { alive } from '../../lib/workout'
import { Card } from '../../ui/components'
import { ReadinessCard } from './ReadinessCard'

const FLAG_CLS = { green: 'bg-success', yellow: 'bg-warn', red: 'bg-danger' } as const

export function RecoveryTab() {
  const today = localDate()
  const data = useLiveQuery(async () => {
    const checkins = alive(await db.readinessCheckins.toArray())
    const a = await loadAnalytics()
    const week = weekKey(today)
    const football = alive(await db.calendarEvents.where('date').anyOf(weekDates(today)).toArray()).filter((e) => e.type === 'football')
    return {
      history: Array.from({ length: 14 }, (_, i) => addDays(today, -13 + i)).map((d) => ({ date: d, c: checkins.find((x) => x.date === d) })),
      volume: weeklyVolume(a.sets.filter((s) => weekKey(s.date) === week), a.muscles),
      football,
      footballPoints: football.reduce((acc, f) => acc + (f.durationMin ?? 0) * (f.intensity ?? 0), 0),
      loadNow: footballLoadPoints(football.map((f) => ({ date: f.date, durationMin: f.durationMin ?? 90, intensity: f.intensity ?? 7 })), today),
    }
  }, [today])

  return (
    <div className="space-y-3">
      <ReadinessCard />

      {data && (
        <>
          <Card>
            <h2 className="mb-2 font-semibold">Готовность за 2 недели</h2>
            <div className="flex h-24 items-end gap-1" role="img" aria-label="Готовность по дням">
              {data.history.map(({ date, c }) => (
                <div key={date} className="flex flex-1 flex-col items-center gap-1">
                  <div className={`w-full rounded-t ${c?.flag ? FLAG_CLS[c.flag] : 'bg-raised'}`} style={{ height: `${c?.score ?? 6}%` }} title={`${shortDate(date)}: ${c?.score ?? 'нет чек-ина'}`} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-fg-3"><span>{shortDate(data.history[0].date)}</span><span>сегодня</span></div>
          </Card>

          <Card>
            <h2 className="mb-1 font-semibold">Объём за неделю, подходов</h2>
            <p className="mb-2 text-xs text-fg-3">Основная мышца — подход, вспомогательная — половина. Зелёная зона — ориентир для роста.</p>
            <ul className="space-y-2">
              {MUSCLE_GROUPS.map((g) => {
                const v = data.volume[g]
                const t = VOLUME_TARGET[g]
                const max = t.max * 1.2
                return (
                  <li key={g} className="text-sm">
                    <div className="flex justify-between"><span>{MUSCLE_GROUP_RU[g]}</span><span className="tnum text-fg-2">{String(v).replace('.', ',')} <span className="text-fg-3">/ {t.min}–{t.max}</span></span></div>
                    <div className="relative mt-1 h-2 rounded-full bg-raised">
                      <div className="absolute inset-y-0 rounded-full bg-success/25" style={{ left: `${(t.min / max) * 100}%`, width: `${((t.max - t.min) / max) * 100}%` }} />
                      <div className={`absolute inset-y-0 left-0 rounded-full ${v > t.max ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-1 font-semibold">Футбол на неделе</h2>
            {data.football.length === 0 ? (
              <p className="text-sm text-fg-3">Футбола на этой неделе нет.</p>
            ) : (
              <>
                <p className="tnum text-sm">{data.football.length} {data.football.length === 1 ? 'игра' : 'игры'} · нагрузка {data.footballPoints} баллов <span className="text-fg-3">(минуты × тяжесть)</span></p>
                <p className="mt-1 text-xs text-fg-3">Сейчас в готовности учитывается {data.loadNow} баллов: свежая игра — полностью, через двое суток — половина, через трое — пятая часть.</p>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
