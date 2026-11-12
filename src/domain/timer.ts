/**
 * Таймер отдыха считается по метке времени старта, а не тиками.
 * iOS усыпляет свёрнутую страницу и останавливает любые интервалы, поэтому
 * единственный надёжный способ — вычитать время из часов при каждой отрисовке.
 */
export interface RestTimerState {
  /** ISO-время нажатия «Записать подход». */
  startedAt: string
  durationSec: number
}

/** Сколько осталось. Отрицательное значение — отдых затянулся на столько секунд. */
export function remainingSec(state: RestTimerState, nowMs: number = Date.now()): number {
  const elapsed = (nowMs - Date.parse(state.startedAt)) / 1000
  return Math.round(state.durationSec - elapsed)
}

export function isFinished(state: RestTimerState, nowMs: number = Date.now()): boolean {
  return remainingSec(state, nowMs) <= 0
}

/** М:СС, с минусом для перебора. */
export function formatMmSs(totalSec: number): string {
  const sign = totalSec < 0 ? '−' : ''
  const abs = Math.abs(totalSec)
  const m = Math.floor(abs / 60)
  const s = abs % 60
  return `${sign}${m}:${String(s).padStart(2, '0')}`
}

/** Доля пройденного времени 0–1 — для круговой полоски. */
export function progress(state: RestTimerState, nowMs: number = Date.now()): number {
  if (state.durationSec <= 0) return 1
  const left = remainingSec(state, nowMs)
  return Math.min(1, Math.max(0, 1 - left / state.durationSec))
}
