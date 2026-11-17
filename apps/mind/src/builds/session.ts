import { readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import { type BudgetCall, type BudgetLedger, type Project, type ProjectSession } from '@forkling/schema'
import { cutAtWord } from '@forkling/sim'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, sessionPoints, type ModelId, type Usage } from '../budget.ts'
import { IMAGE_TOKENS } from '../llm.ts'
import { buildSessionSystem, buildSessionUser } from '../prompts/session.ts'
import type { GitRunner } from '../tick/git.ts'
import { checkWrite, listProjectFiles, resolveProjectPath } from './project-files.ts'
import { addSession, endProject, projectDir, writeProject } from './projects.ts'
import { withPolicy } from './sandbox.ts'
import { runInSandbox, type Sandbox, type SandboxRun } from './sandbox-run.ts'
import { projectStaticCheck } from './work-check.ts'

/**
 * A build session (spec-v4 3.3): one agent loop on Sonnet 5.5 over one project, with seven tools that are all engine code. The
 * model writes the project's files, runs them in the sandbox, looks at the screenshot and finishes when it likes. The engine
 * only stops it at the safety limits (25 turns, $1.50, the points in hand, 90 minutes), meters it (1 point per $0.001, every turn
 * through the budget guard and booked as `session`), and keeps whatever state it ends in. No web text and no visitor notes go
 * in: the tools read nothing but the project's own files.
 */

export const SESSION_MODEL: ModelId = 'claude-sonnet-5-5'
/** Spec-v4 3.3: the safety stop, and the points a session needs in hand to start. */
export const SESSION_LIMITS = { turns: 25, usd: 1.5, minutes: 90, startPoints: 300 } as const
/** The most one turn may write: room for a whole file of code. */
const TURN_MAX_TOKENS = 8_000
/** A file read back to the model is cut here, so a session's prompt stays far under 100K tokens. */
const READ_MAX_CHARS = 40_000
/** The prompt may not pass this; past it the session stops, as at a limit. */
const PROMPT_STOP_TOKENS = MAX_PROMPT_TOKENS - TURN_MAX_TOKENS - 2_000
/** The newest this many screenshots stay in the working tree (older ones stay in git). */
export const SHOTS_KEPT = 60

// ---------------------------------------------------------------------------------------------------------------------------
// The model, as a session sees it: one turn of a conversation with tools. Tool choice is left to the model (no forced tool
// choice, no prefill). Its blocks are passed back as they came, thinking included.

export type SessionBlock = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown } | { type: string; [key: string]: unknown }
export interface SessionMessage {
  role: 'user' | 'assistant'
  content: unknown[]
}
export interface SessionTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}
export interface SessionTurnRequest {
  model: ModelId
  system: string
  messages: readonly SessionMessage[]
  tools: readonly SessionTool[]
  maxTokens: number
}
export interface SessionTurnResult {
  content: SessionBlock[]
  stopReason: string | null
  usage: Usage
}
export interface SessionModel {
  turn(request: SessionTurnRequest): Promise<SessionTurnResult>
}

/** The real model. The system part and the conversation so far are cached, so each turn pays mostly for what is new. */
export function anthropicSessionModel(client: Anthropic): SessionModel {
  return {
    async turn(r) {
      const messages = r.messages.map((m, i) => (i === r.messages.length - 1 ? withCacheMark(m) : m))
      const response = await client.messages.create({
        model: r.model,
        max_tokens: r.maxTokens,
        system: [{ type: 'text', text: r.system, cache_control: { type: 'ephemeral' } }],
        messages: messages as Anthropic.MessageParam[],
        tools: r.tools as Anthropic.Tool[],
        output_config: { effort: 'medium' },
      } as Anthropic.MessageCreateParamsNonStreaming)
      const u = response.usage
      return {
        content: response.content as unknown as SessionBlock[],
        stopReason: response.stop_reason,
        usage: { input: u.input_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, output: u.output_tokens },
      }
    },
  }
}

