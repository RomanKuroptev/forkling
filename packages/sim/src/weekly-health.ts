import { inSpiral } from './mood.ts'

const DAY_MS = 86_400_000

/** Spec 9.6: one verb used for more than half of the week's steps is worth a warning. */
export const VERB_SHARE_WARN = 0.5
/** A week with fewer steps than this says nothing about one verb (2 of 3 steps is not a habit). */
export const MIN_STEPS_FOR_SHARE = 8
/** The verbs whose steps leave a file behind: a tend, expand, found, tinker or write (spec 9.6). */
export const MAKING_VERBS: ReadonlySet<string> = new Set(['tend', 'expand', 'found', 'tinker', 'write'])
export const NO_MAKING_DAYS = 3
/** More than 30% of a week's build attempts failing is worth a warning (spec 9.6), once there are enough builds to say. */
export const FAILING_BUILD_SHARE = 0.3
export const MIN_BUILDS = 3

export interface WeeklyHealthInput {
  /** The steps started in the last 7 days, from the timeline. */
  steps: readonly { verb: string; at: string }[]
  nowMs: number
  /** The mood at wake on the last mornings, oldest first. */
  wakeMoods: readonly number[]
  /** The build attempts of the last 7 days: how many came back, and how many of those failed or ended in the scrap bin. */
  builds: { total: number; failed: number }
}

/**
 * The weekly health check (spec 9.6): warnings for Roman, in plain words. Code never changes Merge's behaviour because of one.
 * Pure. A step that started is the stand-in for a file made: a made thing is always one of the making verbs' steps.
 */
export function weeklyHealthWarnings(i: WeeklyHealthInput): string[] {
  const warnings: string[] = []
  const since = i.nowMs - 7 * DAY_MS
  const steps = i.steps.filter((s) => Date.parse(s.at) > since)

  if (steps.length >= MIN_STEPS_FOR_SHARE) {
    const counts = new Map<string, number>()
    for (const s of steps) counts.set(s.verb, (counts.get(s.verb) ?? 0) + 1)
    const [verb, n] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!
    if (n / steps.length > VERB_SHARE_WARN) warnings.push(`"${verb}" was ${Math.round((n / steps.length) * 100)}% of the week's ${steps.length} steps`)
  }

  if (steps.length > 0) {
    const times = steps.map((s) => Date.parse(s.at))
    const oldest = Math.min(...times)
    const making = steps.filter((s) => MAKING_VERBS.has(s.verb)).map((s) => Date.parse(s.at))
    const last = making.length > 0 ? Math.max(...making) : null
    // Only a world with some history can be judged: a new one has had no 3 days yet.
    if (i.nowMs - oldest >= NO_MAKING_DAYS * DAY_MS && (last === null || i.nowMs - last > NO_MAKING_DAYS * DAY_MS)) {
      warnings.push(`no tend, expand, found, tinker or write in ${Math.floor((i.nowMs - (last ?? oldest)) / DAY_MS)} days`)
    }
  }

  if (inSpiral(i.wakeMoods)) warnings.push('mood at wake was very low on 3 mornings in a row')

  if (i.builds.total >= MIN_BUILDS && i.builds.failed / i.builds.total > FAILING_BUILD_SHARE) {
    warnings.push(`${i.builds.failed} of ${i.builds.total} builds failed in the last week`)
  }
  return warnings
}
