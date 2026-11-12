/** Округление веса до шага, который реально можно собрать (по умолчанию 2,5 кг). */
export function roundToStep(weightKg: number, stepKg = 2.5): number {
  if (stepKg <= 0) return round1(weightKg)
  return round1(Math.round(weightKg / stepKg) * stepKg)
}

/** Округление вниз до шага — чтобы подсказка веса не оказалась выше, чем нужно. */
export function floorToStep(weightKg: number, stepKg = 2.5): number {
  if (stepKg <= 0) return round1(weightKg)
  return round1(Math.floor(weightKg / stepKg) * stepKg)
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Скользящее среднее по точкам, отсортированным по дате. Окно — в днях. */
export function movingAverage<T extends { date: string; value: number }>(
  points: T[],
  windowDays = 7,
): { date: string; value: number }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((p, i) => {
    const from = new Date(p.date)
    from.setUTCDate(from.getUTCDate() - (windowDays - 1))
    const fromKey = from.toISOString().slice(0, 10)
    let sum = 0
    let n = 0
    for (let j = i; j >= 0; j--) {
      if (sorted[j].date < fromKey) break
      sum += sorted[j].value
      n++
    }
    return { date: p.date, value: round1(sum / n) }
  })
}

/** Вес по-русски: 67,5 вместо 67.5, и без лишнего нуля. */
export function fmtKg(n: number): string {
  return String(round1(n)).replace('.', ',')
}
