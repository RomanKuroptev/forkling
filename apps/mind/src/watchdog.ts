// The watchdog (spec 11.3, 14.3). `watchdog.yml` in the world repo runs this on a bare checkout of this one file, with only
// `node`, so it imports nothing from the workspace and needs no install.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MIN = 60_000
/** The last thought may be at most this old while Merge should be awake. */
export const WATCHDOG_MAX_THOUGHT_AGE_MS = 20 * MIN
const TIMEZONE = 'Europe/Stockholm'
/**
 * When there is no answer at all, Merge's own schedule is unknown, so a coarse window stands in for it: later than the
 * latest wake-up (07:30 plus a 45-minute weekend lie-in, plus the 20 minutes of grace) and earlier than the earliest bedtime.
 */
const WATCH_FROM_MINUTES = 8 * 60 + 40
const WATCH_UNTIL_MINUTES = 22 * 60 + 15
const FETCH_TIMEOUT_MS = 20_000

/** The part of `GET /health` the watchdog needs. */
export interface HealthSnapshot {
  shouldBeAwake: boolean
  lastThoughtAt: string | null
}
export interface Verdict {
  ok: boolean
  message: string
}

function localMinutes(nowMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nowMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

/** Whether the run should pass. Pure. `health` is null when the server did not answer in a way that makes sense. */
export function judge(a: { health: HealthSnapshot | null; nowMs: number; timezone?: string }): Verdict {
  const { health, nowMs } = a
  if (!health) {
    const minutes = localMinutes(nowMs, a.timezone ?? TIMEZONE)
    if (minutes >= WATCH_FROM_MINUTES && minutes < WATCH_UNTIL_MINUTES) return { ok: false, message: 'the server did not answer on /health while Merge should be awake' }
    return { ok: true, message: 'the server did not answer, but it is the dead of night and Merge should be asleep' }
  }
  if (!health.shouldBeAwake) return { ok: true, message: 'Merge is asleep, or has only just woken' }
  if (!health.lastThoughtAt) return { ok: false, message: 'Merge should be awake and there has been no thought yet' }
  const age = nowMs - Date.parse(health.lastThoughtAt)
  if (age > WATCHDOG_MAX_THOUGHT_AGE_MS) return { ok: false, message: `the last thought was ${Math.floor(age / MIN)} minutes ago (more than 20) while Merge should be awake` }
  return { ok: true, message: `the last thought was ${Math.max(0, Math.floor(age / MIN))} minutes ago` }
}

/** The fields the watchdog needs from a `/health` body, or null if it is not one. */
export function parseHealth(text: string): HealthSnapshot | null {
  try {
    const body: unknown = JSON.parse(text)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
    const { shouldBeAwake, lastThoughtAt } = body as Record<string, unknown>
    if (typeof shouldBeAwake !== 'boolean') return null
    if (lastThoughtAt === null) return { shouldBeAwake, lastThoughtAt: null }
    if (typeof lastThoughtAt !== 'string' || Number.isNaN(Date.parse(lastThoughtAt))) return null
    return { shouldBeAwake, lastThoughtAt }
  } catch {
    return null
  }
}

/** Asks the server's `/health` and judges the answer. A network error, a bad status or a garbled body is no answer. */
export async function runWatchdog(baseUrl: string, opts: { fetch?: typeof fetch; nowMs?: number } = {}): Promise<Verdict> {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (!base) return { ok: false, message: 'MIND_URL is not set: give the watchdog the server address (a repository variable)' }
  const fetchImpl = opts.fetch ?? fetch
  let health: HealthSnapshot | null = null
  try {
    const res = await fetchImpl(`${base}/health`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (res.ok) health = parseHealth(await res.text())
  } catch {
    health = null
  }
  return judge({ health, nowMs: opts.nowMs ?? Date.now() })
}

// Run as a script by the workflow: `node watchdog.ts "$MIND_URL"`. A failing exit makes GitHub email Roman.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const verdict = await runWatchdog(process.argv[2] ?? '')
  console.log(verdict.message)
  if (!verdict.ok) {
    console.log(`::error::${verdict.message}`)
    process.exit(1)
  }
}
