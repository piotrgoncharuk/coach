import { db } from './db'
import { save, softDelete } from './repo'
import { alive } from './workout'
import { activeProgram, loadSnapshot, saveVersion } from './program'
import { loadAnalytics } from './analytics'
import { applyProposal, validateStructure, type Proposal } from '../../supabase/functions/_shared/proposal.ts'
import {
  addDays, buildCoachSummary, diffSnapshots, localDate, normalize, paceKgPerWeek, weekAverage, weeklyVolume,
  type DiffLine, type ProgramSnapshot,
} from '../domain'
import type { Proposal as ProposalRow } from './models'
import { supabase } from './supabase'

// ─── ссылки на упражнения ───────────────────────────────────────────────────
/** UUID, id открытой базы или название по-русски/по-английски → UUID. */
export async function exerciseResolver(): Promise<(ref: string) => string | null> {
  const all = (await db.exercises.toArray()).filter((e) => !e.deletedAt)
  const map = new Map<string, string>()
  for (const e of all) for (const k of [e.nameEn, e.nameRu, e.slug, e.id].filter(Boolean) as string[]) map.set(normalize(k), e.id)
  return (ref) => map.get(normalize(ref)) ?? null
}

// ─── правки программы ───────────────────────────────────────────────────────
export interface ProposalView {
  row: ProposalRow
  diff: DiffLine[]
  errors: string[]
  next: ProgramSnapshot | null
}

/** Черновик против ТЕКУЩЕЙ программы: diff и ошибки считаются в момент показа. */
export async function previewProposal(row: ProposalRow): Promise<ProposalView> {
  const { proposal, errors } = validateStructure(row.payload)
  const program = await activeProgram()
  const current = program ? await loadSnapshot(program.id) : null
  if (!proposal) return { row, diff: [], errors, next: null }
  if (!current) return { row, diff: [], errors: ['Активной программы нет — правку не к чему применить.'], next: null }
  const resolve = await exerciseResolver()
  const applied = applyProposal(current, proposal, resolve)
  if (!applied.snapshot) return { row, diff: [], errors: applied.errors, next: null }
  const names = new Map((await db.exercises.toArray()).map((e) => [e.id, e.nameRu]))
  return { row, diff: diffSnapshots(current, applied.snapshot as ProgramSnapshot, (id) => names.get(id) ?? id), errors: [], next: applied.snapshot as ProgramSnapshot }
}

