import { useEffect, useRef, useState } from 'react'
import { progress, remainingSec, type RestTimerState } from '../domain/timer'
import { beep } from '../lib/sound'

/** Перерисовка раз в 200 мс, но значение всегда берётся из часов. */
export function useRestTimer(state: RestTimerState | null) {
  const [, tick] = useState(0)
  const firedRef = useRef(false)

  useEffect(() => {
    firedRef.current = false
    if (!state) return
    const id = setInterval(() => tick((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [state])

  useEffect(() => {
    if (!state || firedRef.current) return
    if (remainingSec(state) <= 0) {
      firedRef.current = true
      beep()
    }
  })

  if (!state) return null
  return {
    left: remainingSec(state),
    fraction: progress(state),
    done: remainingSec(state) <= 0,
  }
}
