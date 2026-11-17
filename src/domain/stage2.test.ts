import { describe, it, expect } from 'vitest'
import { normalize, filterExercises, scoreMatch } from './search'
import { findAlternatives } from './alternatives'
import { detectRecords } from './records'
import { summarizeSession, afterSet, isSessionFailed } from './session'
import { parseYoutubeId, embedUrl, searchUrl } from './youtube'
import type { PerformedSet, SetType } from './types'

const ex = (id: string, nameRu: string, primary: string[], equipment = 'barbell', extra: Record<string, unknown> = {}) => ({
  id, slug: id, nameRu, nameEn: id.replace(/_/g, ' '), primaryMuscles: primary, secondaryMuscles: [] as string[],
  equipment, category: 'strength', mechanic: 'compound', deletedAt: null, ...extra,
})

const LIB = [
  ex('Barbell_Squat', 'Приседания со штангой', ['quadriceps']),
  ex('Front_Barbell_Squat', 'Фронтальные приседания', ['quadriceps']),
  ex('Goblet_Squat', 'Гоблет-присед', ['quadriceps'], 'kettlebells'),
  ex('Leg_Press', 'Жим ногами', ['quadriceps'], 'machine'),
  ex('Barbell_Bench_Press', 'Жим штанги лёжа', ['chest']),
  ex('Quad_Stretch', 'Растяжка квадрицепса', ['quadriceps'], 'body only', { category: 'stretching' }),
  ex('Old', 'Удалённое приседание', ['quadriceps'], 'barbell', { deletedAt: '2026-01-01T00:00:00Z' }),
]

describe('поиск упражнений', () => {
  it('нормализует ё, регистр и знаки', () => {
    expect(normalize('«Жим» ЛЁЖА')).toBe('жим лежа')
  })

  it('находит по-русски без учёта ё', () => {
    expect(filterExercises(LIB, { query: 'жим лежа' }).map((e) => e.id)).toEqual(['Barbell_Bench_Press'])
  })

  it('находит по английскому названию', () => {
    expect(filterExercises(LIB, { query: 'goblet' }).map((e) => e.id)).toEqual(['Goblet_Squat'])
  })

  it('все слова запроса должны совпасть', () => {
    expect(filterExercises(LIB, { query: 'приседания жим' })).toEqual([])
  })

  it('начало названия ранжируется выше вхождения в середину', () => {
    expect(scoreMatch('присед', LIB[0])).toBeGreaterThan(scoreMatch('присед', LIB[2]))
  })

  it('фильтр по группе мышц и оборудованию', () => {
    const r = filterExercises(LIB, { groups: ['legs'], equipment: ['machine'] })
    expect(r.map((e) => e.id)).toEqual(['Leg_Press'])
  })

  it('«только силовые» прячет растяжку, удалённые скрыты всегда', () => {
    const ids = filterExercises(LIB, { query: 'квадрицепс', strengthOnly: true }).map((e) => e.id)
    expect(ids).not.toContain('Quad_Stretch')
    expect(filterExercises(LIB, {}).map((e) => e.id)).not.toContain('Old')
  })
})

describe('аналоги для замены', () => {
  it('предлагает упражнения на ту же мышцу и не предлагает само упражнение', () => {
    const ids = findAlternatives(LIB[0], LIB).map((a) => a.exercise.id)
    expect(ids).toContain('Front_Barbell_Squat')
    expect(ids).not.toContain('Barbell_Squat')
    expect(ids).not.toContain('Barbell_Bench_Press')
  })

  it('то же оборудование выше в списке', () => {
    const alts = findAlternatives(LIB[0], LIB)
    expect(alts[0].exercise.id).toBe('Front_Barbell_Squat')
    expect(alts[0].reason).toContain('то же оборудование')
  })

  it('растяжку и удалённые не предлагает', () => {
    const ids = findAlternatives(LIB[0], LIB).map((a) => a.exercise.id)
    expect(ids).not.toContain('Quad_Stretch')
    expect(ids).not.toContain('Old')
  })

  it('фильтр «только то же оборудование»', () => {
    const ids = findAlternatives(LIB[0], LIB, { sameEquipmentOnly: true }).map((a) => a.exercise.id)
    expect(ids).toEqual(['Front_Barbell_Squat'])
  })
})

