export interface DeloadInput {
  /** Недель подряд без разгрузочной. */
  weeksSinceDeload: number
  /**
   * Провальные тренировки в порядке от новых к старым.
   * Провал — хотя бы одно упражнение ниже низа диапазона повторов.
   */
  recentSessionsFailed: boolean[]
}

export type DeloadUrgency = 'none' | 'soft' | 'strong'

export interface DeloadResult {
  suggest: boolean
  urgency: DeloadUrgency
  reason: string
}

/**
 * Разгрузочная неделя: мягкое предложение после 4 недель, настойчивое после 6,
 * и внеочередное — при двух провальных тренировках подряд.
 */
export function deloadCheck(input: DeloadInput): DeloadResult {
  const { weeksSinceDeload, recentSessionsFailed } = input
  const twoFailed = recentSessionsFailed.length >= 2 && recentSessionsFailed[0] && recentSessionsFailed[1]

  if (twoFailed) {
    return {
      suggest: true,
      urgency: 'strong',
      reason: 'Две тренировки подряд не закрыли план по повторам. Неделя разгрузки вернёт прогресс.',
    }
  }
  if (weeksSinceDeload >= 6) {
    return {
      suggest: true,
      urgency: 'strong',
      reason: `${weeksSinceDeload} недель без разгрузки. Пора снизить объём.`,
    }
  }
  if (weeksSinceDeload >= 4) {
    return {
      suggest: true,
      urgency: 'soft',
      reason: `${weeksSinceDeload} недели роста. Можно разгрузиться, если накопилась усталость.`,
    }
  }
  return { suggest: false, urgency: 'none', reason: 'Разгрузка пока не нужна.' }
}

/** Как выглядит разгрузочная неделя: вес тот же, объём ниже, запас повторов больше. */
export const DELOAD_PRESET = { setsMultiplier: 0.6, weightMultiplier: 0.9, minRir: 3 } as const
