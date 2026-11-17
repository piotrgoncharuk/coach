import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleHttp, TOOLS } from '../functions/_shared/mcp.ts'
import { authenticate, coachData, sha256Hex, type Sql } from '../functions/_shared/coachData.ts'

const sql = postgres({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: 'postgres', database: process.env.PGDATABASE, onnotice: () => {} })
const S = sql as unknown as Sql

const PETR = 'aaaaaaaa-0000-4000-8000-000000000001'
const YULIA = 'bbbbbbbb-0000-4000-8000-000000000002'
const TOKEN_P = 'cch_petr_test_token_0123456789abcdef'
const TOKEN_Y = 'cch_yulia_test_token_0123456789abcdef'
const TOKEN_REVOKED = 'cch_revoked_token_0123456789abcdefgh'
const SQUAT = 'eeeeeeee-0000-5000-8000-000000000001'
const BENCH = 'eeeeeeee-0000-5000-8000-000000000002'
const PLANK = 'eeeeeeee-0000-5000-8000-000000000003'

const deps = { authenticate: (t: string) => authenticate(S, t), data: (u: string) => coachData(S, u) }
let rpcId = 0

async function call(token: string | null, body: unknown, method = 'POST') {
  const res = await handleHttp(new Request('https://coach.test/functions/v1/mcp', {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }), deps)
  const text = await res.text()
  const isJson = res.headers.get('content-type')?.includes('application/json')
  return { status: res.status, body: text && isJson ? JSON.parse(text) : text || null }
}

async function tool(token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await call(token, { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } })
  expect(r.status).toBe(200)
  return r.body.result as { isError: boolean; structuredContent: Record<string, unknown> & { items?: unknown[] }; content: { text: string }[] }
}

beforeAll(async () => {
  await sql`insert into auth.users (id, email) values (${PETR}, 'p@test'), (${YULIA}, 'y@test')`
  await sql`update public.profiles set display_name = 'Пётр', height_cm = 193, limitations = '{back,hamstring}', gym_weekdays = '{2,4,6}', football_weekdays = '{0}' where id = ${PETR}`
  await sql`update public.profiles set display_name = 'Юлия' where id = ${YULIA}`
  await sql`insert into public.exercises (id, slug, name_ru, name_en, primary_muscles) values
    (${SQUAT}, 'Barbell_Squat', 'Приседания со штангой', 'Barbell Squat', '{quadriceps}'),
    (${BENCH}, 'Barbell_Bench_Press_-_Medium_Grip', 'Жим штанги лёжа средним хватом', 'Barbell Bench Press', '{chest}'),
    (${PLANK}, 'Plank', 'Планка', 'Plank', '{abdominals}')`
  for (const [user, token, revoked] of [[PETR, TOKEN_P, false], [YULIA, TOKEN_Y, false], [PETR, TOKEN_REVOKED, true]] as const) {
    await sql`insert into public.api_tokens (user_id, name, token_hash, prefix, revoked_at)
      values (${user}, 'grok', ${await sha256Hex(token)}, ${token.slice(0, 8)}, ${revoked ? new Date() : null})`
  }
  // программа и тренировки Петра
  const [prog] = await sql`insert into public.programs (user_id, name, is_active) values (${PETR}, 'Всё тело ×3', true) returning id`
  const [dayA] = await sql`insert into public.program_days (user_id, program_id, order_index, name, heavy_legs) values (${PETR}, ${prog.id}, 0, 'День A', true) returning id`
  await sql`insert into public.program_exercises (user_id, program_day_id, exercise_id, order_index, target_sets, rep_min, rep_max, target_rir, rest_sec)
    values (${PETR}, ${dayA.id}, ${SQUAT}, 0, 3, 6, 8, 2, 180), (${PETR}, ${dayA.id}, ${BENCH}, 1, 3, 6, 10, 2, 150)`
  for (const [user, date, weight] of [[PETR, '2026-11-10', 80], [PETR, '2026-11-17', 85], [YULIA, '2026-11-17', 40]] as const) {
    const [s] = await sql`insert into public.sessions (user_id, date, started_at, finished_at, status, difficulty)
      values (${user}, ${date}, ${`${date}T10:00:00Z`}, ${`${date}T11:05:00Z`}, 'finished', 7) returning id`
    const [se] = await sql`insert into public.session_exercises (user_id, session_id, exercise_id, order_index) values (${user}, ${s.id}, ${SQUAT}, 0) returning id`
    for (let i = 1; i <= 3; i++) {
      await sql`insert into public.sets (user_id, session_exercise_id, exercise_id, set_index, weight_kg, reps, rir, type)
        values (${user}, ${se.id}, ${SQUAT}, ${i}, ${weight}, 8, 2, 'work')`
    }
  }
  await sql`insert into public.calendar_events (user_id, date, type, duration_min, intensity, status) values (${PETR}, '2026-11-22', 'football', 90, 7, 'planned')`
  await sql`insert into public.readiness_checkins (user_id, date, sleep_hours, energy, soreness, stress, score, flag) values (${PETR}, '2026-11-17', 7.5, 4, 2, 2, 87, 'green')`
  await sql`insert into public.body_metrics (user_id, date, weight_kg) values (${PETR}, '2026-11-17', 97.2), (${YULIA}, '2026-11-17', 61)`
  await sql`insert into public.coach_notes (user_id, author, text) values (${YULIA}, 'coach', 'секрет Юлии')`
})

