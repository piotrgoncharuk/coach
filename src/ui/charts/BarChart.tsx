import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface Bar1 {
  label: string
  value: number
}

const AXIS = { fontSize: 11, fill: 'var(--c-text-3)' }

export default function SimpleBars({ data, unit, band }: { data: Bar1[]; unit: string; band?: { min: number; max: number } }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--c-border)" strokeDasharray="2 4" vertical={false} />
        {band && <ReferenceArea y1={band.min} y2={band.max} fill="var(--c-success)" fillOpacity={0.08} />}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--c-raised)' }}
          contentStyle={{ background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 12, color: 'var(--c-text)' }}
          formatter={(v: number) => [`${String(v).replace('.', ',')} ${unit}`, '']}
          separator=""
        />
        <Bar dataKey="value" fill="var(--c-accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
