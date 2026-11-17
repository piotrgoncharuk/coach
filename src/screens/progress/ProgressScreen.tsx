import { NavLink, Route, Routes } from 'react-router-dom'
import { Screen } from '../../ui/components'
import { SyncBadge } from '../../ui/SyncBadge'
import { BodyTab } from './BodyTab'
import { FoodTab } from './FoodTab'
import { RecoveryTab } from './RecoveryTab'
import { AnalyticsTab } from './AnalyticsTab'

const TABS = [
  // абсолютные пути: внутри маршрута «/progress/*» относительная ссылка «''»
  // указывала бы на текущий адрес и подсвечивала «Тело» на любой вкладке
  { to: '/progress', label: 'Тело' },
  { to: '/progress/food', label: 'Питание' },
  { to: '/progress/recovery', label: 'Восстановление' },
  { to: '/progress/analytics', label: 'Аналитика' },
]

export function ProgressScreen() {
  return (
    <Screen title="Прогресс" action={<SyncBadge />}>
      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4" aria-label="Разделы прогресса">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end
            className={({ isActive }) => `flex h-10 shrink-0 items-center rounded-full px-4 text-sm ${isActive ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<BodyTab />} />
        <Route path="food" element={<FoodTab />} />
        <Route path="recovery" element={<RecoveryTab />} />
        <Route path="analytics" element={<AnalyticsTab />} />
      </Routes>
    </Screen>
  )
}
