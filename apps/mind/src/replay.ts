import type { Forkling, Goals, MicroBehavior, SpeciesPack, WorldObject } from '@forkling/schema'
import { isAsleepAt, playbackStateTime, startPlayback, STRONG_NEED, worldWithObjects } from '@forkling/sim'

/** The repo as one commit of `forkling.json` left it: what a viewer loading that commit would have been given. */
export interface ReplayState {
  /** When the commit was made. */
  atMs: number
  forkling: Forkling
  goals: Goals
  objects: WorldObject[]
  quirkWeights?: Record<string, number>
}

export interface ReplayOptions {
  pack: SpeciesPack
  behaviors: MicroBehavior[]
  fromMs: number
  toMs: number
  everyMinutes: number
}

export interface ReplayRow {
  atMs: number
  /** The commit this moment was rebuilt from. */
  stateAtMs: number
  verb: string
  targetId?: string
  asleep: boolean
  /** The plan step in progress by that commit's goals, or null. */
  step: { index: number; verb: string; targetId?: string } | null
  needs: Record<string, number>
}

export interface Replay {
  rows: ReplayRow[]
  /** Awake moments with a plan step in progress, and how many of them the body was doing the step's verb. */
  planRows: number
  onPlanRows: number
  onPlanShare: number | null
  /** Awake moments each need was under 15. */
  criticalRows: Record<string, number>
}

/**
 * Rebuilds the canonical body at moments between two times, from the repo states as they were committed, and sets it
 * beside the plan. This is what the viewer would have shown, so it answers "was Merge doing what the files say?".
 * Moments before the first state are skipped. Pure and deterministic.
 */
export function replay(states: readonly ReplayState[], opts: ReplayOptions): Replay {
  const ordered = [...states].sort((a, b) => a.atMs - b.atMs)
  const worlds = new Map<ReplayState, ReturnType<typeof worldWithObjects>>()
  const rows: ReplayRow[] = []
  const criticalRows: Record<string, number> = {}
  let planRows = 0
  let onPlanRows = 0

  for (let t = opts.fromMs; t <= opts.toMs; t += opts.everyMinutes * 60_000) {
    let state: ReplayState | undefined
    for (const s of ordered) if (s.atMs <= t) state = s
    if (!state) continue
    let world = worlds.get(state)
    if (!world) {
      world = worldWithObjects(state.objects)
      worlds.set(state, world)
    }
    const { forkling, goals } = state
    const pb = startPlayback(
      { forkling, pack: opts.pack, behaviors: opts.behaviors, world, goals, stateTime: playbackStateTime(forkling), ...(state.quirkWeights ? { quirkWeights: state.quirkWeights } : {}) },
      t,
    )
    const asleep = isAsleepAt(t, { seed: forkling.seed, timezone: forkling.timezone, lateNight: forkling.lateNight })
    const planned = goals.now && t < Date.parse(goals.now.until) ? goals.today?.steps[goals.now.index] : undefined
    const step = goals.now && planned ? { index: goals.now.index, verb: planned.verb, ...(planned.targetId ? { targetId: planned.targetId } : {}) } : null
    const needs = Object.fromEntries(Object.entries(pb.state.needs).map(([id, v]) => [id, Math.round((v ?? 0) * 10) / 10]))
    const verb = pb.state.intention.type
    rows.push({ atMs: t, stateAtMs: state.atMs, verb, ...(pb.state.intention.targetId ? { targetId: pb.state.intention.targetId } : {}), asleep, step, needs })
    if (!asleep) {
      if (step) {
        planRows++
        if (verb === step.verb) onPlanRows++
      }
      for (const [id, v] of Object.entries(needs)) if (v < STRONG_NEED) criticalRows[id] = (criticalRows[id] ?? 0) + 1
    }
  }
  return { rows, planRows, onPlanRows, onPlanShare: planRows > 0 ? onPlanRows / planRows : null, criticalRows }
}

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16)

/** A replay as text: one line per moment, then the share of the plan the body did. */
export function formatReplay(r: Replay): string {
  const lines = r.rows.map((row) => {
    const doing = `${row.verb}${row.targetId ? ` ${row.targetId}` : ''}`
    const plan = row.asleep ? 'asleep' : row.step ? `plan ${row.step.verb}${row.step.targetId ? ` ${row.step.targetId}` : ''}${row.step.verb === row.verb ? ' (doing it)' : ''}` : 'no plan step'
    const needs = Object.entries(row.needs)
      .map(([id, v]) => `${id[0]}${Math.round(v)}`)
      .join(' ')
    return `${clock(row.atMs)} ${doing.padEnd(26)} ${plan.padEnd(36)} ${needs}  (state of ${clock(row.stateAtMs)})`
  })
  lines.push('')
  lines.push(r.onPlanShare === null ? 'no plan step in progress at any moment while awake' : `on the plan step in ${r.onPlanRows} of ${r.planRows} moments while awake (${(r.onPlanShare * 100).toFixed(0)}%)`)
  const critical = Object.entries(r.criticalRows)
  if (critical.length > 0) lines.push(`under 15 while awake: ${critical.map(([id, n]) => `${id} ${n} moments`).join(', ')}`)
  return lines.join('\n')
}
