import { fmtKg } from './math'
import { MUSCLE_GROUP_RU, MUSCLE_GROUPS, type MuscleGroup } from './types'
import { describeTargets, LIMITATION_RU, type Limitation, type ProgramSnapshot } from './program'
import { WEEKDAY_SHORT, shortDate } from './dates'

export interface SummarySession {
  date: string
  dayName: string | null
  durationMin: number
  difficulty: number | null
  note: string | null
  exercises: { name: string; sets: { weightKg: number; reps: number; rir: number | null; type: string }[] }[]
}

export interface SummaryInput {
  from: string
  to: string
  profile: { name: string; heightCm: number | null; limitations: string[]; gymWeekdays: number[]; footballWeekdays: number[]; kcalTarget: number; proteinTarget: number }
  program: (ProgramSnapshot & { version: number }) | null
  nameOf: (exerciseId: string) => string
  /** Короткая ссылка для правок: id открытой базы, а для своих упражнений — UUID. */
  refOf: (exerciseId: string) => string
  sessions: SummarySession[]
  plannedGym: number
  volume: Record<MuscleGroup, number>
  football: { date: string; durationMin: number | null; intensity: number | null }[]
  readiness: { date: string; score: number | null; flag: string | null }[]
  weight: { avgKg: number | null; paceKgWeek: number | null }
  nutrition: { kcal: number; proteinG: number; daysLogged: number }
  records: { exercise: string; kind: string; value: number }[]
  notes: { date: string; text: string }[]
}

const KIND = { weight: 'вес', reps: 'повторы', e1rm: '1ПМ' } as Record<string, string>

/**
 * Сводка для тренера текстом — запасной путь без MCP: скопировал, вставил
 * в чат с Grok. Числа с единицами, без лишних слов. В конце — формат ответа,
 * чтобы правку можно было вставить обратно в приложение.
 */
export function buildCoachSummary(d: SummaryInput): string {
  const L: string[] = []
  const days = Math.round((Date.parse(d.to) - Date.parse(d.from)) / 86_400_000) + 1
  L.push(`Сводка Coach за ${days} дн. (${d.from} — ${d.to}).`)

  const p = d.profile
  const lim = p.limitations.map((l) => LIMITATION_RU[l as Limitation]?.toLowerCase() ?? l)
  L.push('', 'ПРОФИЛЬ')
  L.push(`${p.name || 'Без имени'}${p.heightCm ? `, рост ${fmtKg(p.heightCm)} см` : ''}. Ограничения: ${lim.length ? lim.join(', ') : 'нет'}.`)
  L.push(`Зал: ${p.gymWeekdays.map((w) => WEEKDAY_SHORT[w]).join(', ') || 'дни плавают'}. Футбол: ${p.footballWeekdays.map((w) => WEEKDAY_SHORT[w]).join(', ') || 'нерегулярно'}.`)
  L.push(`Цели питания: ${p.kcalTarget} ккал, ${p.proteinTarget} г белка.`)

  L.push('', 'ПРОГРАММА')
  if (!d.program) L.push('Нет — свободные тренировки.')
  else {
    L.push(`«${d.program.name}», версия ${d.program.version}.`)
    d.program.days.forEach((day, i) => {
      L.push(`${i + 1}. ${day.name}${day.heavyLegs ? ' (тяжёлые ноги)' : ''}:`)
      for (const e of day.exercises) L.push(`   - ${d.nameOf(e.exercise)} [${d.refOf(e.exercise)}]: ${describeTargets(e)}`)
    })
  }

  L.push('', `ТРЕНИРОВКИ (${d.sessions.length} из ${d.plannedGym} запланированных)`)
  if (!d.sessions.length) L.push('Не было.')
  for (const s of d.sessions) {
    L.push(`${s.date} ${s.dayName ?? 'свободная'}, ${s.durationMin} мин${s.difficulty ? `, сложность ${s.difficulty}/10` : ''}${s.note ? ` — «${s.note}»` : ''}`)
    for (const e of s.exercises) {
      const work = e.sets.filter((x) => x.type !== 'warmup')
      if (!work.length) continue
      L.push(`   - ${e.name}: ${work.map((x) => `${fmtKg(x.weightKg)}×${x.reps}${x.rir !== null ? ` RIR${x.rir}` : ''}${x.type === 'failure' ? ' отказ' : x.type === 'drop' ? ' дроп' : ''}`).join(', ')}`)
    }
  }

  L.push('', 'ОБЪЁМ, рабочих подходов по группам за период')
  L.push(MUSCLE_GROUPS.map((g) => `${MUSCLE_GROUP_RU[g].toLowerCase()} ${fmtKg(d.volume[g])}`).join(', ') + '.')

  L.push('', 'ФУТБОЛ')
  L.push(d.football.length ? d.football.map((f) => `${shortDate(f.date)}: ${f.durationMin ?? '?'} мин, тяжесть ${f.intensity ?? '?'}/10`).join('; ') + '.' : 'Не было.')

  L.push('', 'ГОТОВНОСТЬ (0–100; зелёный ≥ 75, красный < 50)')
  const scored = d.readiness.filter((r) => r.score !== null)
  if (!scored.length) L.push('Чек-инов не было.')
  else {
    const avg = Math.round(scored.reduce((a, r) => a + (r.score as number), 0) / scored.length)
    const count = (f: string) => scored.filter((r) => r.flag === f).length
    L.push(`Среднее ${avg}; зелёных ${count('green')}, жёлтых ${count('yellow')}, красных ${count('red')}. По дням: ${scored.map((r) => `${shortDate(r.date)} ${r.score}`).join(', ')}.`)
  }

  L.push('', 'ТЕЛО И ПИТАНИЕ')
  L.push(d.weight.avgKg !== null ? `Вес: среднее ${fmtKg(d.weight.avgKg)} кг${d.weight.paceKgWeek !== null ? `, темп ${d.weight.paceKgWeek > 0 ? '+' : ''}${fmtKg(d.weight.paceKgWeek)} кг/нед` : ''}.` : 'Вес: взвешиваний не было.')
  L.push(d.nutrition.daysLogged ? `Питание: в среднем ${d.nutrition.kcal} ккал и ${d.nutrition.proteinG} г белка (записи за ${d.nutrition.daysLogged} дн.).` : 'Питание: записей не было.')

  if (d.records.length) {
    L.push('', 'РЕКОРДЫ')
    for (const r of d.records) L.push(`- ${r.exercise}: ${KIND[r.kind] ?? r.kind} ${fmtKg(r.value)}${r.kind === 'reps' ? '' : ' кг'}`)
  }

  if (d.notes.length) {
    L.push('', 'ТВОИ ПРОШЛЫЕ ЗАМЕТКИ')
    for (const n of d.notes) L.push(`- ${n.date}: ${n.text}`)
  }

  L.push('', 'КАК ОТВЕТИТЬ ПРАВКОЙ')
  L.push('Если предлагаешь изменить программу — пришли JSON, его можно вставить в приложение («Вставить правку от тренера»):')
  L.push('{"title": "…", "rationale": "…", "changes": [{"op": "update_exercise", "day": 1, "exercise": "<id в квадратных скобках>", "sets": 4}]}')
  L.push('op: update_exercise | add_exercise (sets, rep_min, rep_max, rir обязательны) | remove_exercise | replace_exercise (with) | move_exercise (position) | update_day (name, heavy_legs). day — номер дня с 1.')
  return L.join('\n')
}
