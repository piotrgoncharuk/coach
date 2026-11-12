import { NavLink } from 'react-router-dom'
import { IconExercises, IconProfile, IconProgram, IconProgress, IconToday } from './icons'

const TABS = [
  { to: '/', label: 'Сегодня', Icon: IconToday },
  { to: '/program', label: 'Программа', Icon: IconProgram },
  { to: '/exercises', label: 'Упражнения', Icon: IconExercises },
  { to: '/progress', label: 'Прогресс', Icon: IconProgress },
  { to: '/profile', label: 'Профиль', Icon: IconProfile },
]

export function BottomNav() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="flex">
        {TABS.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-touch flex-col items-center gap-0.5 py-2 text-xs ${
                  isActive ? 'text-accent' : 'text-fg-3'
                }`
              }
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
