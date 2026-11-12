import { META, getMeta, setMeta } from './db'

export type Theme = 'dark' | 'light' | 'system'

function resolve(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  const effective = resolve(theme)
  document.documentElement.classList.toggle('light', effective === 'light')
  const meta = document.querySelector('meta[name="theme-color"]:not([media])')
  meta?.setAttribute('content', effective === 'light' ? '#F6F7F9' : '#0B0D10')
}

export async function initTheme(): Promise<Theme> {
  const theme = await getMeta<Theme>(META.theme, 'dark')
  applyTheme(theme)
  return theme
}

export async function saveTheme(theme: Theme): Promise<void> {
  await setMeta(META.theme, theme)
  applyTheme(theme)
}
