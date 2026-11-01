import type { SpeciesPack } from '@forkling/schema'
import type { ReportStep, SimReport } from '@forkling/sim'

const hours = (seconds: number) => `${(seconds / 3600).toFixed(1)} h`
const pad = (text: string, width: number) => text.padEnd(width)

/**
 * The scripted plan a report plays when no real one is given: the verbs the body can do on its own, 25 minutes each.
 * That means no effects, no visitors, no paws, nothing only for the night or only for a visitor, and nothing too brief
 * to fill a step. Read from the pack, so no species is named here.
 */
export function defaultSteps(pack: SpeciesPack): ReportStep[] {
  return pack.actions
    .filter(
      (a) =>
        (a.effect ?? 'none') === 'none' &&
        a.target.type !== 'visitor' &&
        a.target.type !== 'object' &&
        a.target.type !== 'spot' &&
        a.hands === 'any' &&
        !a.requires.includes('visitorNearby') &&
        !a.requires.includes('night') &&
        !a.requires.includes('dusk') &&
        a.durationSec[1] >= 10,
    )
    .map((a) => ({ verb: a.id, minutes: 25 }))
}

/** A report as plain text for a terminal or a pull request. */
export function formatReport(r: SimReport): string {
  const totalSeconds = Object.values(r.timePerVerb).reduce((a, b) => a + b, 0)
  const lines: string[] = []
  lines.push(`${r.days} day${r.days === 1 ? '' : 's'}, seed ${r.seed}, ${r.awakeHours.toFixed(1)} h awake`)
  lines.push('')
  lines.push(`plan: the body spent ${(r.focus.share * 100).toFixed(1)}% of the plan window on the planned verb (${hours(r.focus.onPlanSeconds)} of ${hours(r.focus.seconds)})`)
  const by = Object.entries(r.focus.interruptedByVerb)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([verb, n]) => `${verb} ${n}`)
    .join(', ')
  lines.push(`      ${r.focus.interruptions} interruptions, ${r.focus.interruptionsByCause.critical} by a need running low, ${r.focus.interruptionsByCause.other} otherwise${by ? ` (${by})` : ''}`)
  const other = Object.entries(r.asleep.otherByVerb).sort((a, b) => b[1] - a[1])
  const otherSeconds = other.reduce((sum, [, n]) => sum + n, 0)
  lines.push(`night: ${hours(r.asleep.seconds)} in bed hours, ${hours(r.asleep.onSleepSeconds)} asleep, ${hours(otherSeconds)} spent on something else${other.length > 0 ? ` (${other.slice(0, 5).map(([v, n]) => `${v} ${hours(n)}`).join(', ')})` : ''}`)
  lines.push('')
  lines.push('needs (critical means under 15):')
  for (const [id, n] of Object.entries(r.needs)) {
    lines.push(
      `  ${pad(id, 10)} min ${n.min}  mean ${n.mean}  awake critical ${n.awakeCriticalMinutes} min (longest ${n.longestAwakeCriticalMinutes})  asleep critical ${n.asleepCriticalMinutes} min  empties in ${n.hoursToEmpty === null ? 'never' : `${n.hoursToEmpty.toFixed(1)} h`}`,
    )
  }
  lines.push('')
  lines.push('time per verb:')
  for (const [verb, seconds] of Object.entries(r.timePerVerb).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${pad(verb, 14)} ${pad(hours(seconds), 8)} ${((seconds / totalSeconds) * 100).toFixed(1)}%`)
  }
  return lines.join('\n')
}
