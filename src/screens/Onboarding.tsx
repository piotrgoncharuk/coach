import { useState } from 'react'
import { LIMITATION_RU, WEEKDAY_SHORT, localDate, type Limitation } from '../domain'
import { db } from '../lib/db'
import { ensureExercises } from '../lib/exerciseData'
import { createStarterProgram } from '../lib/program'
import { ensureWeekPlanned } from '../lib/calendar'
import { save } from '../lib/repo'
import type { Profile } from '../lib/models'
import { Button, Card, Field } from '../ui/components'

const STEPS = ['Знакомство', 'Тело', 'Ограничения', 'Неделя', 'Питание', 'Программа'] as const
const ORDER = [1, 2, 3, 4, 5, 6, 0] // неделя с понедельника

/**
 * Мастер первого входа. Профиль не зашит в код: каждый — Пётр, Юлия —
 * заполняет своё сам, и стартовая программа собирается под ответы.
 */
export function Onboarding({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(profile.displayName)
  const [height, setHeight] = useState(profile.heightCm ? String(profile.heightCm) : '')
  const [weight, setWeight] = useState('')
  const [limits, setLimits] = useState<Limitation[]>([])
  const [gym, setGym] = useState<number[]>([2, 4, 6])
  const [football, setFootball] = useState<number[]>([])
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [template, setTemplate] = useState<'fullbody' | 'none'>('fullbody')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const w = Number(weight.replace(',', '.')) || null
  // ориентиры от веса: белок ~2 г/кг, калории ~31 ккал/кг — дальше правится в профиле
  const suggestedProtein = w ? Math.round((w * 2) / 5) * 5 : 160
  const suggestedKcal = w ? Math.round((w * 31) / 50) * 50 : 2600

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const chip = (on: boolean) => `min-h-touch rounded-full px-4 text-base ${on ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      await save('profiles', {
        id: profile.id, displayName: name.trim(), heightCm: Number(height.replace(',', '.')) || null,
        limitations: limits, gymWeekdays: gym, footballWeekdays: football,
        kcalTarget: Number(kcal) || suggestedKcal, proteinTarget: Number(protein) || suggestedProtein,
      })
      if (w) await save('bodyMetrics', { date: localDate(), weightKg: w, chestCm: null, waistCm: null, hipsCm: null, bicepsCm: null, thighCm: null, neckCm: null, note: null })
      if (template === 'fullbody') {
        await ensureExercises()
        if (!(await db.programs.count())) await createStarterProgram(limits)
      }
      await ensureWeekPlanned(localDate())
      // отметка «настройка пройдена» — строго последней: по ней открывается главный
      // экран, и он не должен успеть спланировать неделю раньше, чем появится программа
      await save('profiles', { id: profile.id, onboardedAt: new Date().toISOString() })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function skip() {
    await save('profiles', { id: profile.id, onboardedAt: new Date().toISOString() })
    onDone()
  }

  const last = step === STEPS.length - 1

  return (
    <div className="pt-safe pb-safe px-safe flex min-h-dvh flex-col bg-bg">
      <div className="flex min-h-touch items-center justify-between">
        <span className="text-sm text-fg-3">Шаг {step + 1} из {STEPS.length}</span>
        <button onClick={() => void skip()} className="min-h-touch px-2 text-sm text-fg-3">Пропустить настройку</button>
      </div>
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-raised" aria-hidden>
        <div className="h-full bg-accent transition-[width]" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <div className="flex-1 space-y-4">
        {step === 0 && (
          <>
            <h1 className="text-2xl font-semibold">Привет! Как тебя зовут?</h1>
            <p className="text-fg-2">Пара вопросов — и программа соберётся под тебя. Всё можно поменять потом в профиле.</p>
            <Field label="Имя" value={name} onChange={(e) => setName(e.currentTarget.value)} autoComplete="given-name" />
          </>
        )}
        {step === 1 && (
          <>
            <h1 className="text-2xl font-semibold">Рост и вес</h1>
            <p className="text-fg-2">Вес нужен для ориентира по белку и для графика. Можно пропустить.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Рост, см" type="number" inputMode="decimal" value={height} onChange={(e) => setHeight(e.currentTarget.value)} />
              <Field label="Вес, кг" type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.currentTarget.value)} />
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="text-2xl font-semibold">Что беречь?</h1>
            <p className="text-fg-2">
              Отмеченное включит осторожный режим: шаг веса не больше 2,5 кг, запас повторов не меньше двух, без отказа.
              Проблемные движения заменятся на щадящие.
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(LIMITATION_RU) as Limitation[]).map((l) => (
                <button key={l} aria-pressed={limits.includes(l)} className={chip(limits.includes(l))} onClick={() => setLimits(toggle(limits, l))}>
                  {LIMITATION_RU[l]}
                </button>
              ))}
            </div>
            <p className="text-sm text-fg-3">Ничего не отмечено — значит, ограничений нет.</p>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="text-2xl font-semibold">Обычная неделя</h1>
            <div>
              <h2 className="mb-2 font-semibold">Дни зала</h2>
              <div className="flex flex-wrap gap-2">
                {ORDER.map((d) => (
                  <button key={d} aria-pressed={gym.includes(d)} className={`${chip(gym.includes(d))} w-14 px-0`} onClick={() => setGym(toggle(gym, d))}>{WEEKDAY_SHORT[d]}</button>
                ))}
              </div>
              <p className="mt-2 text-sm text-fg-3">Дни плавают? Отметь примерные — в календаре их легко двигать.</p>
            </div>
            <div>
              <h2 className="mb-2 font-semibold">Постоянный футбол</h2>
              <div className="flex flex-wrap gap-2">
                {ORDER.map((d) => (
                  <button key={d} aria-pressed={football.includes(d)} className={`${chip(football.includes(d))} w-14 px-0`} onClick={() => setFootball(toggle(football, d))}>{WEEKDAY_SHORT[d]}</button>
                ))}
              </div>
              <p className="mt-2 text-sm text-fg-3">Нерегулярный футбол добавляется в календаре одним касанием.</p>
            </div>
            {football.some((f) => gym.includes(f)) && <p className="text-sm text-warn">Зал и футбол в один день — планировщик предупредит о нагрузке.</p>}
          </>
        )}
        {step === 4 && (
          <>
            <h1 className="text-2xl font-semibold">Питание</h1>
            <p className="text-fg-2">Дневные цели для колец на главном экране. Ориентир посчитан от веса — поправь под себя.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Калории, ккал" type="number" inputMode="numeric" placeholder={String(suggestedKcal)} value={kcal} onChange={(e) => setKcal(e.currentTarget.value)} />
              <Field label="Белок, г" type="number" inputMode="numeric" placeholder={String(suggestedProtein)} value={protein} onChange={(e) => setProtein(e.currentTarget.value)} />
            </div>
          </>
        )}
        {step === 5 && (
          <>
            <h1 className="text-2xl font-semibold">С чего начнём?</h1>
            <button onClick={() => setTemplate('fullbody')} aria-pressed={template === 'fullbody'} className={`block w-full rounded-card border p-4 text-left ${template === 'fullbody' ? 'border-accent bg-accent-soft' : 'border-border bg-surface'}`}>
              <div className="font-semibold">Всё тело, 3 дня</div>
              <div className="mt-1 text-sm text-fg-2">Сила и масса, ноги включены. День C — без тяжёлых ног, его удобно ставить перед футболом.{limits.length ? ' Ограничения учтены.' : ''}</div>
            </button>
            <button onClick={() => setTemplate('none')} aria-pressed={template === 'none'} className={`block w-full rounded-card border p-4 text-left ${template === 'none' ? 'border-accent bg-accent-soft' : 'border-border bg-surface'}`}>
              <div className="font-semibold">Без программы</div>
              <div className="mt-1 text-sm text-fg-2">Свободные тренировки: упражнения добавляешь по ходу.</div>
            </button>
            <Card>
              <p className="text-sm text-fg-2">Рабочих весов приложение не знает. Первая неделя — калибровочная: подбирай вес так, чтобы оставался запас повторов, и дальше подсказка будет считаться сама.</p>
            </Card>
            {error && <p className="text-sm text-danger">Не получилось: {error}. Нужна сеть, чтобы один раз загрузить справочник.</p>}
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
        <Button disabled={step === 0} onClick={() => setStep((s) => s - 1)} aria-label="Назад">←</Button>
        <Button variant="primary" size="action" disabled={busy} onClick={() => (last ? void finish() : setStep((s) => s + 1))}>
          {last ? (busy ? 'Собираю программу…' : 'Готово') : 'Дальше'}
        </Button>
      </div>
    </div>
  )
}
