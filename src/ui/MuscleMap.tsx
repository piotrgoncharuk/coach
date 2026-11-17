import { MUSCLE_RU, type Muscle } from '../domain/types'

type Shape = { kind: 'e'; cx: number; cy: number; rx: number; ry: number } | { kind: 'r'; x: number; y: number; w: number; h: number }

const e = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: 'e', cx, cy, rx, ry })
const r = (x: number, y: number, w: number, h: number): Shape => ({ kind: 'r', x, y, w, h })
const pair = (dx: number, cy: number, rx: number, ry: number, c: number) => [e(c - dx, cy, rx, ry), e(c + dx, cy, rx, ry)]

const F = 50 // ось фигуры спереди
const B = 150 // ось фигуры сзади

const FRONT: Partial<Record<Muscle, Shape[]>> = {
  neck: [r(F - 3, 22, 6, 5)],
  shoulders: pair(19, 31, 6, 5, F),
  chest: pair(8, 37, 8, 6, F),
  biceps: pair(20, 43, 3.5, 8, F),
  forearms: pair(22, 64, 3, 9, F),
  abdominals: [r(F - 7, 45, 14, 24)],
  abductors: pair(14, 79, 2.5, 6, F),
  adductors: pair(3.2, 89, 2.4, 8, F),
  quadriceps: pair(8.5, 97, 5.5, 15, F),
  calves: pair(9, 136, 3.5, 11, F),
}

const BACK: Partial<Record<Muscle, Shape[]>> = {
  neck: [r(B - 3, 22, 6, 5)],
  traps: [e(B, 30, 11, 5)],
  shoulders: pair(19, 31, 6, 5, B),
  'middle back': [e(B, 40, 6, 7)],
  lats: pair(10, 48, 6, 12, B),
  'lower back': [r(B - 6, 57, 12, 12)],
  triceps: pair(20, 43, 3.5, 8, B),
  forearms: pair(22, 64, 3, 9, B),
  glutes: pair(7, 76, 7, 6, B),
  hamstrings: pair(8.5, 99, 5, 14, B),
  calves: pair(9, 134, 4.5, 12, B),
}

function silhouette(c: number) {
  return (
    <g fill="currentColor" className="text-raised">
      <circle cx={c} cy={14} r={8} />
      <rect x={c - 3} y={21} width={6} height={7} />
      <rect x={c - 16} y={26} width={32} height={46} rx={7} />
      <rect x={c - 25} y={28} width={9} height={26} rx={4} />
      <rect x={c + 16} y={28} width={9} height={26} rx={4} />
      <rect x={c - 27} y={53} width={8} height={23} rx={4} />
      <rect x={c + 19} y={53} width={8} height={23} rx={4} />
      <rect x={c - 15} y={70} width={30} height={12} rx={4} />
      <rect x={c - 15} y={80} width={13} height={40} rx={5} />
      <rect x={c + 2} y={80} width={13} height={40} rx={5} />
      <rect x={c - 14} y={119} width={10} height={36} rx={4} />
      <rect x={c + 4} y={119} width={10} height={36} rx={4} />
    </g>
  )
}

function draw(shapes: Shape[] | undefined, cls: string, key: string) {
  return shapes?.map((s, i) =>
    s.kind === 'e' ? (
      <ellipse key={`${key}${i}`} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} className={cls} />
    ) : (
      <rect key={`${key}${i}`} x={s.x} y={s.y} width={s.w} height={s.h} rx={3} className={cls} />
    ),
  )
}

/** Схема мышц: основные — акцентом, вспомогательные — бледнее. */
export function MuscleMap({ primary, secondary }: { primary: string[]; secondary: string[] }) {
  const p = primary as Muscle[]
  const s = (secondary as Muscle[]).filter((m) => !p.includes(m))
  const label = [
    p.length ? `основные: ${p.map((m) => MUSCLE_RU[m] ?? m).join(', ')}` : '',
    s.length ? `вспомогательные: ${s.map((m) => MUSCLE_RU[m] ?? m).join(', ')}` : '',
  ].filter(Boolean).join('; ')

  return (
    <svg viewBox="0 0 200 165" className="w-full max-w-xs" role="img" aria-label={`Схема мышц — ${label}`}>
      {silhouette(F)}
      {silhouette(B)}
      {s.map((m) => draw(FRONT[m], 'fill-accent/35', `fs-${m}`))}
      {s.map((m) => draw(BACK[m], 'fill-accent/35', `bs-${m}`))}
      {p.map((m) => draw(FRONT[m], 'fill-accent', `fp-${m}`))}
      {p.map((m) => draw(BACK[m], 'fill-accent', `bp-${m}`))}
      <text x={F} y={163} textAnchor="middle" className="fill-fg-3 text-[8px]">спереди</text>
      <text x={B} y={163} textAnchor="middle" className="fill-fg-3 text-[8px]">сзади</text>
    </svg>
  )
}
