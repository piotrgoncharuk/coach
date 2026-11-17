import { lazy, Suspense } from 'react'
import { Skeleton } from '../components'
import type { Point } from './LineChart'
import type { Bar1 } from './BarChart'

/** Графики грузятся отдельным куском — в зале они не нужны, а весят заметно. */
const Line = lazy(() => import('./LineChart'))
const Bars = lazy(() => import('./BarChart'))

export function ProgressChart(props: { data: Point[]; unit: string; showRaw?: boolean }) {
  return (
    <Suspense fallback={<Skeleton className="h-[180px]" />}>
      <Line {...props} />
    </Suspense>
  )
}

export function BarsChart(props: { data: Bar1[]; unit: string; band?: { min: number; max: number } }) {
  return (
    <Suspense fallback={<Skeleton className="h-[180px]" />}>
      <Bars {...props} />
    </Suspense>
  )
}

export type { Point, Bar1 }