/** The last block of a message carries the cache mark, so the next turn reads the conversation so far from the cache. */
function withCacheMark(m: SessionMessage): SessionMessage {
  const content = [...m.content]
  const last = content[content.length - 1]
  if (last && typeof last === 'object') content[content.length - 1] = { ...(last as object), cache_control: { type: 'ephemeral' } }
  return { ...m, content }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The tools.

const NoInput = z.object({}).strict()
const PathInput = z.object({ path: z.string().min(1).max(200) }).strict()
const WriteInput = z.object({ path: z.string().min(1).max(200), content: z.string() }).strict()
export const FinishInput = z
  .object({
    caption: z.string().min(1).max(400),
    outcome: z.enum(['continue', 'done', 'abandon']),
    reason: z.string().max(400).nullable().optional(),
    aim: z.string().max(400).nullable().optional(),
  })
  .strict()
export type FinishInput = z.infer<typeof FinishInput>

const json = (schema: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, ...schema })
export const SESSION_TOOLS: readonly SessionTool[] = [
  { name: 'list_files', description: "List the files in the project's src/ folder, with their sizes.", input_schema: json({ properties: {} }) },
  { name: 'read_file', description: 'Read one file of src/. Long files are cut.', input_schema: json({ properties: { path: { type: 'string', description: 'Path inside src/, like index.html or js/main.js.' } }, required: ['path'] }) },
  {
    name: 'write_file',
    description: 'Write one file of src/, whole (it replaces the file if there is one). Refused with the reason if it breaks a limit.',
    input_schema: json({ properties: { path: { type: 'string', description: 'Path inside src/.' }, content: { type: 'string', description: 'The whole file.' } }, required: ['path', 'content'] }),
  },
  { name: 'delete_file', description: 'Delete one file of src/.', input_schema: json({ properties: { path: { type: 'string' } }, required: ['path'] }) },
  { name: 'run', description: 'Open src/index.html in the sandboxed browser for 5 seconds. Gives back uncaught errors, console errors (up to 20 lines) and a screenshot.', input_schema: json({ properties: {} }) },
  { name: 'look', description: 'See the latest screenshot again.', input_schema: json({ properties: {} }) },
  {
    name: 'finish',
    description: 'End the session: a caption of what changed (up to 140 characters), and continue, done or abandon (done and abandon with a reason of up to 140 characters). Optionally a new aim (up to 140 characters).',
    input_schema: json({
      properties: {
        caption: { type: 'string' },
        outcome: { type: 'string', enum: ['continue', 'done', 'abandon'] },
        reason: { type: ['string', 'null'] },
        aim: { type: ['string', 'null'] },
      },
      required: ['caption', 'outcome'],
    }),
  },
]

type ToolAnswer = { content: unknown[]; isError?: boolean }
const text = (t: string, isError = false): ToolAnswer => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) })
const image = (png: Buffer) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } })

/** A run, in plain words for the model. */
export function describeRun(r: SandboxRun): string {
  const lines = [
    r.unavailable ? `The page could not be run: ${r.errors.join('; ')}` : '',
    r.crashed ? 'The page crashed the browser (it may have used too much memory).' : '',
    r.timedOut ? 'The page never drew a frame: it may be stuck in a loop.' : '',
    !r.unavailable && !r.crashed && r.errors.length > 0 ? `Uncaught errors:\n${r.errors.map((e) => `- ${e}`).join('\n')}` : '',
    r.consoleErrors.length > 0 ? `Console errors:\n${r.consoleErrors.map((e) => `- ${e}`).join('\n')}` : '',
    r.outside.length > 0 ? `It tried to reach ${r.outside.join(', ')}, and a project has no network.` : '',
    r.libraryFailures.length > 0 ? `Libraries that did not load: ${r.libraryFailures.join(', ')}.` : '',
    r.blank ? 'The screenshot is a single colour.' : '',
  ].filter(Boolean)
  if (lines.length === 0) lines.push('It ran with no errors.')
  lines.push(r.screenshotPng ? 'The screenshot follows.' : 'There is no screenshot.')
  return lines.join('\n')
}

/** Whether the last run shows the project broken (spec-v4 3.3: an uncaught error or a blank screen, or no picture at all). */
export const isBroken = (r: SandboxRun | null) => !r || !!r.unavailable || r.crashed || r.timedOut || !r.loaded || r.errors.length > 0 || r.blank || !r.screenshotPng

