import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { assetUrl, isLocalMedia } from '../lib/exerciseData'

/** Фото упражнения: общее — из сборки (кэшируется офлайн), своё — из локальной базы. */
export function ExerciseImage({
  path, alt, className = '', eager = false,
}: { path: string | null; alt: string; className?: string; eager?: boolean }) {
  const [src, setSrc] = useState<string | null>(path && !isLocalMedia(path) ? assetUrl(path) : null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!path) return setSrc(null)
    if (!isLocalMedia(path)) return setSrc(assetUrl(path))
    let url: string | null = null
    void db.media.get(path.slice(6)).then((m) => {
      if (!m) return setFailed(true)
      url = URL.createObjectURL(m.blob)
      setSrc(url)
    })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [path])

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-raised text-xs text-fg-3 ${className}`} aria-label={`${alt}: нет фото`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
        </svg>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={`bg-white object-cover ${className}`}
    />
  )
}
