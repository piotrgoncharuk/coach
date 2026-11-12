import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Field, Screen } from '../ui/components'
import { SyncBadge } from '../ui/SyncBadge'
import { db } from '../lib/db'
import { save } from '../lib/repo'
import { getUser, signOut } from '../lib/auth'
import { isCloudConfigured } from '../lib/supabase'
import { initTheme, saveTheme, type Theme } from '../lib/theme'
import { isStandalone, isWakeLockSupportedLabel } from './profile-info'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Тёмная' },
  { value: 'light', label: 'Светлая' },
  { value: 'system', label: 'Как в системе' },
]

export function ProfileScreen() {
  const navigate = useNavigate()
  const user = getUser()
  const profile = useLiveQuery(() => db.profiles.get(user.id), [user.id])
  const [theme, setTheme] = useState<Theme>('dark')

  const counts = useLiveQuery(async () => ({
    sessions: await db.sessions.count(),
    sets: await db.sets.count(),
    exercises: await db.exercises.count(),
    pending: await db.outbox.count(),
  }))

  useEffect(() => {
    void initTheme().then(setTheme)
  }, [])

  async function patch(field: 'displayName' | 'kcalTarget' | 'proteinTarget' | 'heightCm', value: string) {
    if (!profile) return
    const next =
      field === 'displayName' ? value : value === '' ? null : Number(value.replace(',', '.'))
    await save('profiles', { id: profile.id, [field]: next })
  }

  return (
    <Screen title="Профиль" action={<SyncBadge />}>
      <Card>
        <div className="space-y-3">
          <Field
            label="Имя"
            placeholder="Как тебя зовут"
            defaultValue={profile?.displayName ?? ''}
            onBlur={(e) => void patch('displayName', e.currentTarget.value)}
          />
          <Field
            label="Рост, см"
            type="number"
            inputMode="decimal"
            defaultValue={profile?.heightCm ?? ''}
            onBlur={(e) => void patch('heightCm', e.currentTarget.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Цель, ккал"
              type="number"
              inputMode="numeric"
              defaultValue={profile?.kcalTarget ?? 3000}
              onBlur={(e) => void patch('kcalTarget', e.currentTarget.value)}
            />
            <Field
              label="Цель, белок (г)"
              type="number"
              inputMode="numeric"
              defaultValue={profile?.proteinTarget ?? 190}
              onBlur={(e) => void patch('proteinTarget', e.currentTarget.value)}
            />
          </div>
          <p className="text-xs text-fg-3">
            Цели по питанию не привязаны к весу тела: цели по весу сейчас нет, в разделе «Прогресс»
            будет только факт и динамика.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Оформление</h2>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setTheme(t.value)
                void saveTheme(t.value)
              }}
              aria-pressed={theme === t.value}
              className={`min-h-touch flex-1 rounded-card text-sm ${
                theme === t.value ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Данные и синхронизация</h2>
        <dl className="space-y-1.5 text-sm">
          <Row label="Вход" value={user.local ? 'без аккаунта, только это устройство' : (user.email ?? 'выполнен')} />
          <Row label="Сервер" value={isCloudConfigured ? 'настроен' : 'не настроен (нет переменных окружения)'} />
          <Row label="Тренировок" value={String(counts?.sessions ?? 0)} />
          <Row label="Подходов" value={String(counts?.sets ?? 0)} />
          <Row label="Упражнений в справочнике" value={String(counts?.exercises ?? 0)} />
          <Row
            label="Не отправлено"
            value={counts?.pending ? `${counts.pending} правок ждут сети` : 'всё отправлено'}
          />
        </dl>
        {!user.local && (
          <Button className="mt-3 w-full" onClick={() => void signOut()}>
            Выйти
          </Button>
        )}
        {user.local && isCloudConfigured && (
          <>
            <Button variant="primary" className="mt-3 w-full" onClick={() => navigate('/login')}>
              Войти и включить синхронизацию
            </Button>
            <p className="mt-2 text-xs text-fg-3">
              При первом входе всё, что записано на устройстве, переедет в аккаунт — ничего не пропадёт.
            </p>
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Приложение</h2>
        <dl className="space-y-1.5 text-sm">
          <Row label="Установлено на домашний экран" value={isStandalone() ? 'да' : 'нет'} />
          <Row label="Экран не гаснет в зале" value={isWakeLockSupportedLabel()} />
          <Row label="Вибрация по окончании отдыха" value="недоступна в Safari на iOS" />
        </dl>
        <Button className="mt-3 w-full" onClick={() => navigate('/install')}>
          Как установить на iPhone
        </Button>
      </Card>

      <div className="pb-4 text-center">
        <Badge>этапы 4–5: экспорт, импорт и токен для тренера</Badge>
      </div>
    </Screen>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-3">{label}</dt>
      <dd className="text-right text-fg-2">{value}</dd>
    </div>
  )
}
