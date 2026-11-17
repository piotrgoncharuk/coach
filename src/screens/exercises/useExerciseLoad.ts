import { useCallback, useEffect, useState } from 'react'
import { ensureExercises } from '../../lib/exerciseData'

/** Догрузить справочник, если его ещё нет в локальной базе. */
export function useExerciseLoad() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(() => {
    setLoading(true)
    setError(null)
    ensureExercises()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(run, [run])
  return { loading, error, retry: run }
}
