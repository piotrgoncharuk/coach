/**
 * Данные для тренера — прямые SQL-запросы с фильтром по user_id в КАЖДОМ
 * запросе. Edge Function подключается к базе напрямую (SUPABASE_DB_URL), то есть
 * мимо RLS, поэтому изоляция Петра и Юлии держится здесь, и её проверяют тесты.
 *
 * Ответы компактные, с единицами в именах полей: weight_kg, rest_sec, duration_min.
 */
import { epley, MUSCLE_GROUP, WEEKDAY } from './muscles.ts'
import { validateStructure, findDay, type Proposal, type Snapshot } from './proposal.ts'

// Минимальный интерфейс клиента postgres (npm:postgres): тегированный шаблон.
export type Sql = <T = Row>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>
type Row = Record<string, unknown>

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v))
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? null : String(v).slice(0, 10))

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Личный токен → пользователь. Отозванный и удалённый токен не работает. */
export async function authenticate(sql: Sql, token: string): Promise<string | null> {
  if (!/^cch_[A-Za-z0-9_-]{20,}$/.test(token)) return null
  const hash = await sha256Hex(token)
  const rows = await sql<{ user_id: string }>`
    update public.api_tokens set last_used_at = now()
     where token_hash = ${hash} and revoked_at is null and deleted_at is null
     returning user_id`
  return rows[0]?.user_id ?? null
}

export class ToolError extends Error {}

