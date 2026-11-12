import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Клиент появляется только если заданы обе переменные окружения.
 * Без них приложение работает локально: данные лежат в IndexedDB и не теряются,
 * а очередь отправки ждёт, пока синхронизацию включат.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storageKey: 'coach-auth',
        },
      })
    : null

export const isCloudConfigured = supabase !== null
