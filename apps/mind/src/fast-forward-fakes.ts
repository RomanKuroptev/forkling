import type { Sandbox, SandboxRun } from './builds/sandbox-run.ts'
import { emptyPageResult } from './builds/sandbox-runner.ts'
import type { SessionBlock, SessionModel } from './builds/session.ts'
import type { BatchOutcome, CallKind, LlmClient, LlmRequest } from './llm.ts'
import type { FetchImpl } from './web/fetch.ts'

/**
 * Stand-ins for the model and the web, for the fast-forward command's `--dry-run` smoke run and its tests. They cost nothing
 * and reach nothing. The model plans one sketch a day in the morning, makes the sketch when asked, has a different small
 * thought each time, and refuses everything else (a refusal is a failed call the mind already handles). It is not a voice:
 * a smoke run checks the plumbing, never what Merge would do. The audit harness can script the answer to any call kind
 * (`answers`) and reads back every prompt it was sent (`calls`); without a script it answers as above.
 */

const USAGE = { input: 800, cacheRead: 0, cacheWrite: 0, output: 300 }

const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })
const keep = { thought: 'Nothing to change.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }

const HTML = (n: number) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>sketch ${n}</title></head><body><canvas id="c" width="480" height="360"></canvas><script>const g=document.getElementById('c').getContext('2d');let t=0;function f(){t++;g.fillStyle='hsl('+((t+${n * 40})%360)+',60%,50%)';g.fillRect(0,0,480,360);requestAnimationFrame(f)}f()</script></body></html>`

const WORDS = [
  ['The lamp', 'A moth', 'My kettle', 'The harbour', 'Some fog', 'That door', 'One gull'],
  ['is on', 'went quiet', 'kept humming', 'waited', 'glowed', 'moved', 'shook'],
  ['again', 'tonight', 'by the shelf', 'at noon', 'in the corner', 'near the window', 'for now', 'after tea', 'once more', 'at dusk', 'at dawn'],
]
/** A different line every time, since a repeated thought is thrown away. */
const line = (n: number) => `${WORDS[0]![n % 7]} ${WORDS[1]![Math.floor(n / 7) % 7]} ${WORDS[2]![Math.floor(n / 49) % 11]} (${n}).`

/**
 * A scripted answer for one call kind (the audit harness's planted runs, QB): it gets the request and how many calls of that
 * kind there have been, this one included, and returns the parsed answer, or null for a refusal.
 */
export type FakeAnswer = (req: LlmRequest, n: number) => unknown
export type FakeAnswers = Partial<Record<CallKind, FakeAnswer>>

export function fakeModel(opts: { build?: boolean; answers?: FakeAnswers } = {}): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = []
  const perKind = new Map<CallKind, number>()
  let sketches = 0
  let thoughts = 0
  return {
    calls,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const n = (perKind.get(req.kind) ?? 0) + 1
      perKind.set(req.kind, n)
      let parsed: unknown = null
      const scripted = opts.answers?.[req.kind]
      if (scripted) parsed = scripted(req as LlmRequest, n)
      else if (req.kind === 'morning') {
        parsed = {
          thought: 'A small thing first.',
          longGoal: null,
          dropLongGoal: false,
          plan: [opts.build ? step('build', 'Colour clock', 45, 'I want to make a clock out of colour, a bit at a time.') : step('tinker', `a colour field ${sketches + 1}`, 45, 'I want to make a small thing to look at.', { size: 'sketch' }), step('rest', null, 30, 'Rest after.'), step('rest', null, 30, 'Rest some more.')],
          planReason: 'A day with one small thing in it.',
          stayUpLate: null,
        }
      } else if (req.kind === 'decide') parsed = keep
      else if (req.kind === 'sketch') {
        sketches++
        parsed = { meta: { title: `Colour field ${sketches}`, kind: 'art', about: 'A field of colour that turns slowly.', interest: null, sources: [] }, html: HTML(sketches) }
      } else if (req.kind === 'thought') {
        thoughts++
        const ids = [...req.user.matchAll(/(\d{4}-\d{2}-\d{2}#\d+) \|/g)].map((m) => m[1]!)
        parsed = { thought: line(thoughts), scores: ids.map((id) => ({ id, importance: 1 })), surprise: 1, action: 'continue', reason: null }
      }
      return { parsed: parsed as T | null, stopReason: parsed ? 'end_turn' : 'refusal', usage: USAGE }
    },
    async submitBatch() {
      return 'fake-batch'
    },
    async fetchBatch(): Promise<BatchOutcome> {
      return { status: 'failed', reason: 'the fake model has no batch' }
    },
    async cancelBatch() {},
  }
}

/** Every page is missing: the mind reads nothing and says so. */
export const fakeFetch: FetchImpl = async () => new Response('not here', { status: 404, headers: { 'content-type': 'text/plain' } })

const PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>Colour clock</title></head><body><canvas id="c" width="320" height="240"></canvas><script>const g=document.getElementById("c").getContext("2d");g.fillStyle="teal";g.fillRect(0,0,320,240)</script></body></html>'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7])

/** A build session in two turns: it writes the page and finishes. Each turn costs a few cents; it says nothing a voice would. */
export function fakeSessionModel(): SessionModel & { turns: number } {
  const use = (name: string, input: unknown): SessionBlock => ({ type: 'tool_use', id: `fake-${Math.random().toString(36).slice(2, 10)}`, name, input })
  const model = {
    turns: 0,
    async turn(req: Parameters<SessionModel['turn']>[0]) {
      model.turns++
      const wrote = JSON.stringify(req.messages).includes('write_file')
      const content = wrote ? [use('finish', { caption: 'a teal page for the clock to live on', outcome: 'continue' })] : [use('write_file', { path: 'index.html', content: PAGE })]
      return { content, stopReason: 'tool_use', usage: { input: 3000, cacheRead: 0, cacheWrite: 0, output: 800 } }
    },
  }
  return model
}

/** A runner with no browser: every page loads and renders, and the screenshot is a stub. Not sandboxed, as a local run is. */
export function fakeSandbox(): Sandbox {
  return {
    sandboxed: false,
    run: async (): Promise<SandboxRun> => ({ ...emptyPageResult({ loaded: true, rendered: true }), screenshotPng: PNG, sandboxed: false }),
    available: async () => true,
    close: async () => undefined,
  }
}
