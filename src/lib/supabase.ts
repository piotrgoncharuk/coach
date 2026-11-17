import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Синхронизация настроена, если заданы обе переменные окружения. */
export const isCloudConfigured = !!(url && anonKey)

let client: Promise<SupabaseClient | null> | null = null

/**
 * Клиент Supabase грузится только когда он нужен: без ключей приложение
 * работает локально и не тянет лишние ~120 КБ при каждом открытии в зале.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isCloudConfigured) return Promise.resolve(null)
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'coach-auth' },
    }),
  )
  return client
}
