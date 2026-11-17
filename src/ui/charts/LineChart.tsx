import { CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ComposedChart, Tooltip, XAxis, YAxis } from 'recharts'

export interface Point {
  label: string
  value: number
  raw?: number
}

const AXIS = { fontSize: 11, fill: 'var(--c-text-3)' }

/**
 * Линия прогресса. Подписи по-русски, сетка едва видна, цвет — акцент.
 * Если есть сырые точки (вес тела), они рисуются отдельно под сглаженной линией.
 */
export default function ProgressLine({ data, unit, showRaw = false }: { data: Point[]; unit: string; showRaw?: boolean }) {
  const values = data.flatMap((d) => [d.value, d.raw ?? d.value])
  const min = Math.floor(Math.min(...values) * 0.97)
  const max = Math.ceil(Math.max(...values) * 1.02)
  const Chart = showRaw ? ComposedChart : LineChart

  return (
    <ResponsiveContainer width="100%" height={180}>
      <Chart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--c-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis domain={[min, max]} tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          contentStyle={{ background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 12, color: 'var(--c-text)' }}
          formatter={(v: number) => [`${String(v).replace('.', ',')} ${unit}`, '']}
          labelStyle={{ color: 'var(--c-text-2)' }}
          separator=""
        />
        {showRaw && <Scatter dataKey="raw" fill="var(--c-text-3)" r={2.5} isAnimationActive={false} />}
        <Line type="monotone" dataKey="value" stroke="var(--c-accent)" strokeWidth={2.5} dot={!showRaw && data.length < 20} isAnimationActive={false} />
      </Chart>
    </ResponsiveContainer>
  )
}