// ---------------------------------------------------------------------------------------------------------------------------
// The session.

export type SessionStop = 'finish' | 'turns' | 'usd' | 'points' | 'time' | 'size' | 'budget' | 'model' | 'quiet'

export interface SessionDeps {
  world: string
  project: Project
  /** The plan step's reason: Merge's own words. */
  reason: string
  seed: string
  page?: string | undefined
  model: SessionModel
  sandbox: Sandbox
  /** On the server a session runs only in the sandbox unit (spec-v4 step 3): an unsandboxed sandbox refuses to start it. */
  requireSandbox: boolean
  /** The ledger now, for the budget guard. */
  ledger: () => BudgetLedger
  /** Books one call in the ledger (kind `session`). */
  book: (call: BudgetCall) => void
  pointsInHand: number
  now: () => number
  limits?: Partial<typeof SESSION_LIMITS>
}

export interface SessionOutcome {
  /** Set when the session never started, with the reason. Nothing was spent or written. */
  refused?: string
  project: Project
  stop: SessionStop
  usd: number
  points: number
  turns: number
  /** The session as it was saved. */
  session: ProjectSession | null
  /** What Merge is told afterwards, when it differs from what it asked (a done that did not pass its check). */
  told: string | null
}

const STOPPED: Record<Exclude<SessionStop, 'finish'>, string> = {
  turns: 'Stopped at the session limit.',
  usd: 'Stopped at the session limit.',
  points: 'Stopped: the points ran out.',
  time: 'Stopped at the session limit.',
  size: 'Stopped at the session limit.',
  budget: "Stopped: the month's budget is spent.",
  model: 'Stopped: the model call failed.',
  quiet: 'Stopped without a caption.',
}

const tokensOf = (system: string, messages: readonly SessionMessage[]) => {
  let images = 0
  const plain = JSON.stringify(messages, (key, value: unknown) => {
    if (key === 'source' && value && typeof value === 'object' && (value as { type?: string }).type === 'base64') {
      images++
      return null
    }
    return value
  })
  return estimateTokens(system) + estimateTokens(plain) + images * IMAGE_TOKENS
}

