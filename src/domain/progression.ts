import type { Equipment, ExerciseTarget, MuscleGroup, PerformedSet } from './types'
import { clamp, floorToStep, fmtKg, roundToStep } from './math'

export type ProgressionOutcome = 'calibration' | 'add_weight' | 'add_reps' | 'hold' | 'back_off'

export interface ProgressionResult {
  /** null — веса нет в истории, нужна калибровка первым подходом. */
  weightKg: number | null
  repTarget: number
  rir: number
  outcome: ProgressionOutcome
  /** Объяснение человеческим языком — показывается под подсказкой веса. */
  reason: string
  incrementKg: number
}

export interface ProgressionInput {
  target: ExerciseTarget
  /** Подходы последней тренировки по этому упражнению. */
  lastSets: PerformedSet[]
  /** Подходы предыдущей тренировки — чтобы поймать два провала подряд. */
  prevSets?: PerformedSet[]
  equipment?: Equipment
  group?: MuscleGroup
}

/** Шаг прибавки по умолчанию: мелочь на блоках и гантелях, крупнее на ногах и тренажёрах. */
export function defaultIncrementKg(equipment?: Equipment, group?: MuscleGroup): number {
  if (equipment === 'barbell' && group === 'legs') return 5
  if (equipment === 'machine') return 5
  if (equipment === 'barbell') return 2.5
  return 2.5
}

/** Подходы, которые считаются рабочими для прогрессии. Разминка и дропы не считаются. */
function workSets(sets: PerformedSet[]): PerformedSet[] {
  return sets.filter((s) => s.type === 'work' || s.type === 'failure')
}

/** Рабочий вес тренировки: самый частый вес среди рабочих подходов, при равенстве — больший. */
export function mainWorkingWeight(sets: PerformedSet[]): number | null {
  const work = workSets(sets)
  if (work.length === 0) return null
  const counts = new Map<number, number>()
  for (const s of work) counts.set(s.weightKg, (counts.get(s.weightKg) ?? 0) + 1)
  let bestWeight = 0
  let bestCount = 0
  for (const [weight, count] of counts) {
    if (count > bestCount || (count === bestCount && weight > bestWeight)) {
      bestWeight = weight
      bestCount = count
    }
  }
  return bestWeight
}

function failedBelowMin(sets: PerformedSet[], target: ExerciseTarget): boolean {
  const work = workSets(sets)
  if (work.length === 0) return false
  const weight = mainWorkingWeight(sets)
  const atWeight = work.filter((s) => s.weightKg === weight)
  return atWeight.some((s) => s.reps < target.repMin)
}

/**
 * Двойная прогрессия. Сначала растут повторы до верха диапазона, потом вес.
 *
 *  • все рабочие подходы добрали верх диапазона → +шаг веса, повторы падают к низу диапазона;
 *  • подходы в диапазоне → вес тот же, цель +1 повтор;
 *  • провал ниже низа диапазона → повторить вес, а если провал второй раз подряд → откат на 10%.
 *
 * Запас повторов (RIR) влияет на размер шага: если осталось сильно больше запаса, чем нужно,
 * шаг удваивается. В осторожном режиме шаг не больше 2,5 кг, цель RIR не ниже 2, и вес
 * не растёт после подхода, сделанного в упор. Расчёт детерминированный, без ИИ.
 */
export function suggestNextLoad(input: ProgressionInput): ProgressionResult {
  const { target, lastSets, prevSets = [] } = input
  const cautious = target.cautious === true
  const rirTarget = cautious ? Math.max(2, target.rir) : target.rir
  const baseIncrement = target.incrementKg ?? defaultIncrementKg(input.equipment, input.group)
  const increment = cautious ? Math.min(2.5, baseIncrement) : baseIncrement

  const work = workSets(lastSets)
  if (work.length === 0) {
    return {
      weightKg: null,
      repTarget: target.repMin,
      rir: rirTarget,
      outcome: 'calibration',
      reason: `Первый раз. Подбери вес так, чтобы на ${target.repMin} повторов остался запас ${rirTarget}.`,
      incrementKg: increment,
    }
  }

  const weight = mainWorkingWeight(lastSets) as number
  const atWeight = work.filter((s) => s.weightKg === weight)
  const minReps = Math.min(...atWeight.map((s) => s.reps))
  const maxReps = Math.max(...atWeight.map((s) => s.reps))
  const rirs = atWeight.map((s) => s.rir).filter((r): r is number => r !== null)
  const minRir = rirs.length ? Math.min(...rirs) : rirTarget

  const didAllSets = atWeight.length >= target.sets
  const hitTop = minReps >= target.repMax

  if (didAllSets && hitTop) {
    if (cautious && minRir < 2) {
      return {
        weightKg: weight,
        repTarget: target.repMax,
        rir: rirTarget,
        outcome: 'hold',
        reason: 'Осторожный режим: последний подход шёл в упор. Повторяем тот же вес с запасом 2.',
        incrementKg: increment,
      }
    }
    const step = !cautious && minRir >= target.rir + 2 ? increment * 2 : increment
    return {
      weightKg: roundToStep(weight + step, 2.5),
      repTarget: target.repMin,
      rir: rirTarget,
      outcome: 'add_weight',
      reason:
        step > increment
          ? `Верх диапазона взят с запасом ${minRir}. Шаг двойной: +${fmtKg(step)} кг.`
          : `Все ${target.sets} ${plural(target.sets, SETS)} по ${target.repMax}. Прибавляем ${fmtKg(step)} кг, повторы сбрасываем на ${target.repMin}.`,
      incrementKg: step,
    }
  }

  if (minReps >= target.repMin) {
    const next = clamp(maxReps + 1, target.repMin, target.repMax)
    return {
      weightKg: weight,
      repTarget: next,
      rir: rirTarget,
      outcome: 'add_reps',
      reason: `Вес тот же, цель ${next} ${plural(next, REPS)}. Вес прибавим, когда все подходы дадут ${target.repMax}.`,
      incrementKg: increment,
    }
  }

  if (failedBelowMin(prevSets, target)) {
    return {
      weightKg: floorToStep(weight * 0.9, 2.5),
      repTarget: target.repMin,
      rir: rirTarget,
      outcome: 'back_off',
      reason: 'Две неудачные тренировки подряд. Откат примерно на 10% и заход заново.',
      incrementKg: increment,
    }
  }

  return {
    weightKg: weight,
    repTarget: target.repMin,
    rir: rirTarget,
    outcome: 'hold',
    reason: `В прошлый раз ${minReps} — ниже низа диапазона. Повторяем вес.`,
    incrementKg: increment,
  }
}

/** Склонение по числу: 1 повтор, 2 повтора, 5 повторов. */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

const REPS: [string, string, string] = ['повтор', 'повтора', 'повторов']
const SETS: [string, string, string] = ['подход', 'подхода', 'подходов']
