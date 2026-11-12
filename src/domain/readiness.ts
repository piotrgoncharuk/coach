import { clamp, round1 } from './math'

export interface Checkin {
  date: string
  /** Часы сна. */
  sleepHours: number
  /** Энергия 1–5. */
  energy: number
  /** Мышечная боль 1–5, где 5 — болит сильно. */
  soreness: number
  /** Стресс 1–5, где 5 — высокий. */
  stress: number
}

export interface FootballLoad {
  date: string
  durationMin: number
  /** Тяжесть 1–10. */
  intensity: number
}

export interface ReadinessFactor {
  label: string
  delta: number
  detail: string
}

export type ReadinessFlag = 'green' | 'yellow' | 'red'

export interface ReadinessResult {
  score: number
  flag: ReadinessFlag
  factors: ReadinessFactor[]
  /** Формула целиком — показывается пользователю, никакой магии. */
  formula: string
}

export const READINESS_BASE = 75
export const READINESS_FORMULA =
  '75 базовых + сон + энергия − мышечная боль − стресс − футбольная нагрузка за 72 часа'

/** Футбольная нагрузка = минуты × тяжесть, с затуханием: сутки — полностью, двое — половина, трое — пятая часть. */
export function footballLoadPoints(matches: FootballLoad[], today: string): number {
  const todayMs = Date.parse(`${today}T00:00:00.000Z`)
  let points = 0
  for (const m of matches) {
    const ageDays = Math.round((todayMs - Date.parse(`${m.date}T00:00:00.000Z`)) / 86_400_000)
    if (ageDays < 0 || ageDays > 3) continue
    const decay = ageDays <= 1 ? 1 : ageDays === 2 ? 0.5 : 0.2
    points += m.durationMin * m.intensity * decay
  }
  return Math.round(points)
}

/**
 * Итоговая готовность 0–100. Формула открытая и показывается на экране.
 * Зелёный — от 75, жёлтый — 50–74, красный — ниже 50.
 */
export function computeReadiness(
  checkin: Checkin,
  football: FootballLoad[] = [],
  today = checkin.date,
): ReadinessResult {
  const factors: ReadinessFactor[] = []

  const sleep = clamp(round1((checkin.sleepHours - 7.5) * 6), -30, 10)
  factors.push({
    label: 'Сон',
    delta: sleep,
    detail: `${round1(checkin.sleepHours)} ч при норме 7,5`,
  })

  const energy = round1((checkin.energy - 3) * 7)
  factors.push({ label: 'Энергия', delta: energy, detail: `${checkin.energy} из 5` })

  const soreness = round1(-(checkin.soreness - 3) * 6)
  factors.push({ label: 'Мышечная боль', delta: soreness, detail: `${checkin.soreness} из 5` })

  const stress = round1(-(checkin.stress - 3) * 5)
  factors.push({ label: 'Стресс', delta: stress, detail: `${checkin.stress} из 5` })

  const load = footballLoadPoints(football, today)
  const footballDelta = load > 0 ? -Math.min(25, round1(load / 40)) : 0
  if (load > 0) {
    factors.push({
      label: 'Футбол',
      delta: footballDelta,
      detail: `${load} баллов нагрузки за 72 часа`,
    })
  }

  const raw = READINESS_BASE + sleep + energy + soreness + stress + footballDelta
  const score = Math.round(clamp(raw, 0, 100))
  const flag: ReadinessFlag = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red'

  return { score, flag, factors, formula: READINESS_FORMULA }
}

export const READINESS_ADVICE: Record<ReadinessFlag, string> = {
  green: 'Можно работать по плану.',
  yellow: 'Сними один рабочий подход с тяжёлых упражнений или добавь запас повторов.',
  red: 'Лучше лёгкая тренировка или отдых. Тяжёлые ноги — не сегодня.',
}