/** Runs one session to its end and saves the project. Never throws for what the model does. */
export async function runSession(d: SessionDeps): Promise<SessionOutcome> {
  const limits = { ...SESSION_LIMITS, ...d.limits }
  const refuse = (why: string): SessionOutcome => ({ refused: why, project: d.project, stop: 'finish', usd: 0, points: 0, turns: 0, session: null, told: null })
  if (d.requireSandbox && !d.sandbox.sandboxed) return refuse('the sandbox is missing on this server, so no session can run (/health says sandbox: missing)')
  if (d.project.status !== 'building') return refuse(`the project ${d.project.id} is ${d.project.status}`)
  if (d.pointsInHand < limits.startPoints) return refuse(`a build session needs ${limits.startPoints} points in hand, and there are ${d.pointsInHand}`)

  const dir = projectDir(d.world, d.project.id)
  const started = d.now()
  const system = buildSessionSystem({ seed: d.seed, page: d.page, limits: { turns: limits.turns, usd: limits.usd, minutes: limits.minutes } })
  const lastShot = latestShot(dir, d.project)
  let shot: Buffer | null = lastShot
  let lastRun: SandboxRun | null = null
  const user = buildSessionUser({ project: d.project, files: listProjectFiles(dir), reason: d.reason, hasShot: !!lastShot })
  const messages: SessionMessage[] = [{ role: 'user', content: [...(lastShot ? [image(lastShot)] : []), { type: 'text', text: user }] }]

  let usd = 0
  let turns = 0
  let finish: FinishInput | null = null
  let stop: SessionStop = 'finish'

  const run = async () => {
    lastRun = await runInSandbox(dir, d.sandbox, { id: d.project.id })
    if (lastRun.screenshotPng) shot = lastRun.screenshotPng
    return lastRun
  }

  const tool = async (name: string, input: unknown): Promise<ToolAnswer> => {
    switch (name) {
      case 'list_files': {
        if (!NoInput.safeParse(input ?? {}).success) return text('list_files takes no input', true)
        const files = listProjectFiles(dir)
        return text(files.length === 0 ? 'src/ is empty.' : files.map((f) => `${f.path} (${f.bytes} bytes)`).join('\n'))
      }
      case 'read_file': {
        const p = PathInput.safeParse(input)
        if (!p.success) return text('read_file needs a path', true)
        const r = resolveProjectPath(dir, p.data.path)
        if (!r.ok) return text(r.reason, true)
        let body: string
        try {
          body = readFileSync(r.abs, 'utf8')
        } catch {
          return text(`there is no file ${r.rel}`, true)
        }
        return text(body.length > READ_MAX_CHARS ? `${body.slice(0, READ_MAX_CHARS)}\n[cut: the file is ${body.length} characters]` : body)
      }
      case 'write_file': {
        const p = WriteInput.safeParse(input)
        if (!p.success) return text('write_file needs a path and the content', true)
        const r = resolveProjectPath(dir, p.data.path)
        if (!r.ok) return text(r.reason, true)
        const body = r.rel.endsWith('.html') ? withPolicy(p.data.content) : p.data.content
        const fits = checkWrite(listProjectFiles(dir), r.rel, Buffer.byteLength(body, 'utf8'))
        if (!fits.ok) return text(fits.reason, true)
        mkdirSync(join(r.abs, '..'), { recursive: true })
        writeFileSync(r.abs, body)
        return text(`wrote ${r.rel} (${Buffer.byteLength(body, 'utf8')} bytes)`)
      }
      case 'delete_file': {
        const p = PathInput.safeParse(input)
        if (!p.success) return text('delete_file needs a path', true)
        const r = resolveProjectPath(dir, p.data.path)
        if (!r.ok) return text(r.reason, true)
        if (!listProjectFiles(dir).some((f) => f.path === r.rel)) return text(`there is no file ${r.rel}`, true)
        rmSync(r.abs)
        return text(`deleted ${r.rel}`)
      }
      case 'run': {
        const r = await run()
        return { content: [{ type: 'text', text: describeRun(r) }, ...(r.screenshotPng ? [image(r.screenshotPng)] : [])] }
      }
      case 'look':
        return shot ? { content: [image(shot)] } : text('There is no screenshot yet: use run.')
      case 'finish': {
        const p = FinishInput.safeParse(input)
        if (!p.success) return text('finish needs a caption and an outcome (continue, done or abandon)', true)
        if (p.data.outcome !== 'continue' && !p.data.reason?.trim()) return text(`${p.data.outcome} needs a reason`, true)
        finish = p.data
        return text('The session ends here.')
      }
      default:
        return text(`there is no tool called ${name.slice(0, 40)}`, true)
    }
  }

  while (!finish) {
    if (turns >= limits.turns) stop = 'turns'
    else if (d.now() - started >= limits.minutes * 60_000) stop = 'time'
    else {
      const tokens = tokensOf(system, messages)
      const estimate = estimateCallUsd(SESSION_MODEL, tokens, TURN_MAX_TOKENS)
      if (tokens > PROMPT_STOP_TOKENS) stop = 'size'
      else if (usd + estimate > limits.usd + 1e-9) stop = 'usd'
      else if (sessionPoints(usd + estimate) > d.pointsInHand) stop = 'points'
      else if (!canSpend(d.ledger(), estimate)) stop = 'budget'
    }
    if (stop !== 'finish') break

    let answer: SessionTurnResult
    try {
      answer = await d.model.turn({ model: SESSION_MODEL, system, messages, tools: SESSION_TOOLS, maxTokens: TURN_MAX_TOKENS })
    } catch {
      stop = 'model'
      break
    }
    turns++
    const cost = costUsd(SESSION_MODEL, answer.usage)
    usd += cost
    d.book({ at: new Date(d.now()).toISOString(), kind: 'session', model: SESSION_MODEL, ...answer.usage, usd: cost })
    messages.push({ role: 'assistant', content: answer.content })

    const uses = answer.content.filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use' && typeof (b as { id?: unknown }).id === 'string')
    if (uses.length === 0) {
      stop = 'quiet'
      break
    }
    const results: unknown[] = []
    for (const use of uses) {
      const r = await tool(use.name, use.input)
      results.push({ type: 'tool_result', tool_use_id: use.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })
    }
    messages.push({ role: 'user', content: results })
  }

  // The engine runs it once more and keeps the state it is in, broken or not.
  const final = await run()
  const broken = isBroken(final)
  const at = new Date(d.now()).toISOString()
  const shotPath = final.screenshotPng ? saveShot(dir, d.project, final.screenshotPng) : null

  let project = d.project
  let told: string | null = null
  let caption: string
  let engine = false
  const done = finish as FinishInput | null
  if (done) {
    caption = cutAtWord(done.caption.trim(), 140)
    if (broken && !/broken/i.test(caption)) caption = `${cutAtWord(caption, 140 - 20)} (it is broken now)`
    if (done.aim?.trim()) project = { ...project, aim: cutAtWord(done.aim.trim(), 140) }
    if (done.outcome === 'abandon') project = endProject(project, 'abandoned', done.reason ?? '')
    else if (done.outcome === 'done') {
      const check = projectStaticCheck(readTextFiles(dir))
      const reasons = [...check.reasons, ...(broken ? [describeRun(final).split('\n')[0]!] : [])]
      if (reasons.length === 0) project = endProject(project, 'done', done.reason ?? '')
      else told = `${project.name} is not done yet: it did not pass the work check (${reasons.slice(0, 3).join('; ')}). It stays a project you are building.`
    }
  } else {
    stop = stop === 'finish' ? 'quiet' : stop
    caption = STOPPED[stop as Exclude<SessionStop, 'finish'>]
    if (broken) caption = `${caption} The last run was broken.`
    engine = true
  }
  const session: ProjectSession = { at, caption, usd: Math.round(usd * 1e6) / 1e6, turns, shot: shotPath, broken: broken || told !== null, engine }
  project = addSession(project, session)
  writeProject(d.world, project)
  return { project, stop: done ? 'finish' : stop, usd, points: sessionPoints(usd), turns, session, told }
}

