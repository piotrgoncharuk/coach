import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { save, setCurrentUserId } from './repo'
import { createStarterProgram, listVersions, loadSnapshot, activeProgram } from './program'
import { acceptProposal, coachSummary, createManualProposal, createToken, pendingProposals, previewProposal, rejectProposal, sha256Hex } from './coach'
import { buildStarterProgram } from '../domain'
import { alive } from './workout'

const USER = '11111111-1111-1111-1111-111111111111'

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await Promise.all(db.tables.map((t) => t.clear()))
  await setCurrentUserId(USER)
  const slugs = [...new Set([...buildStarterProgram().days.flatMap((d) => d.exercises.map((e) => e.exercise)), 'Front_Barbell_Squat', 'Plank'])]
  for (const slug of slugs) {
    await db.exercises.put({
      id: `uuid-${slug}`, slug, nameRu: slug === 'Plank' ? 'Планка' : slug, nameEn: slug.replace(/_/g, ' '), primaryMuscles: ['quadriceps'], secondaryMuscles: [],
      equipment: 'barbell', level: null, force: null, mechanic: null, category: 'strength', instructionsRu: [], instructionsEn: [], cuesRu: [], mistakesRu: [],
      imageStart: null, imageEnd: null, youtubeUrl: null, defaultRestSec: 120, cautiousDefault: false, isCustom: false, ownerId: null, updatedAt: '1970-01-01T00:00:00Z', deletedAt: null,
    })
  }
  await createStarterProgram([])
})

const PROPOSAL = {
  title: 'Фронтальный присед вместо классики',
  rationale: 'Поясница ноет',
  changes: [
    { op: 'replace_exercise', day: 1, exercise: 'Barbell_Squat', with: 'Front_Barbell_Squat' },
    { op: 'add_exercise', day: 'День C', exercise: 'Планка', sets: 3, rep_min: 30, rep_max: 45, rir: 2 },
  ],
}

describe('правки тренера в приложении', () => {
  it('вставленная правка (даже в ```json```) встаёт во входящие с «было/стало»', async () => {
    const { row, errors } = await createManualProposal('```json\n' + JSON.stringify(PROPOSAL) + '\n```')
    expect(errors).toEqual([])
    expect((await pendingProposals()).map((p) => p.id)).toEqual([row!.id])
    const view = await previewProposal(row!)
    expect(view.diff).toContainEqual(expect.objectContaining({ kind: 'removed', exercise: 'Barbell_Squat' }))
    expect(view.diff).toContainEqual(expect.objectContaining({ kind: 'added', exercise: 'Front_Barbell_Squat', day: 'День A' }))
    expect(view.diff).toContainEqual(expect.objectContaining({ kind: 'added', exercise: 'Планка', day: 'День C' }))
  })

  it('принятие создаёт новую версию программы, прежняя доступна для отката', async () => {
    const { row } = await createManualProposal(JSON.stringify(PROPOSAL))
    await acceptProposal(row!)
    const versions = await listVersions()
    expect(versions.map((v) => v.version)).toEqual([2, 1])
    const snap = (await loadSnapshot((await activeProgram())!.id))!
    expect(snap.days[0].exercises[0].exercise).toBe('uuid-Front_Barbell_Squat')
    expect(snap.notes).toContain('Правка тренера')
    expect((await db.proposals.get(row!.id))!.status).toBe('accepted')
    expect(await pendingProposals()).toEqual([])
  })

  it('отклонение не трогает программу', async () => {
    const { row } = await createManualProposal(JSON.stringify(PROPOSAL))
    await rejectProposal(row!)
    expect(await listVersions()).toHaveLength(1)
    expect((await db.proposals.get(row!.id))!.status).toBe('rejected')
  })

  it('битый ответ тренера — понятная ошибка, во входящие ничего не попадает', async () => {
    expect((await createManualProposal('Давай добавим планку')).errors[0]).toContain('не JSON')
    expect((await createManualProposal('{"title":"x","changes":[{"op":"drop_table","day":1}]}')).errors[0]).toContain('op')
    expect(await pendingProposals()).toEqual([])
  })

  it('правка, устаревшая после изменения программы, показывает причину и не применяется', async () => {
    const { row } = await createManualProposal(JSON.stringify({ title: 'x', changes: [{ op: 'remove_exercise', day: 1, exercise: 'Plank' }] }))
    const view = await previewProposal(row!)
    expect(view.errors[0]).toContain('нет упражнения «Plank»')
    await expect(acceptProposal(row!)).rejects.toThrow()
    expect(await listVersions()).toHaveLength(1)
  })
})

describe('токены и сводка', () => {
  it('токен показывается один раз, в базе только хэш и префикс', async () => {
    const token = await createToken('Grok')
    expect(token).toMatch(/^cch_[A-Za-z0-9_-]{43}$/)
    const [row] = alive(await db.apiTokens.toArray())
    expect(row.tokenHash).toBe(await sha256Hex(token))
    expect(row.prefix).toBe(token.slice(0, 10))
    expect(JSON.stringify(row)).not.toContain(token)
  })

  it('сводка за 7 дней собирается из локальных данных и ссылается на упражнения по slug', async () => {
    await db.profiles.put({ id: USER, displayName: 'Пётр', heightCm: 193, birthDate: null, kcalTarget: 3000, proteinTarget: 190, weightGoalKg: null, weightRateKgWeek: null, theme: 'dark', restSecDefault: 120, limitations: ['hamstring'], onboardedAt: 'x', gymWeekdays: [2, 4, 6], footballWeekdays: [0], deloadStart: null, updatedAt: 'x' })
    await save('readinessCheckins', { date: new Date().toISOString().slice(0, 10), sleepHours: 8, energy: 4, soreness: 2, stress: 2, score: 90, flag: 'green' })
    const t = await coachSummary(7)
    expect(t).toContain('Пётр, рост 193 см')
    expect(t).toContain('[Barbell_Squat]')
    expect(t).not.toMatch(/\[uuid-/)
  })
})
