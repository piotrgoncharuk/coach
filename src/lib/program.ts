import { db } from './db'
import { save } from './repo'
import { alive } from './workout'
import { buildStarterProgram, localDate, type Limitation, type PlanDay, type ProgramSnapshot } from '../domain'
import type { Program } from './models'

export async function activeProgram(): Promise<Program | null> {
  const all = alive(await db.programs.toArray())
  return all.find((p) => p.isActive) ?? null
}

/** Прочитать версию программы как снимок. Упражнения — по UUID. */
export async function loadSnapshot(programId: string): Promise<ProgramSnapshot | null> {
  const program = await db.programs.get(programId)
  if (!program) return null
  const days = alive(await db.programDays.where('programId').equals(programId).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
  const out: PlanDay[] = []
  for (const d of days) {
    const ex = alive(await db.programExercises.where('programDayId').equals(d.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
    out.push({
      name: d.name, focus: d.focus, heavyLegs: d.heavyLegs,
      exercises: ex.map((e) => ({
        exercise: e.exerciseId, sets: e.targetSets, repMin: e.repMin, repMax: e.repMax, rir: e.targetRir,
        restSec: e.restSec, cautious: e.cautious, incrementKg: e.incrementKg, supersetGroup: e.supersetGroup, notes: e.notes,
      })),
    })
  }
  return { name: program.name, notes: program.notes, days: out }
}

/** slug из открытой базы → UUID упражнения в локальной базе. */
export async function resolveExercises(snapshot: ProgramSnapshot): Promise<{ snapshot: ProgramSnapshot; missing: string[] }> {
  const missing: string[] = []
  const copy: ProgramSnapshot = structuredClone(snapshot)
  for (const day of copy.days) {
    for (const e of day.exercises) {
      if (await db.exercises.get(e.exercise)) continue
      const bySlug = await db.exercises.where('slug').equals(e.exercise).first()
      if (bySlug) e.exercise = bySlug.id
      else missing.push(e.exercise)
    }
    day.exercises = day.exercises.filter((e) => !missing.includes(e.exercise))
  }
  return { snapshot: copy, missing }
}

/**
 * Сохранить снимок новой версией: прежняя остаётся в истории неактивной.
 * Запланированные в календаре будущие тренировки переезжают на дни новой
 * версии по порядку (A → A, B → B).
 */
export async function saveVersion(snapshot: ProgramSnapshot, parentId: string | null = null): Promise<Program> {
  const { snapshot: resolved } = await resolveExercises(snapshot)
  const all = alive(await db.programs.toArray())
  const prev = all.find((p) => p.isActive) ?? null
  const version = all.length ? Math.max(...all.map((p) => p.version)) + 1 : 1

  const program = await save('programs', {
    name: resolved.name, version, parentId: parentId ?? prev?.id ?? null, isActive: true, notes: resolved.notes ?? null,
  })
  const newDayIds: string[] = []
  for (const [i, d] of resolved.days.entries()) {
    const day = await save('programDays', { programId: program.id, orderIndex: i, name: d.name, focus: d.focus ?? null, heavyLegs: d.heavyLegs })
    newDayIds.push(day.id)
    for (const [j, e] of d.exercises.entries()) {
      await save('programExercises', {
        programDayId: day.id, exerciseId: e.exercise, orderIndex: j, targetSets: e.sets, repMin: e.repMin, repMax: e.repMax,
        targetRir: e.rir, restSec: e.restSec, incrementKg: e.incrementKg ?? null, cautious: e.cautious ?? false,
        supersetGroup: e.supersetGroup ?? null, notes: e.notes ?? null,
      })
    }
  }

  for (const p of all.filter((p) => p.isActive)) await save('programs', { id: p.id, isActive: false })

  if (prev) {
    const oldDays = alive(await db.programDays.where('programId').equals(prev.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
    const today = localDate()
    const future = alive(await db.calendarEvents.toArray()).filter((e) => e.type === 'gym' && e.status === 'planned' && e.date >= today && e.programDayId)
    for (const ev of future) {
      const idx = oldDays.findIndex((d) => d.id === ev.programDayId)
      if (idx >= 0) await save('calendarEvents', { id: ev.id, programDayId: newDayIds[idx % Math.max(1, newDayIds.length)] ?? null })
    }
  }
  return program
}

export async function createStarterProgram(limitations: Limitation[]): Promise<Program> {
  return saveVersion(buildStarterProgram(limitations), null)
}

export async function listVersions(): Promise<Program[]> {
  return alive(await db.programs.toArray()).sort((a, b) => b.version - a.version)
}

/** Откат: новая версия из старого снимка. Ничего не удаляется. */
export async function rollbackTo(programId: string): Promise<Program> {
  const snap = await loadSnapshot(programId)
  if (!snap) throw new Error('Версия не найдена')
  return saveVersion(snap, programId)
}
