import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav } from './ui/BottomNav'
import { UpdatePrompt } from './ui/UpdatePrompt'
import { SkeletonList } from './ui/components'
import { TodayScreen } from './screens/Today'
import { LoginScreen } from './screens/Login'
import { InstallScreen } from './screens/Install'
import { isIos, isStandalone } from './lib/platform'
import { ensureProfile, initAuth, onAuthChange, type AuthUser } from './lib/auth'
import { startAutoSync } from './lib/sync'
import { initTheme } from './lib/theme'
import { META, getMeta, setMeta } from './lib/db'
import { isCloudConfigured } from './lib/supabase'
import { ensureExercises } from './lib/exerciseData'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'

// Экраны грузятся по требованию: первый запуск в зале не тянет графики и аналитику.
const WorkoutScreen = lazy(() => import('./screens/workout/WorkoutScreen').then((m) => ({ default: m.WorkoutScreen })))
const FinishWorkout = lazy(() => import('./screens/workout/FinishWorkout').then((m) => ({ default: m.FinishWorkout })))
const ExercisesScreen = lazy(() => import('./screens/exercises/ExercisesScreen').then((m) => ({ default: m.ExercisesScreen })))
const ExerciseScreen = lazy(() => import('./screens/exercises/ExerciseScreen').then((m) => ({ default: m.ExerciseScreen })))
const CustomExerciseScreen = lazy(() => import('./screens/exercises/CustomExerciseScreen').then((m) => ({ default: m.CustomExerciseScreen })))
const VideoPinsScreen = lazy(() => import('./screens/exercises/VideoPinsScreen').then((m) => ({ default: m.VideoPinsScreen })))
const HistoryScreen = lazy(() => import('./screens/history/HistoryScreen').then((m) => ({ default: m.HistoryScreen })))
const SessionScreen = lazy(() => import('./screens/history/SessionScreen').then((m) => ({ default: m.SessionScreen })))
const ProgramScreen = lazy(() => import('./screens/program/ProgramScreen').then((m) => ({ default: m.ProgramScreen })))
const ProgramEditor = lazy(() => import('./screens/program/ProgramEditor').then((m) => ({ default: m.ProgramEditor })))
const VersionsScreen = lazy(() => import('./screens/program/VersionsScreen').then((m) => ({ default: m.VersionsScreen })))
const WeekTemplateScreen = lazy(() => import('./screens/program/WeekTemplateScreen').then((m) => ({ default: m.WeekTemplateScreen })))
const Onboarding = lazy(() => import('./screens/Onboarding').then((m) => ({ default: m.Onboarding })))
const ProgressScreen = lazy(() => import('./screens/progress/ProgressScreen').then((m) => ({ default: m.ProgressScreen })))
const ProfileScreen = lazy(() => import('./screens/Profile').then((m) => ({ default: m.ProfileScreen })))

/** Экраны без нижней навигации: тренировке нужен весь экран. */
const FULLSCREEN = ['/workout', '/login']

function Loading() {
  return (
    <div className="pt-safe px-safe min-h-dvh space-y-3 pt-16" role="status" aria-label="Загрузка">
      <SkeletonList rows={4} />
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [skipLogin, setSkipLogin] = useState(false)
  const [showInstall, setShowInstall] = useState(false)
  const profile = useLiveQuery(() => (user ? db.profiles.get(user.id) : undefined), [user?.id])

  useEffect(() => {
    let stopSync = () => {}
    void (async () => {
      await initTheme()
      const u = await initAuth()
      await ensureProfile(u.id)
      // решаем про экран установки до первой отрисовки, иначе он подменит
      // уже показанный экран прямо под пальцем
      const seen = await getMeta(META.installPromptSeen, false)
      setShowInstall(!seen && isIos() && !isStandalone())
      setUser(u)
      stopSync = startAutoSync()
      // справочник подтягивается в фоне: к первому открытию вкладки он уже на месте
      void ensureExercises().catch(() => {})
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

  if (!user) return <Loading />

  const needLogin = isCloudConfigured && user.local && !skipLogin
  if (needLogin && location.pathname !== '/login') return <LoginScreen onContinueLocal={() => setSkipLogin(true)} />

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

  if (profile === undefined) return <Loading />
  if (profile && !profile.onboardedAt) {
    return (
      <Suspense fallback={<Loading />}>
        <Onboarding profile={profile} onDone={() => {}} />
      </Suspense>
    )
  }

  const hideNav = FULLSCREEN.some((p) => location.pathname.startsWith(p))

  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<TodayScreen />} />
          <Route path="/workout" element={<WorkoutScreen />} />
          <Route path="/workout/finish" element={<FinishWorkout />} />
          <Route path="/exercises" element={<ExercisesScreen />} />
          <Route path="/exercises/new" element={<CustomExerciseScreen />} />
          <Route path="/exercises/:id" element={<ExerciseScreen />} />
          <Route path="/exercises/:id/edit" element={<CustomExerciseScreen />} />
          <Route path="/videos" element={<VideoPinsScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/history/:id" element={<SessionScreen />} />
          <Route path="/program" element={<ProgramScreen />} />
          <Route path="/program/edit" element={<ProgramEditor />} />
          <Route path="/program/versions" element={<VersionsScreen />} />
          <Route path="/program/week" element={<WeekTemplateScreen />} />
          <Route path="/progress/*" element={<ProgressScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/install" element={<InstallScreen onDone={() => history.back()} />} />
          <Route path="/login" element={<LoginScreen onContinueLocal={() => setSkipLogin(true)} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {!hideNav && <BottomNav />}
      <UpdatePrompt />
    </>
  )
}
