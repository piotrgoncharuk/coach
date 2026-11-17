// MCP-сервер Coach для тренера (Grok). Supabase Edge Function, Deno.
// Развёртывание: supabase functions deploy mcp --no-verify-jwt
// (своя авторизация — личный токен из приложения, а не JWT Supabase).
import postgres from 'npm:postgres@4.1.1'
import { handleHttp } from '../_shared/mcp.ts'
import { authenticate, coachData, type Sql } from '../_shared/coachData.ts'

// SUPABASE_DB_URL Supabase передаёт функциям сам. Соединение идёт мимо RLS,
// поэтому каждый запрос в coachData фильтрует строки по user_id владельца токена.
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 }) as unknown as Sql

Deno.serve((req) =>
  handleHttp(req, {
    authenticate: (token) => authenticate(sql, token),
    data: (userId) => coachData(sql, userId),
  }),
)
