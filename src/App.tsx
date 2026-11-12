import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav } from './ui/BottomNav'
import { UpdatePrompt } from './ui/UpdatePrompt'
import { SkeletonList } from './ui/components'
import { TodayScreen } from './screens/Today'
import { WorkoutScreen } from './screens/Workout'
import { ExercisesScreen, ProgramScreen, ProgressScreen } from './screens/Stubs'
import { ProfileScreen } from './screens/Profile'
import { LoginScreen } from './screens/Login'
import { InstallScreen, isIos, isStandalone } from './screens/Install'
import { ensureProfile, initAuth, onAuthChange, type AuthUser } from './lib/auth'
import { startAutoSync } from './lib/sync'
import { initTheme } from './lib/theme'
import { META, getMeta, setMeta } from './lib/db'
import { isCloudConfigured } from './lib/supabase'

/** Экраны без нижней навигации: тренировка (нужен весь экран) и вход. */
const FULLSCREEN = ['/workout', '/login']

export default function App() {
  const location = useLocation()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [skipLogin, setSkipLogin] = useState(false)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    let stopSync = () => {}
    void (async () => {
      await initTheme()
      const u = await initAuth()
      await ensureProfile(u.id)
      setUser(u)
      stopSync = startAutoSync()

      // Подсказку про установку показываем один раз, и только в Safari на iPhone
      const seen = await getMeta(META.installPromptSeen, false)
      if (!seen && isIos() && !isStandalone()) setShowInstall(true)
    })()
    const off = onAuthChange((u) => {
      setUser(u)
      void ensureProfile(u.id)
    })
    return () => {
      off()
      stopSync()
    }
  }, [])

  if (!user) {
    return (
      <div className="pt-safe px-safe min-h-dvh space-y-3 pt-8">
        <SkeletonList rows={4} />
      </div>
    )
  }

  const needLogin = isCloudConfigured && user.local && !skipLogin
  if (needLogin && location.pathname !== '/login') {
    return <LoginScreen onContinueLocal={() => setSkipLogin(true)} />
  }

  if (showInstall) {
    return (
      <InstallScreen
        onDone={() => {
          setShowInstall(false)
          void setMeta(META.installPromptSeen, true)
        }}
      />
    )
  }

  const hideNav = FULLSCREEN.some((p) => location.pathname.startsWith(p))

  return (
    <>
      <Routes>
        <Route path="/" element={<TodayScreen />} />
        <Route path="/workout" element={<WorkoutScreen />} />
        <Route path="/program" element={<ProgramScreen />} />
        <Route path="/exercises" element={<ExercisesScreen />} />
        <Route path="/progress" element={<ProgressScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/install" element={<InstallScreen onDone={() => history.back()} />} />
        <Route path="/login" element={<LoginScreen onContinueLocal={() => setSkipLogin(true)} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideNav && <BottomNav />}
      <UpdatePrompt />
    </>
  )
}
