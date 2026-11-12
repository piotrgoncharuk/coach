import { useState } from 'react'
import { Button, Card, Field } from '../ui/components'
import { signInWithEmail } from '../lib/auth'
import { isCloudConfigured } from '../lib/supabase'

export function LoginScreen({ onContinueLocal }: { onContinueLocal: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    const res = await signInWithEmail(email)
    setBusy(false)
    if (res.error) setError(res.error)
    else setSent(true)
  }

  return (
    <div className="pt-safe pb-safe px-safe flex min-h-dvh flex-col justify-center gap-4">
      <div className="text-center">
        <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-lg bg-accent text-2xl font-bold text-black">
          C
        </div>
        <h1 className="text-xl font-semibold">Coach</h1>
        <p className="text-sm text-fg-2">Дневник тренировок: зал, футбол, прогресс</p>
      </div>

      {!isCloudConfigured ? (
        <Card>
          <h2 className="font-semibold">Синхронизация не настроена</h2>
          <p className="mt-1 text-sm text-fg-2">
            Нет переменных окружения Supabase. Приложением можно пользоваться прямо сейчас — всё
            сохранится на этом устройстве, а когда ключи появятся, записи сами уедут на сервер.
          </p>
          <Button variant="primary" size="action" className="mt-4" onClick={onContinueLocal}>
            Продолжить на устройстве
          </Button>
        </Card>
      ) : sent ? (
        <Card>
          <h2 className="font-semibold">Письмо отправлено</h2>
          <p className="mt-1 text-sm text-fg-2">
            Открой ссылку из письма на этом же устройстве. Пароля нет — ссылка и есть вход.
          </p>
          <Button className="mt-4 w-full" onClick={() => setSent(false)}>
            Отправить ещё раз
          </Button>
        </Card>
      ) : (
        <Card>
          <Field
            label="Почта"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="ты@почта.ру"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <Button
            variant="primary"
            size="action"
            className="mt-4"
            disabled={busy || !email.includes('@')}
            onClick={() => void submit()}
          >
            {busy ? 'Отправляю…' : 'Прислать ссылку для входа'}
          </Button>
          <button onClick={onContinueLocal} className="mt-3 min-h-touch w-full text-sm text-fg-3">
            Продолжить без аккаунта
          </button>
        </Card>
      )}
    </div>
  )
}