/** The files of src/ that a check reads as text. */
function readTextFiles(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const f of listProjectFiles(dir)) {
    const r = resolveProjectPath(dir, f.path)
    if (r.ok) out.set(r.rel, readFileSync(r.abs, 'utf8'))
  }
  return out
}

/** The screenshot of the latest session, if it is still on disk. */
function latestShot(dir: string, project: Project): Buffer | null {
  const last = [...project.sessions].reverse().find((s) => s.shot)
  if (!last?.shot) return null
  try {
    return readFileSync(join(dir, last.shot))
  } catch {
    return null
  }
}

/** Saves `shots/<n>.png` (n one past the highest there is) and keeps only the newest `SHOTS_KEPT` in the working tree. */
function saveShot(dir: string, project: Project, png: Buffer): string {
  const shots = join(dir, 'shots')
  mkdirSync(shots, { recursive: true })
  const numbers = (() => {
    try {
      return readdirSync(shots).flatMap((f) => (/^\d+\.png$/.test(f) ? [Number(f.slice(0, -4))] : []))
    } catch {
      return []
    }
  })()
  const recorded = project.sessions.flatMap((s) => (s.shot ? [Number(s.shot.slice(6, -4))] : []))
  const n = Math.max(0, ...numbers, ...recorded) + 1
  writeFileSync(join(shots, `${n}.png`), png)
  const kept = [...numbers, n].sort((a, b) => b - a)
  for (const old of kept.slice(SHOTS_KEPT)) rmSync(join(shots, `${old}.png`), { force: true })
  return `shots/${n}.png`
}

/** The one commit a session ends in (spec-v4 3.3): `projects/<id>/` and nothing else. The loop's next push sends it. */
export async function commitSession(git: GitRunner, id: string, caption: string): Promise<boolean> {
  const path = `projects/${id}`
  if ((await git(['add', '-A', '--', path])).code !== 0) return false
  if ((await git(['diff', '--cached', '--quiet', '--', path])).code === 0) return false
  return (await git(['commit', '-q', '-m', `project: ${id}: ${caption.slice(0, 72)}`, '--', path])).code === 0
}
