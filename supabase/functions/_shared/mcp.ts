/**
 * MCP-сервер Coach: JSON-RPC 2.0 поверх Streamable HTTP (спецификация MCP
 * 2025-06-18). Сервер без состояния: каждый POST — один запрос, ответ —
 * application/json. Потоковые ответы и серверные уведомления не нужны.
 *
 * Тренер (Grok) читает данные и пишет только две вещи: черновик правки
 * программы и свою заметку. Менять или удалять записи пользователя он не может —
 * таких инструментов просто нет.
 */
import { PROPOSAL_SCHEMA } from './proposal.ts'
import { ToolError, type CoachData } from './coachData.ts'

export const SERVER_INFO = { name: 'coach', title: 'Coach — дневник тренировок', version: '1.0.0' }
export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

const RANGE = {
  type: 'object',
  required: ['from', 'to'],
  properties: {
    from: { type: 'string', format: 'date', description: 'YYYY-MM-DD включительно' },
    to: { type: 'string', format: 'date', description: 'YYYY-MM-DD включительно' },
  },
}

const READ = { readOnlyHint: true, openWorldHint: false }

export const TOOLS = [
  { name: 'get_profile', title: 'Профиль', description: 'Рост, ограничения здоровья, цели питания, шаблон недели (дни зала и футбола), последний вес, правила планировщика.', inputSchema: { type: 'object', properties: {} }, annotations: READ },
  { name: 'get_program', title: 'Программа', description: 'Активная программа: дни, упражнения (exercise_id, slug, название), подходы, диапазон повторов, RIR, отдых, осторожный режим.', inputSchema: { type: 'object', properties: {} }, annotations: READ },
  { name: 'get_calendar', title: 'Календарь', description: 'Зал, футбол (минуты, тяжесть 1–10) и отдых по датам.', inputSchema: RANGE, annotations: READ },
  { name: 'get_sessions', title: 'Тренировки', description: 'Проведённые тренировки: упражнения, подходы (вес кг, повторы, RIR, тип, расчётный 1ПМ), длительность, сложность 1–10.', inputSchema: RANGE, annotations: READ },
  { name: 'get_exercise_history', title: 'История упражнения', description: 'Подходы по упражнению по датам, лучший расчётный 1ПМ за день, рекорды.', inputSchema: { type: 'object', required: ['exercise_id'], properties: { exercise_id: { type: 'string', description: 'UUID, slug или название' }, limit: { type: 'integer', minimum: 1, maximum: 50 } } }, annotations: READ },
  { name: 'get_weekly_summary', title: 'Сводка недели', description: 'Неделя с понедельника: тренировки (сделано/запланировано), рабочие подходы, тоннаж, объём по группам мышц, футбол, готовность, вес, питание, рекорды.', inputSchema: { type: 'object', properties: { week: { type: 'string', format: 'date', description: 'Любая дата недели; по умолчанию текущая' } } }, annotations: READ },
  { name: 'get_body_metrics', title: 'Вес и замеры', description: 'Вес (кг) и обхваты (см) по датам.', inputSchema: RANGE, annotations: READ },
  { name: 'get_nutrition_summary', title: 'Питание', description: 'Калории и белок по дням, среднее по дням с записями, цели.', inputSchema: RANGE, annotations: READ },
  { name: 'get_readiness', title: 'Готовность', description: 'Утренние чек-ины: сон, энергия, боль, стресс (1–5) и балл готовности 0–100 с формулой.', inputSchema: RANGE, annotations: READ },
  { name: 'propose_program_change', title: 'Предложить правку программы', description: 'Создаёт ЧЕРНОВИК правки. Программа не меняется, пока пользователь не примет правку в приложении, где он видит «было/стало». Ссылки на упражнения — exercise_id из get_program.', inputSchema: PROPOSAL_SCHEMA, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'add_coach_note', title: 'Записать заметку тренера', description: 'Долговременная память тренера: наблюдения, договорённости, планы. Видна пользователю на главном экране.', inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string', maxLength: 4000 }, tags: { type: 'array', items: { type: 'string' }, maxItems: 10 } } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: 'get_coach_notes', title: 'Заметки тренера', description: 'Прошлые заметки, новые сверху.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } } }, annotations: READ },
] as const

type ToolName = (typeof TOOLS)[number]['name']

const INSTRUCTIONS = [
  'Ты — персональный тренер. Пользователь тренируется в зале 3 раза в неделю (сила и масса, всё тело) и играет в футбол.',
  'Сначала читай get_profile и get_coach_notes — там ограничения и твоя память.',
  'Правки программы предлагай только через propose_program_change: это черновик, пользователь принимает его сам.',
  'Важное записывай add_coach_note. Единицы: кг, см, минуты; RIR — запас повторов 0–4.',
].join(' ')

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const ok = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result })
const fail = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** Обработать одно JSON-RPC сообщение. null — уведомление, ответа нет. */
export async function handleRpc(msg: unknown, data: CoachData): Promise<object | null> {
  const req = msg as JsonRpcRequest
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') return fail(req?.id, -32600, 'Invalid Request')
  const isNotification = req.id === undefined
  if (isNotification) return null

  switch (req.method) {
    case 'initialize': {
      const asked = String(req.params?.protocolVersion ?? '')
      return ok(req.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return ok(req.id, {})
    case 'tools/list':
      return ok(req.id, { tools: TOOLS })
    case 'tools/call': {
      const name = req.params?.name as ToolName
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>
      if (!TOOLS.some((t) => t.name === name)) return fail(req.id, -32602, `Unknown tool: ${String(name)}`)
      try {
        const result = await (data[name] as (a: Record<string, unknown>) => Promise<unknown>)(args)
        const structured = Array.isArray(result) ? { items: result } : (result as object)
        return ok(req.id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: structured, isError: false })
      } catch (e) {
        // ошибки инструмента — в результате, чтобы модель увидела причину и исправилась
        const message = e instanceof ToolError ? e.message : 'Внутренняя ошибка сервера.'
        if (!(e instanceof ToolError)) console.error(e)
        return ok(req.id, { content: [{ type: 'text', text: message }], isError: true })
      }
    }
    default:
      return fail(req.id, -32601, `Method not found: ${req.method}`)
  }
}

export interface HttpDeps {
  authenticate: (token: string) => Promise<string | null>
  data: (userId: string) => CoachData
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } })
}

/** HTTP-вход: авторизация личным токеном, один JSON-RPC запрос на POST. */
export async function handleHttp(req: Request, deps: HttpDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  // серверный поток уведомлений не поддерживаем: по спецификации на GET — 405
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST, OPTIONS', ...CORS } })

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  const userId = token ? await deps.authenticate(token) : null
  if (!userId) {
    return json(fail(null, -32001, 'Нужен действующий личный токен Coach: Authorization: Bearer cch_…'), 401, { 'WWW-Authenticate': 'Bearer realm="coach"' })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(fail(null, -32700, 'Parse error'), 400)
  }
  if (Array.isArray(body)) return json(fail(null, -32600, 'Пакетные запросы не поддерживаются'), 400)

  const res = await handleRpc(body, deps.data(userId))
  if (res === null) return new Response(null, { status: 202, headers: CORS })
  return json(res)
}
