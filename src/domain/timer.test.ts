import { describe, it, expect } from 'vitest'
import { remainingSec, isFinished, formatMmSs, progress } from './timer'

const started = '2026-11-12T10:00:00.000Z'
const at = (sec: number) => Date.parse(started) + sec * 1000

describe('таймер отдыха по метке времени', () => {
  it('считает остаток от часов, а не от тиков', () => {
    const t = { startedAt: started, durationSec: 150 }
    expect(remainingSec(t, at(0))).toBe(150)
    expect(remainingSec(t, at(30))).toBe(120)
    expect(remainingSec(t, at(150))).toBe(0)
  })

  it('пережидает усыпление приложения: вернулись через 10 минут — таймер давно истёк', () => {
    const t = { startedAt: started, durationSec: 150 }
    expect(remainingSec(t, at(600))).toBe(-450)
    expect(isFinished(t, at(600))).toBe(true)
  })

  it('формат М:СС, перебор с минусом', () => {
    expect(formatMmSs(150)).toBe('2:30')
    expect(formatMmSs(9)).toBe('0:09')
    expect(formatMmSs(0)).toBe('0:00')
    expect(formatMmSs(-45)).toBe('−0:45')
  })

  it('доля пройденного не выходит за границы', () => {
    const t = { startedAt: started, durationSec: 100 }
    expect(progress(t, at(0))).toBe(0)
    expect(progress(t, at(50))).toBe(0.5)
    expect(progress(t, at(500))).toBe(1)
    expect(progress({ startedAt: started, durationSec: 0 }, at(0))).toBe(1)
  })
})
