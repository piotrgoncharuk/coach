import { round1 } from './math'

/** Блины, которые обычно есть в зале, кг. */
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const
export const DEFAULT_BAR_KG = 20

export interface PlateStack {
  plate: number
  count: number
}

export interface PlateResult {
  /** Что повесить на одну сторону. */
  perSide: PlateStack[]
  /** Вес, который реально соберётся. */
  achievableKg: number
  /** Недобор или перебор относительно цели, кг. */
  diffKg: number
  /** Цель меньше грифа — блины не нужны. */
  belowBar: boolean
}

/**
 * Калькулятор блинов. Жадный подбор на одну сторону: блины идут от тяжёлых к легким,
 * недобор меньше, чем полшага самого мелкого блина, считается попаданием.
 */
export function platesFor(
  targetKg: number,
  barKg = DEFAULT_BAR_KG,
  available: readonly number[] = DEFAULT_PLATES,
): PlateResult {
  if (targetKg <= barKg) {
    return {
      perSide: [],
      achievableKg: round1(barKg),
      diffKg: round1(barKg - targetKg),
      belowBar: targetKg < barKg,
    }
  }
  const plates = [...available].sort((a, b) => b - a)
  let perSideRemaining = (targetKg - barKg) / 2
  const perSide: PlateStack[] = []
  for (const plate of plates) {
    const count = Math.floor(perSideRemaining / plate + 1e-9)
    if (count > 0) {
      perSide.push({ plate, count })
      perSideRemaining = round1(perSideRemaining - count * plate)
    }
  }
  const achievableKg = round1(barKg + perSide.reduce((a, p) => a + p.plate * p.count, 0) * 2)
  return {
    perSide,
    achievableKg,
    diffKg: round1(achievableKg - targetKg),
    belowBar: false,
  }
}

/** Короткая запись для экрана: «25+10+2.5». */
export function formatPerSide(perSide: PlateStack[]): string {
  if (perSide.length === 0) return 'только гриф'
  return perSide
    .flatMap((p) => Array.from({ length: p.count }, () => String(p.plate).replace('.', ',')))
    .join(' + ')
}