function range(from: unknown, to: unknown): { from: string; to: string } {
  const ok = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
  if (!ok(from) || !ok(to)) throw new ToolError('from и to — даты в формате YYYY-MM-DD.')
  if ((from as string) > (to as string)) throw new ToolError('from позже to.')
  if ((Date.parse(to as string) - Date.parse(from as string)) / 86_400_000 > 366) throw new ToolError('Диапазон не больше 366 дней.')
  return { from: from as string, to: to as string }
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const wd = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (wd === 0 ? -6 : 1 - wd))
  return d.toISOString().slice(0, 10)
}
function plusDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function coachData(sql: Sql, userId: string) {
  async function activeProgram() {
    const [p] = await sql`select id, name, version, notes from public.programs
      where user_id = ${userId} and is_active and deleted_at is null order by version desc limit 1`
    return p ?? null
  }

  async function resolveExercise(ref: string): Promise<{ id: string; name: string; slug: string | null } | null> {
    const r = ref.trim()
    const isUuid = /^[0-9a-f-]{36}$/i.test(r)
    // При совпадении названий порядок такой: точный UUID, slug, упражнение,
    // которое человек реально делал, своё упражнение — и только потом общее.
    const rows = await sql<{ id: string; name_ru: string; slug: string | null }>`
      select e.id, e.name_ru, e.slug from public.exercises e
       where e.deleted_at is null and (e.owner_id is null or e.owner_id = ${userId})
         and (${isUuid ? r : null}::uuid = e.id or e.slug = ${r} or lower(e.name_ru) = lower(${r}) or lower(e.name_en) = lower(${r}))
       order by (${isUuid ? r : null}::uuid = e.id) is true desc,
                (e.slug = ${r}) is true desc,
                exists (select 1 from public.sets st where st.user_id = ${userId} and st.exercise_id = e.id and st.deleted_at is null) desc,
                (e.owner_id = ${userId}) is true desc
       limit 1`
    return rows[0] ? { id: rows[0].id, name: rows[0].name_ru, slug: rows[0].slug } : null
  }

  async function programSnapshot(programId: string): Promise<Snapshot & { names: Map<string, { name: string; slug: string | null }> }> {
    const [p] = await sql`select name, notes from public.programs where id = ${programId} and user_id = ${userId}`
    const days = await sql`select id, name, focus, heavy_legs from public.program_days
      where program_id = ${programId} and user_id = ${userId} and deleted_at is null order by order_index`
    const ex = await sql`select pe.*, e.name_ru, e.slug from public.program_exercises pe
      join public.exercises e on e.id = pe.exercise_id
      where pe.user_id = ${userId} and pe.deleted_at is null and pe.program_day_id = any(${days.map((d) => d.id)}) order by pe.order_index`
    const names = new Map<string, { name: string; slug: string | null }>()
    for (const e of ex) names.set(e.exercise_id as string, { name: e.name_ru as string, slug: e.slug as string | null })
    return {
      name: p.name as string,
      notes: p.notes as string | null,
      names,
      days: days.map((d) => ({
        name: d.name as string, focus: d.focus as string | null, heavyLegs: d.heavy_legs as boolean,
        exercises: ex.filter((e) => e.program_day_id === d.id).map((e) => ({
          exercise: e.exercise_id as string, sets: e.target_sets as number, repMin: e.rep_min as number, repMax: e.rep_max as number,
          rir: e.target_rir as number, restSec: e.rest_sec as number, cautious: e.cautious as boolean,
          supersetGroup: e.superset_group as string | null, notes: e.notes as string | null,
        })),
      })),
    }
  }

  async function sessionsBetween(from: string, to: string) {
    const sessions = await sql`select s.id, s.date, s.started_at, s.finished_at, s.status, s.difficulty, s.note, d.name as day_name
      from public.sessions s left join public.program_days d on d.id = s.program_day_id
      where s.user_id = ${userId} and s.deleted_at is null and s.status <> 'active' and s.date between ${from} and ${to}
      order by s.date, s.started_at`
    const ids = sessions.map((s) => s.id)
    const sets = ids.length ? await sql`select st.weight_kg, st.reps, st.rir, st.type, st.is_pr, se.session_id, se.order_index,
        e.id as exercise_id, e.name_ru, e.primary_muscles
      from public.sets st
      join public.session_exercises se on se.id = st.session_exercise_id
      join public.exercises e on e.id = st.exercise_id
      where st.user_id = ${userId} and st.deleted_at is null and se.deleted_at is null and se.session_id = any(${ids})
      order by se.order_index, st.set_index` : []
    return { sessions, sets }
  }

  return {
    async get_profile() {
      const [p] = await sql`select display_name, height_cm, limitations, kcal_target, protein_target, gym_weekdays,
        football_weekdays, deload_start, weight_goal_kg from public.profiles where id = ${userId}`
      const [w] = await sql`select date, weight_kg from public.body_metrics where user_id = ${userId}
        and deleted_at is null and weight_kg is not null order by date desc limit 1`
      if (!p) throw new ToolError('Профиль не найден.')
      return {
        name: p.display_name, height_cm: num(p.height_cm), limitations: p.limitations,
        targets: { kcal: p.kcal_target, protein_g: p.protein_target },
        weight_goal_kg: num(p.weight_goal_kg),
        latest_weight: w ? { date: day(w.date), weight_kg: num(w.weight_kg) } : null,
        week_template: {
          gym: (p.gym_weekdays as number[]).map((d) => WEEKDAY[d]),
          football: (p.football_weekdays as number[]).map((d) => WEEKDAY[d]),
        },
        deload_week_start: day(p.deload_start),
        rules: 'Тяжёлые ноги не ставятся за день до футбола и на следующий день после. Прогрессия двойная. Осторожный режим: шаг ≤ 2,5 кг, RIR ≥ 2.',
      }
    },

    async get_program() {
      const p = await activeProgram()
      if (!p) return { program: null }
      const snap = await programSnapshot(p.id as string)
      return {
        name: snap.name, version: p.version, notes: snap.notes,
        days: snap.days.map((d, i) => ({
          day: i + 1, name: d.name, focus: d.focus, heavy_legs: d.heavyLegs,
          exercises: d.exercises.map((e, j) => ({
            position: j + 1, exercise_id: e.exercise, slug: snap.names.get(e.exercise)?.slug ?? null,
            name: snap.names.get(e.exercise)?.name, sets: e.sets, rep_min: e.repMin, rep_max: e.repMax, rir: e.rir,
            rest_sec: e.restSec, cautious: e.cautious, superset: e.supersetGroup, notes: e.notes,
          })),
        })),
      }
    },

    async get_calendar(args: { from?: unknown; to?: unknown }) {
      const r = range(args.from, args.to)
      const rows = await sql`select c.date, c.type, c.status, c.duration_min, c.intensity, d.name as day_name, d.heavy_legs
        from public.calendar_events c left join public.program_days d on d.id = c.program_day_id
        where c.user_id = ${userId} and c.deleted_at is null and c.date between ${r.from} and ${r.to} order by c.date`
      return rows.map((e) => ({
        date: day(e.date), weekday: WEEKDAY[new Date(`${day(e.date)}T12:00:00Z`).getUTCDay()], type: e.type, status: e.status,
        ...(e.type === 'gym' ? { day: e.day_name, heavy_legs: e.heavy_legs } : {}),
        ...(e.type === 'football' ? { duration_min: e.duration_min, intensity_1_10: e.intensity } : {}),
      }))
    },

    async get_sessions(args: { from?: unknown; to?: unknown }) {
      const r = range(args.from, args.to)
      const { sessions, sets } = await sessionsBetween(r.from, r.to)
      return sessions.map((s) => {
        const own = sets.filter((x) => x.session_id === s.id)
        const byEx = new Map<string, { exercise_id: string; name: string; sets: unknown[] }>()
        for (const x of own) {
          const k = x.exercise_id as string
          if (!byEx.has(k)) byEx.set(k, { exercise_id: k, name: x.name_ru as string, sets: [] })
          byEx.get(k)!.sets.push({ weight_kg: num(x.weight_kg), reps: x.reps, rir: x.rir, type: x.type, e1rm_kg: x.type === 'warmup' ? null : epley(Number(x.weight_kg), x.reps as number, x.rir as number | null), pr: x.is_pr || undefined })
        }
        return {
          date: day(s.date), day: s.day_name ?? 'свободная', status: s.status, difficulty_1_10: s.difficulty, note: s.note,
          duration_min: s.finished_at ? Math.round((Date.parse(iso(s.finished_at)!) - Date.parse(iso(s.started_at)!)) / 60000) : null,
          exercises: [...byEx.values()],
        }
      })
    },

    async get_exercise_history(args: { exercise_id?: unknown; limit?: unknown }) {
      if (typeof args.exercise_id !== 'string') throw new ToolError('exercise_id: UUID, slug или название упражнения.')
      const ex = await resolveExercise(args.exercise_id)
      if (!ex) throw new ToolError(`Упражнение «${args.exercise_id}» не найдено.`)
      const limit = Math.min(50, Math.max(1, Number(args.limit ?? 12)))
      const rows = await sql`select s.date, st.weight_kg, st.reps, st.rir, st.type from public.sets st
        join public.session_exercises se on se.id = st.session_exercise_id
        join public.sessions s on s.id = se.session_id
        where st.user_id = ${userId} and st.exercise_id = ${ex.id} and st.deleted_at is null and s.deleted_at is null
        order by s.date desc, st.set_index`
      const byDate = new Map<string, { date: string; sets: unknown[]; best_e1rm_kg: number }>()
      for (const r of rows) {
        const d = day(r.date)!
        if (!byDate.has(d)) byDate.set(d, { date: d, sets: [], best_e1rm_kg: 0 })
        const e = byDate.get(d)!
        e.sets.push({ weight_kg: num(r.weight_kg), reps: r.reps, rir: r.rir, type: r.type })
        if (r.type !== 'warmup') e.best_e1rm_kg = Math.max(e.best_e1rm_kg, epley(Number(r.weight_kg), r.reps as number, r.rir as number | null))
      }
      const prs = await sql`select kind, max(value) as value from public.personal_records
        where user_id = ${userId} and exercise_id = ${ex.id} and deleted_at is null group by kind`
      return {
        exercise: { id: ex.id, slug: ex.slug, name: ex.name },
        records: Object.fromEntries(prs.map((p) => [p.kind === 'reps' ? 'reps' : `${p.kind}_kg`, num(p.value)])),
        sessions: [...byDate.values()].slice(0, limit),
      }
    },

    async get_weekly_summary(args: { week?: unknown }) {
      const anchor = typeof args.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.week) ? args.week : new Date().toISOString().slice(0, 10)
      const from = mondayOf(anchor)
      const to = plusDays(from, 6)
      const { sessions, sets } = await sessionsBetween(from, to)
      const volume: Record<string, number> = { chest: 0, back: 0, shoulders: 0, arms: 0, legs: 0, core: 0 }
      let tonnage = 0
      let workSets = 0
      for (const s of sets) {
        if (s.type === 'warmup') continue
        workSets++
        tonnage += Number(s.weight_kg) * (s.reps as number)
        for (const g of new Set((s.primary_muscles as string[]).map((m) => MUSCLE_GROUP[m]).filter(Boolean))) volume[g] += 1
      }
      const [planned] = await sql`select count(*)::int as n from public.calendar_events
        where user_id = ${userId} and deleted_at is null and type = 'gym' and date between ${from} and ${to}`
      const football = await sql`select date, duration_min, intensity from public.calendar_events
        where user_id = ${userId} and deleted_at is null and type = 'football' and date between ${from} and ${to} order by date`
      const [ready] = await sql`select round(avg(score))::int as avg, count(*)::int as n from public.readiness_checkins
        where user_id = ${userId} and deleted_at is null and date between ${from} and ${to}`
      const [weight] = await sql`select round(avg(weight_kg), 1) as avg from public.body_metrics
        where user_id = ${userId} and deleted_at is null and weight_kg is not null and date between ${from} and ${to}`
      const food = await sql`select date, sum(kcal)::int as kcal, sum(protein_g)::int as protein from public.nutrition_entries
        where user_id = ${userId} and deleted_at is null and date between ${from} and ${to} group by date`
      const prs = await sql`select e.name_ru, pr.kind, pr.value from public.personal_records pr join public.exercises e on e.id = pr.exercise_id
        where pr.user_id = ${userId} and pr.deleted_at is null and pr.achieved_at::date between ${from} and ${to}`
      return {
        week_start: from, week_end: to,
        gym_sessions: { done: sessions.filter((s) => s.status === 'finished').length, planned: planned.n },
        work_sets: workSets, tonnage_kg: Math.round(tonnage),
        volume_sets_by_group: volume,
        football: football.map((f) => ({ date: day(f.date), duration_min: f.duration_min, intensity_1_10: f.intensity, load: (f.duration_min as number ?? 0) * (f.intensity as number ?? 0) })),
        readiness: { avg_score_0_100: ready.avg, checkins: ready.n },
        weight_avg_kg: num(weight?.avg),
        nutrition_avg: food.length ? { kcal: Math.round(food.reduce((a, f) => a + (f.kcal as number), 0) / food.length), protein_g: Math.round(food.reduce((a, f) => a + (f.protein as number), 0) / food.length), days_logged: food.length } : null,
        records: prs.map((p) => ({ exercise: p.name_ru, kind: p.kind, value: num(p.value) })),
        difficulty_avg_1_10: sessions.length ? Math.round((sessions.reduce((a, s) => a + ((s.difficulty as number) ?? 0), 0) / sessions.length) * 10) / 10 : null,
      }
    },

    async get_body_metrics(args: { from?: unknown; to?: unknown }) {
      const r = range(args.from, args.to)
      const rows = await sql`select date, weight_kg, chest_cm, waist_cm, hips_cm, biceps_cm, thigh_cm, neck_cm from public.body_metrics
        where user_id = ${userId} and deleted_at is null and date between ${r.from} and ${r.to} order by date`
      return rows.map((b) => Object.fromEntries(Object.entries({ ...b, date: day(b.date) }).filter(([, v]) => v !== null).map(([k, v]) => [k, k === 'date' ? v : num(v)])))
    },

    async get_nutrition_summary(args: { from?: unknown; to?: unknown }) {
      const r = range(args.from, args.to)
      const days = await sql`select date, sum(kcal)::int as kcal, sum(protein_g)::int as protein_g, count(*)::int as entries
        from public.nutrition_entries where user_id = ${userId} and deleted_at is null and date between ${r.from} and ${r.to}
        group by date order by date`
      const [p] = await sql`select kcal_target, protein_target from public.profiles where id = ${userId}`
      const n = days.length
      return {
        targets: { kcal: p?.kcal_target, protein_g: p?.protein_target },
        avg_logged_days: n ? { kcal: Math.round(days.reduce((a, d) => a + (d.kcal as number), 0) / n), protein_g: Math.round(days.reduce((a, d) => a + (d.protein_g as number), 0) / n) } : null,
        days_logged: n,
        days: days.map((d) => ({ date: day(d.date), kcal: d.kcal, protein_g: d.protein_g })),
      }
    },

    async get_readiness(args: { from?: unknown; to?: unknown }) {
      const r = range(args.from, args.to)
      const rows = await sql`select date, score, flag, sleep_hours, energy, soreness, stress from public.readiness_checkins
        where user_id = ${userId} and deleted_at is null and date between ${r.from} and ${r.to} order by date`
      return {
        formula: '75 + сон + энергия − боль − стресс − футбол за 72 ч; зелёный ≥ 75, жёлтый 50–74, красный < 50; шкалы 1–5',
        days: rows.map((x) => ({ date: day(x.date), score_0_100: x.score, flag: x.flag, sleep_h: num(x.sleep_hours), energy_1_5: x.energy, soreness_1_5: x.soreness, stress_1_5: x.stress })),
      }
    },

    async propose_program_change(args: unknown) {
      const { proposal, errors } = validateStructure(args)
      if (!proposal) throw new ToolError(`Правка не принята:\n${errors.join('\n')}`)
      const p = await activeProgram()
      if (!p) throw new ToolError('У пользователя нет активной программы — менять нечего.')
      const snap = await programSnapshot(p.id as string)
      const problems: string[] = []
      for (const [i, c] of proposal.changes.entries()) {
        if (findDay(snap, c.day) < 0) problems.push(`changes[${i}].day: нет дня «${c.day}», дней ${snap.days.length}.`)
        for (const ref of [('exercise' in c ? c.exercise : null), (c.op === 'replace_exercise' ? c.with : null)]) {
          if (ref && !(await resolveExercise(ref))) problems.push(`changes[${i}]: упражнение «${ref}» не найдено, возьми exercise_id из get_program или справочника.`)
        }
      }
      if (problems.length) throw new ToolError(`Правка не принята:\n${problems.join('\n')}`)
      const payload: Proposal = proposal
      const [row] = await sql`insert into public.program_change_proposals (user_id, source, title, rationale, payload, status)
        values (${userId}, 'coach', ${payload.title}, ${payload.rationale}, ${JSON.stringify(payload)}::jsonb, 'pending') returning id`
      return {
        proposal_id: row.id, status: 'pending', applies_to_program_version: p.version,
        message: 'Черновик сохранён. Программа изменится, только когда пользователь примет правку в приложении.',
      }
    },

    async add_coach_note(args: { text?: unknown; tags?: unknown }) {
      if (typeof args.text !== 'string' || !args.text.trim()) throw new ToolError('text: текст заметки обязателен.')
      if (args.text.length > 4000) throw new ToolError('text: не длиннее 4000 символов.')
      const tags = Array.isArray(args.tags) ? args.tags.filter((t) => typeof t === 'string').slice(0, 10) : []
      const [row] = await sql`insert into public.coach_notes (user_id, author, text, tags)
        values (${userId}, 'coach', ${args.text.trim()}, ${tags}) returning id, created_at`
      return { note_id: row.id, created_at: iso(row.created_at) }
    },

    async get_coach_notes(args: { limit?: unknown }) {
      const limit = Math.min(100, Math.max(1, Number(args.limit ?? 20)))
      const rows = await sql`select created_at, author, text, tags from public.coach_notes
        where user_id = ${userId} and deleted_at is null order by created_at desc limit ${limit}`
      return rows.map((n) => ({ date: iso(n.created_at)!.slice(0, 10), author: n.author, text: n.text, tags: n.tags }))
    },
  }
}

export type CoachData = ReturnType<typeof coachData>