afterAll(async () => {
  await sql.end()
})

describe('MCP: транспорт и авторизация', () => {
  it('без токена — 401 с подсказкой', async () => {
    const r = await call(null, { jsonrpc: '2.0', id: 1, method: 'initialize' })
    expect(r.status).toBe(401)
    expect(r.body.error.message).toContain('Bearer')
  })

  it('отозванный и выдуманный токены не работают', async () => {
    expect((await call(TOKEN_REVOKED, { jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(401)
    expect((await call('cch_does_not_exist_0123456789abcdef', { jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(401)
  })

  it('initialize договаривается о версии протокола', async () => {
    const r = await call(TOKEN_P, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'grok', version: '1' } } })
    expect(r.body.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'coach' }, capabilities: { tools: {} } })
    const old = await call(TOKEN_P, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })
    expect(old.body.result.protocolVersion).toBe('2025-06-18')
  })

  it('уведомление — 202 без тела, GET — 405, пакет — 400, неизвестный метод — -32601', async () => {
    expect((await call(TOKEN_P, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
    expect((await call(TOKEN_P, null, 'GET')).status).toBe(405)
    expect((await call(TOKEN_P, [{ jsonrpc: '2.0', id: 1, method: 'ping' }])).status).toBe(400)
    expect((await call(TOKEN_P, { jsonrpc: '2.0', id: 9, method: 'resources/list' })).body.error.code).toBe(-32601)
  })

  it('12 инструментов, и ни один не умеет менять или удалять записи', async () => {
    const r = await call(TOKEN_P, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const names = r.body.result.tools.map((t: { name: string }) => t.name)
    expect(names).toHaveLength(12)
    expect(names.filter((n: string) => /delete|update|remove|set_/.test(n))).toEqual([])
    expect(TOOLS.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)).toEqual(['propose_program_change', 'add_coach_note'])
  })

  it('токен отмечает время последнего использования', async () => {
    const [t] = await sql`select last_used_at from public.api_tokens where token_hash = ${await sha256Hex(TOKEN_P)}`
    expect(t.last_used_at).not.toBeNull()
  })
})

describe('MCP: чтение данных и изоляция', () => {
  it('профиль Петра с ограничениями и шаблоном недели', async () => {
    const r = await tool(TOKEN_P, 'get_profile')
    expect(r.structuredContent).toMatchObject({ name: 'Пётр', height_cm: 193, limitations: ['back', 'hamstring'], week_template: { gym: ['вт', 'чт', 'сб'], football: ['вс'] }, latest_weight: { weight_kg: 97.2 } })
  })

  it('программа с exercise_id и slug для правок', async () => {
    const r = await tool(TOKEN_P, 'get_program')
    const day = (r.structuredContent.days as { exercises: { slug: string; exercise_id: string; rest_sec: number }[] }[])[0]
    expect(day.exercises[0]).toMatchObject({ slug: 'Barbell_Squat', exercise_id: SQUAT, rest_sec: 180 })
  })

  it('у Юлии своя картина: программы нет, тренировки и заметки только свои', async () => {
    expect((await tool(TOKEN_Y, 'get_program')).structuredContent).toEqual({ program: null })
    const sessions = (await tool(TOKEN_Y, 'get_sessions', { from: '2026-11-01', to: '2026-11-30' })).structuredContent.items as { exercises: { sets: { weight_kg: number }[] }[] }[]
    expect(sessions).toHaveLength(1)
    expect(sessions[0].exercises[0].sets[0].weight_kg).toBe(40)
    const notesP = (await tool(TOKEN_P, 'get_coach_notes')).structuredContent.items as { text: string }[]
    expect(notesP.map((n) => n.text)).not.toContain('секрет Юлии')
  })

  it('тренировки Петра с длительностью и 1ПМ', async () => {
    const s = (await tool(TOKEN_P, 'get_sessions', { from: '2026-11-01', to: '2026-11-30' })).structuredContent.items as { duration_min: number; exercises: { sets: { e1rm_kg: number }[] }[] }[]
    expect(s).toHaveLength(2)
    expect(s[0].duration_min).toBe(65)
    expect(s[1].exercises[0].sets[0].e1rm_kg).toBe(113.3)
  })

  it('история упражнения находится по названию, slug и UUID — даже при упражнении-тёзке', async () => {
    // в базе уже есть общее упражнение с таким же названием (из теста изоляции):
    // побеждает то, которое человек реально делал
    for (const ref of ['Приседания со штангой', 'barbell squat', 'Barbell_Squat', SQUAT]) {
      const r = await tool(TOKEN_P, 'get_exercise_history', { exercise_id: ref })
      expect(r.isError).toBe(false)
      expect((r.structuredContent.sessions as unknown[]).length).toBe(2)
    }
    expect((await tool(TOKEN_P, 'get_exercise_history', { exercise_id: 'Тяга бревна' })).isError).toBe(true)
  })

  it('сводка недели: подходы, тоннаж, объём по группам, футбол, готовность, вес', async () => {
    const w = (await tool(TOKEN_P, 'get_weekly_summary', { week: '2026-11-19' })).structuredContent
    expect(w).toMatchObject({
      week_start: '2026-11-16', week_end: '2026-11-22', work_sets: 3, tonnage_kg: 2040,
      volume_sets_by_group: { legs: 3 }, readiness: { avg_score_0_100: 87 }, weight_avg_kg: 97.2,
    })
    expect(w.football).toEqual([{ date: '2026-11-22', duration_min: 90, intensity_1_10: 7, load: 630 }])
  })

  it('ошибки параметров возвращаются как результат с причиной', async () => {
    const r = await tool(TOKEN_P, 'get_calendar', { from: '17.11.2026', to: '2026-11-30' })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('YYYY-MM-DD')
    expect((await tool(TOKEN_P, 'get_readiness', { from: '2025-01-01', to: '2026-12-31' })).content[0].text).toContain('366')
  })
})

describe('MCP: запись только черновиками', () => {
  it('правка становится черновиком, программа не меняется', async () => {
    const before = await sql`select target_sets from public.program_exercises where user_id = ${PETR} and exercise_id = ${SQUAT}`
    const r = await tool(TOKEN_P, 'propose_program_change', {
      title: 'Больше объёма на ноги', rationale: 'Готовность зелёная третью неделю',
      changes: [{ op: 'update_exercise', day: 1, exercise: 'Barbell_Squat', sets: 4 }, { op: 'add_exercise', day: 'День A', exercise: 'Планка', sets: 3, rep_min: 30, rep_max: 45, rir: 2 }],
    })
    expect(r.isError).toBe(false)
    expect(r.structuredContent.status).toBe('pending')
    const [p] = await sql`select status, source, payload from public.program_change_proposals where id = ${r.structuredContent.proposal_id as string}`
    expect(p).toMatchObject({ status: 'pending', source: 'coach' })
    const after = await sql`select target_sets from public.program_exercises where user_id = ${PETR} and exercise_id = ${SQUAT}`
    expect(after).toEqual(before)
  })

  it('неверная правка отклоняется с объяснением и ничего не пишет', async () => {
    const count = async () => (await sql`select count(*)::int as n from public.program_change_proposals`)[0].n
    const n = await count()
    const r = await tool(TOKEN_P, 'propose_program_change', { title: 'x', changes: [{ op: 'update_exercise', day: 4, exercise: 'Тяга бревна', sets: 3 }] })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('нет дня «4»')
    expect(r.content[0].text).toContain('«Тяга бревна» не найдено')
    expect(await count()).toBe(n)
  })

  it('у Юлии без программы правка невозможна', async () => {
    const r = await tool(TOKEN_Y, 'propose_program_change', { title: 'x', changes: [{ op: 'update_day', day: 1, name: 'A' }] })
    expect(r.content[0].text).toContain('нет активной программы')
  })

  it('заметка тренера пишется к владельцу токена', async () => {
    const r = await tool(TOKEN_P, 'add_coach_note', { text: 'Бедро: держим RIR 2 ещё 2 недели', tags: ['бедро'] })
    expect(r.isError).toBe(false)
    const notes = (await tool(TOKEN_P, 'get_coach_notes')).structuredContent.items as { text: string; tags: string[] }[]
    expect(notes[0]).toMatchObject({ text: 'Бедро: держим RIR 2 ещё 2 недели', tags: ['бедро'] })
    const yulia = (await tool(TOKEN_Y, 'get_coach_notes')).structuredContent.items as { text: string }[]
    expect(yulia.map((n) => n.text)).toEqual(['секрет Юлии'])
  })
})
