/**
 * Звук окончания отдыха.
 *
 * Честно про iPhone: вибрации у веб-приложения на iOS нет — Vibration API
 * Safari не поддерживает ни в браузере, ни на домашнем экране. Остаётся звук,
 * и он требует, чтобы звуковой контекст был разбужен настоящим касанием.
 * Поэтому контекст создаётся при первой записи подхода, а не при открытии экрана.
 * Пока приложение свёрнуто, iOS останавливает и звук: таймер покажет правильное
 * время при возвращении, но сигнала в этот момент не будет.
 */
let ctx: AudioContext | null = null

type Ctor = typeof AudioContext
function getCtor(): Ctor | null {
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** Вызывается из обработчика касания — иначе iOS не разрешит звук. */
export function unlockSound(): void {
  const Ctor = getCtor()
  if (!Ctor) return
  ctx ??= new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
}

export function beep(times = 2): void {
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  for (let i = 0; i < times; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    const start = now + i * 0.28
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.24)
  }
}

export function isSoundReady(): boolean {
  return ctx?.state === 'running'
}
