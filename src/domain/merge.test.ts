import { describe, it, expect } from 'vitest'
import { pickWinner, resolve, mergeById, isDeleted } from './merge'

const row = (id: string, updatedAt: string, deletedAt: string | null = null) => ({ id, updatedAt, deletedAt })

describe('last-write-wins', () => {
  it('выигрывает более свежая метка времени', () => {
    const local = row('1', '2026-11-12T10:00:00.000Z')
    const remote = row('1', '2026-11-12T09:00:00.000Z')
    expect(pickWinner(local, remote)).toBe('local')
    expect(resolve(local, remote)).toBe(local)
  })

  it('при равных метках выигрывает сервер — устройства сходятся к одному значению', () => {
    const local = row('1', '2026-11-12T10:00:00.000Z')
    const remote = row('1', '2026-11-12T10:00:00.000Z')
    expect(pickWinner(local, remote)).toBe('remote')
  })

  it('отсутствующая сторона не выигрывает', () => {
    expect(pickWinner(undefined, row('1', '2026-01-01T00:00:00.000Z'))).toBe('remote')
    expect(pickWinner(row('1', '2026-01-01T00:00:00.000Z'), undefined)).toBe('local')
  })

  it('удаление — это обычная запись с меткой, и она тоже решается по времени', () => {
    const deleted = row('1', '2026-11-12T11:00:00.000Z', '2026-11-12T11:00:00.000Z')
    const edited = row('1', '2026-11-12T10:00:00.000Z')
    expect(isDeleted(resolve(edited, deleted))).toBe(true)
    // правка позже удаления — запись возвращается
    const laterEdit = row('1', '2026-11-12T12:00:00.000Z')
    expect(isDeleted(resolve(laterEdit, deleted))).toBe(false)
  })

  it('слияние списков сохраняет все id и берёт свежие версии', () => {
    const merged = mergeById(
      [row('a', '2026-11-12T10:00:00.000Z'), row('b', '2026-11-12T10:00:00.000Z')],
      [row('b', '2026-11-12T11:00:00.000Z'), row('c', '2026-11-12T10:00:00.000Z')],
    )
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'b', 'c'])
    expect(merged.find((r) => r.id === 'b')!.updatedAt).toBe('2026-11-12T11:00:00.000Z')
  })
})
