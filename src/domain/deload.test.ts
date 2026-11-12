import { describe, it, expect } from 'vitest'
import { deloadCheck } from './deload'

describe('deloadCheck', () => {
  it('три недели роста — разгрузка не нужна', () => {
    expect(deloadCheck({ weeksSinceDeload: 3, recentSessionsFailed: [false, false] }).suggest).toBe(false)
  })
  it('четыре недели — мягкое предложение', () => {
    expect(deloadCheck({ weeksSinceDeload: 4, recentSessionsFailed: [] }).urgency).toBe('soft')
  })
  it('шесть недель — настойчивое', () => {
    expect(deloadCheck({ weeksSinceDeload: 6, recentSessionsFailed: [] }).urgency).toBe('strong')
  })
  it('два провала подряд перебивают счёт недель', () => {
    const r = deloadCheck({ weeksSinceDeload: 1, recentSessionsFailed: [true, true, false] })
    expect(r.urgency).toBe('strong')
    expect(r.reason).toContain('подряд')
  })
  it('один провал не повод для разгрузки', () => {
    expect(deloadCheck({ weeksSinceDeload: 2, recentSessionsFailed: [true, false] }).suggest).toBe(false)
  })
})
