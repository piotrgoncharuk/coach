import { describe, it, expect } from 'vitest'
import { validateStructure, applyProposal, findDay, type Snapshot } from './proposal.ts'
import { MUSCLE_GROUP } from './muscles.ts'
import { MUSCLE_TO_GROUP } from '../../../src/domain/types'

const SNAP: Snapshot = {
  name: 'Всё тело ×3',
  days: [
    { name: 'День A', heavyLegs: true, exercises: [
      { exercise: 'u-squat', sets: 3, repMin: 6, repMax: 8, rir: 2, restSec: 180 },
      { exercise: 'u-bench', sets: 3, repMin: 6, repMax: 10, rir: 2, restSec: 150 },
    ] },
    { name: 'День B', heavyLegs: true, exercises: [{ exercise: 'u-rdl', sets: 3, repMin: 8, repMax: 10, rir: 3, restSec: 150, cautious: true }] },
  ],
}
const LIB: Record<string, string> = { 'u-front': 'u-front', 'u-plank': 'u-plank', 'u-squat': 'u-squat', Barbell_Squat: 'u-squat', 'u-bench': 'u-bench', 'u-rdl': 'u-rdl', 'Front_Barbell_Squat': 'u-front', Plank: 'u-plank' }
const resolve = (r: string) => LIB[r] ?? null

describe('структура правки', () => {
  it('корректная правка проходит', () => {
    const r = validateStructure({ title: 'Больше объёма', changes: [{ op: 'update_exercise', day: 1, exercise: 'u-squat', sets: 4 }] })
    expect(r.errors).toEqual([])
    expect(r.proposal!.rationale).toBeNull()
  })

  it('собирает все ошибки сразу и указывает место', () => {
    const r = validateStructure({ title: '', changes: [
      { op: 'delete_everything', day: 1 },
      { op: 'update_exercise', day: 0, exercise: 'x', rir: 7 },
      { op: 'add_exercise', day: 1, exercise: 'Plank', sets: 3 },
      { op: 'update_exercise', day: 1, exercise: 'x', rep_min: 10, rep_max: 6 },
    ] })
    expect(r.proposal).toBeNull()
    expect(r.errors).toEqual(expect.arrayContaining([
      'title: нужен короткий заголовок.',
      expect.stringContaining('changes[0].op'),
      'changes[1].day: номер дня с 1 или название.',
      'changes[1].rir: от 0 до 4.',
      'changes[2].rep_min: обязательно для add_exercise.',
      'changes[3]: rep_min больше rep_max.',
    ]))
  })

  it('не объект — понятная ошибка', () => {
    expect(validateStructure('сделай пожёстче').errors[0]).toContain('JSON-объектом')
  })
})

describe('применение правки', () => {
  const apply = (changes: unknown[]) => {
    const v = validateStructure({ title: 't', changes })
    expect(v.errors).toEqual([])
    return applyProposal(SNAP, v.proposal!, resolve)
  }

  it('день по номеру и по названию', () => {
    expect(findDay(SNAP, 2)).toBe(1)
    expect(findDay(SNAP, 'День B')).toBe(1)
    expect(findDay(SNAP, 'b')).toBe(1)
    expect(findDay(SNAP, 3)).toBe(-1)
  })

  it('изменение целей, замена, добавление на позицию, перестановка', () => {
    const r = apply([
      { op: 'update_exercise', day: 'A', exercise: 'Barbell_Squat', sets: 4, rep_min: 5, rep_max: 6 },
      { op: 'replace_exercise', day: 1, exercise: 'u-bench', with: 'Front_Barbell_Squat' },
      { op: 'add_exercise', day: 2, exercise: 'Plank', sets: 3, rep_min: 20, rep_max: 40, rir: 2, position: 1 },
      { op: 'move_exercise', day: 1, exercise: 'u-front', position: 1 },
      { op: 'update_day', day: 2, heavy_legs: false },
    ])
    expect(r.errors).toEqual([])
    const s = r.snapshot!
    expect(s.days[0].exercises.map((e) => e.exercise)).toEqual(['u-front', 'u-squat'])
    expect(s.days[0].exercises[1]).toMatchObject({ sets: 4, repMin: 5, repMax: 6 })
    expect(s.days[1].exercises[0]).toMatchObject({ exercise: 'u-plank', restSec: 120, cautious: false })
    expect(s.days[1].heavyLegs).toBe(false)
  })

  it('исходный снимок не меняется', () => {
    apply([{ op: 'remove_exercise', day: 1, exercise: 'u-squat' }])
    expect(SNAP.days[0].exercises).toHaveLength(2)
  })

  it('любая ошибка — программа не меняется вовсе', () => {
    const r = apply([
      { op: 'update_exercise', day: 1, exercise: 'u-squat', sets: 5 },
      { op: 'remove_exercise', day: 1, exercise: 'u-rdl' },
      { op: 'add_exercise', day: 1, exercise: 'Неизвестное', sets: 3, rep_min: 8, rep_max: 12, rir: 2 },
      { op: 'update_exercise', day: 5, exercise: 'u-squat', sets: 3 },
    ])
    expect(r.snapshot).toBeNull()
    expect(r.errors).toEqual([
      'Изменение 2: в День A нет упражнения «u-rdl».',
      'Изменение 3: упражнение «Неизвестное» не найдено в справочнике.',
      'Изменение 4: нет дня «5» в программе.',
    ])
  })

  it('добавить уже существующее — ошибка, а не дубль', () => {
    expect(apply([{ op: 'add_exercise', day: 1, exercise: 'u-squat', sets: 3, rep_min: 5, rep_max: 8, rir: 2 }]).errors[0]).toContain('уже есть')
  })
})

describe('копия карты мышц для сервера', () => {
  it('совпадает с картой приложения', () => {
    expect(MUSCLE_GROUP).toEqual(MUSCLE_TO_GROUP)
  })
})