export async function pendingProposals(): Promise<ProposalRow[]> {
  return alive(await db.proposals.toArray()).filter((p) => p.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Принять: новая версия программы из применённой правки. Откатиться можно в «Версиях». */
export async function acceptProposal(row: ProposalRow): Promise<void> {
  const view = await previewProposal(row)
  if (!view.next) throw new Error(view.errors.join(' '))
  await saveVersion({ ...view.next, notes: `Правка тренера: ${row.title}` })
  await save('proposals', { id: row.id, status: 'accepted', resolvedAt: new Date().toISOString() })
}

export async function rejectProposal(row: ProposalRow): Promise<void> {
  await save('proposals', { id: row.id, status: 'rejected', resolvedAt: new Date().toISOString() })
}

/** Запасной путь: правка, вставленная из чата с тренером. Ставится во входящие. */
export async function createManualProposal(text: string): Promise<{ row: ProposalRow | null; errors: string[] }> {
  let json: unknown
  try {
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return { row: null, errors: ['Это не JSON. Скопируй ответ тренера целиком, вместе с фигурными скобками.'] }
  }
  const { proposal, errors } = validateStructure(json)
  if (!proposal) return { row: null, errors }
  const row = await save('proposals', {
    source: 'manual', title: proposal.title, rationale: proposal.rationale, payload: proposal satisfies Proposal,
    diff: null, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null,
  })
  const preview = await previewProposal(row)
  return { row, errors: preview.errors }
}

// ─── заметки тренера ────────────────────────────────────────────────────────
export async function coachNotes(limit = 50) {
  return alive(await db.coachNotes.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
}

export async function archiveNote(id: string) {
  await softDelete('coachNotes', id)
}

// ─── токены для MCP ─────────────────────────────────────────────────────────
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Новый токен: показывается один раз, хранится только хэш. */
export async function createToken(name: string): Promise<string> {
  const token = `cch_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`
  await save('apiTokens', {
    name: name.trim() || 'Grok', tokenHash: await sha256Hex(token), prefix: token.slice(0, 10), scopes: ['read', 'propose'],
    lastUsedAt: null, revokedAt: null, createdAt: new Date().toISOString(),
  })
  return token
}

export async function revokeToken(id: string) {
  await save('apiTokens', { id, revokedAt: new Date().toISOString() })
}

export function mcpUrl(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  return supabase && url ? `${url.replace(/\/$/, '')}/functions/v1/mcp` : null
}

// ─── сводка для тренера ─────────────────────────────────────────────────────
export async function coachSummary(days: 7 | 28): Promise<string> {
  const to = localDate()
  const from = addDays(to, -(days - 1))
  const profile = await db.profiles.toCollection().first()
  const program = await activeProgram()
  const snapshot = program ? await loadSnapshot(program.id) : null
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
  const nameOf = (id: string) => exercises.get(id)?.nameRu ?? id

  const sessions = alive(await db.sessions.toArray()).filter((s) => s.status === 'finished' && s.date >= from && s.date <= to).sort((a, b) => a.date.localeCompare(b.date))
  const dayNames = new Map((await db.programDays.toArray()).map((d) => [d.id, d.name]))
  const summarySessions = []
  for (const s of sessions) {
    const ses = alive(await db.sessionExercises.where('sessionId').equals(s.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
    const exs = []
    for (const se of ses) {
      const sets = alive(await db.sets.where('sessionExerciseId').equals(se.id).toArray()).sort((a, b) => a.setIndex - b.setIndex)
      exs.push({ name: nameOf(se.exerciseId), sets: sets.map((x) => ({ weightKg: x.weightKg, reps: x.reps, rir: x.rir, type: x.type })) })
    }
    summarySessions.push({ date: s.date, dayName: s.programDayId ? (dayNames.get(s.programDayId) ?? null) : null, durationMin: Math.round((Date.parse(s.finishedAt ?? s.startedAt) - Date.parse(s.startedAt)) / 60000), difficulty: s.difficulty, note: s.note, exercises: exs })
  }

  const a = await loadAnalytics()
  const events = alive(await db.calendarEvents.toArray()).filter((e) => e.date >= from && e.date <= to)
  const weights = alive(await db.bodyMetrics.toArray()).filter((b) => b.weightKg != null).map((b) => ({ date: b.date, value: b.weightKg! }))
  const inRange = weights.filter((w) => w.date >= from)
  const food = alive(await db.nutritionEntries.toArray())
  const prs = alive(await db.personalRecords.toArray()).filter((r) => r.achievedAt.slice(0, 10) >= from)

  return buildCoachSummary({
    from, to,
    profile: {
      name: profile?.displayName ?? '', heightCm: profile?.heightCm ?? null, limitations: profile?.limitations ?? [],
      gymWeekdays: profile?.gymWeekdays ?? [], footballWeekdays: profile?.footballWeekdays ?? [],
      kcalTarget: profile?.kcalTarget ?? 0, proteinTarget: profile?.proteinTarget ?? 0,
    },
    program: snapshot && program ? { ...snapshot, version: program.version } : null,
    nameOf,
    refOf: (id) => exercises.get(id)?.slug ?? id,
    sessions: summarySessions,
    plannedGym: events.filter((e) => e.type === 'gym').length,
    volume: weeklyVolume(a.sets.filter((s) => s.date >= from && s.date <= to), a.muscles),
    football: events.filter((e) => e.type === 'football').map((e) => ({ date: e.date, durationMin: e.durationMin, intensity: e.intensity })),
    readiness: alive(await db.readinessCheckins.toArray()).filter((r) => r.date >= from).sort((x, y) => x.date.localeCompare(y.date)).map((r) => ({ date: r.date, score: r.score, flag: r.flag })),
    weight: { avgKg: inRange.length ? Math.round((inRange.reduce((s, w) => s + w.value, 0) / inRange.length) * 10) / 10 : null, paceKgWeek: paceKgPerWeek(weights) },
    nutrition: weekAverage(food, to, days),
    records: prs.map((r) => ({ exercise: nameOf(r.exerciseId), kind: r.kind, value: r.value })),
    notes: (await coachNotes(5)).map((n) => ({ date: n.createdAt.slice(0, 10), text: n.text })),
  })
}
