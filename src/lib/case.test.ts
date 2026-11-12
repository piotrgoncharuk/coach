import { describe, it, expect } from 'vitest'
import { toSnake, toCamel, snakeKey, camelKey } from './case'

describe('перевод имён полей', () => {
  it('camelCase → snake_case и обратно', () => {
    expect(snakeKey('weightKg')).toBe('weight_kg')
    expect(snakeKey('e1rm')).toBe('e1rm')
    expect(camelKey('server_updated_at')).toBe('serverUpdatedAt')
    expect(camelKey('rep_min')).toBe('repMin')
  })

  it('перевод объекта туда и обратно не теряет данные', () => {
    const row = { id: 'a', weightKg: 100, sessionExerciseId: 'b', deletedAt: null }
    const snake = toSnake(row)
    expect(snake).toEqual({ id: 'a', weight_kg: 100, session_exercise_id: 'b', deleted_at: null })
    expect(toCamel(snake)).toEqual(row)
  })

  it('числа в именах полей не ломаются', () => {
    expect(toCamel({ e1rm: 120 })).toEqual({ e1rm: 120 })
  })
})