const s = (id: string, weightKg: number, reps: number, type: SetType = 'work', rir: number | null = 2): PerformedSet => ({
  id, exerciseId: 'squat', setIndex: 1, weightKg, reps, rir, type, performedAt: '2026-11-17T10:00:00Z',
})

describe('личные рекорды', () => {
  const history = [s('a', 100, 5), s('b', 90, 8), s('c', 60, 10, 'warmup')]

  it('новый максимальный вес', () => {
    expect(detectRecords(s('n', 105, 3), history).map((h) => h.kind)).toContain('weight')
  })

  it('больше повторов с тем же весом', () => {
    const kinds = detectRecords(s('n', 100, 6), history).map((h) => h.kind)
    expect(kinds).toContain('reps')
    expect(kinds).not.toContain('weight')
  })

  it('повторы с весом легче рекордного — не рекорд по повторам, если тяжелее делал больше', () => {
    expect(detectRecords(s('n', 80, 8), history).map((h) => h.kind)).not.toContain('reps')
  })

  it('рекорд расчётного 1ПМ', () => {
    expect(detectRecords(s('n', 95, 8), history).map((h) => h.kind)).toContain('e1rm')
  })

  it('разминка и первый подход в истории рекордом не считаются', () => {
    expect(detectRecords(s('n', 200, 1, 'warmup'), history)).toEqual([])
    expect(detectRecords(s('n', 100, 5), [])).toEqual([])
  })

  it('прежние разминки не задают планку', () => {
    expect(detectRecords(s('n', 70, 12), [s('w', 60, 20, 'warmup'), s('x', 70, 10)]).map((h) => h.kind)).toContain('reps')
  })
})

describe('итог тренировки', () => {
  it('считает длительность, тоннаж и подходы по группам без разминки', () => {
    const sets = [s('1', 100, 5), s('2', 100, 5), s('3', 40, 10, 'warmup')]
    const r = summarizeSession(sets, { squat: ['quadriceps'] }, '2026-11-17T10:00:00Z', '2026-11-17T11:05:00Z')
    expect(r.durationMin).toBe(65)
    expect(r.tonnageKg).toBe(1000)
    expect(r.workSets).toBe(2)
    expect(r.setsByGroup.legs).toBe(2)
  })
})

describe('суперсеты', () => {
  const exs = [
    { id: 'e1', exerciseId: 'a', orderIndex: 0, supersetGroup: null, repMin: 6, restSec: 120 },
    { id: 'e2', exerciseId: 'b', orderIndex: 1, supersetGroup: 'S1', repMin: 8, restSec: 90 },
    { id: 'e3', exerciseId: 'c', orderIndex: 2, supersetGroup: 'S1', repMin: 8, restSec: 90 },
  ]
  it('обычное упражнение: остаёмся и отдыхаем', () => {
    expect(afterSet(exs, 'e1')).toEqual({ nextId: 'e1', startRest: true })
  })
  it('первое в суперсете: сразу к партнёру без отдыха', () => {
    expect(afterSet(exs, 'e2')).toEqual({ nextId: 'e3', startRest: false })
  })
  it('последнее в суперсете: отдых и снова к первому', () => {
    expect(afterSet(exs, 'e3')).toEqual({ nextId: 'e2', startRest: true })
  })
})

describe('провальная тренировка', () => {
  const exs = [{ id: 'e1', exerciseId: 'squat', orderIndex: 0, supersetGroup: null, repMin: 6, restSec: 120 }]
  it('провал — рабочий подход ниже низа диапазона', () => {
    expect(isSessionFailed(exs, [s('1', 100, 4)])).toBe(true)
  })
  it('разминка ниже диапазона — не провал', () => {
    expect(isSessionFailed(exs, [s('1', 40, 3, 'warmup'), s('2', 100, 6)])).toBe(false)
  })
})

describe('видео', () => {
  it('разбирает любые ссылки YouTube', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?t=10',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'youtube.com/embed/dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
    ]) expect(parseYoutubeId(u)).toBe('dQw4w9WgXcQ')
  })
  it('отклоняет всё остальное', () => {
    for (const u of ['', 'https://vimeo.com/123', 'https://youtube.com/watch?v=short', 'не ссылка']) {
      expect(parseYoutubeId(u)).toBeNull()
    }
  })
  it('встраивает без cookies, ищет по-русски', () => {
    expect(embedUrl('dQw4w9WgXcQ')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(decodeURIComponent(searchUrl('Жим лёжа'))).toContain('Жим лёжа техника выполнения')
  })
})
