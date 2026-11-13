import type { Belief, Forkling, Goals, Interests, MindState, VisitorEvent } from '@forkling/schema'
import { liveBeliefs, type Prices, type Trigger } from '@forkling/sim'
import type { RecentPast } from '../past.ts'
import type { StartingPoint } from '../web/doors.ts'
import { decideTask } from './decide.ts'
import { morningTask } from './morning.ts'
import { defang, describeBelief, describeInterests, json, type ThinkKind } from './shared.ts'
import { weeklyTask } from './weekly.ts'

export interface UserInput {
  kind: ThinkKind
  forkling: Forkling
  goals: Goals
  mindState: MindState
  /** The ids of the places that exist. */
  places: readonly string[]
  /** The places that have earned an expand now (spec 2.5), as `id (tag)`. */
  growable?: readonly string[]
  triggers: readonly Trigger[]
  events: readonly VisitorEvent[]
  /** Local time like `Tuesday 2026-11-03 10:00`. */
  localTime: string
  /** Local times like `07:10` and `23:05`. */
  wakeTime: string
  bedTime: string
  /** Hours of waking left today, rounded. */
  hoursLeft: number
  /** Points of the daily allowance in hand, and what each kind of step costs today (spec 9.8). */
  allowance: { points: number; prices: Prices }
  /** How it feels, in words: `low, tired`. Never numbers. */
  mood: string
  /** What its last step did, one line each. */
  justNow: readonly string[]
  /** `memory/beliefs.json`; dropped ones are left out of the prompt. */
  beliefs: readonly Belief[]
  /** `memory/summary.md`. */
  memory: string
  /** `brain/interests.json`. */
  interests: Interests
  /** What it did and wrote before, so it can build on its own work. Missing means none is shown. */
  past?: RecentPast
  /** Where a morning may start from: the front pages' links, 3 marked as doors outside its interests. Missing means none. */
  startingPoints?: readonly StartingPoint[]
}

/** The points in hand and the prices that apply today, in one line each. */
function describeAllowance({ points, prices }: UserInput['allowance']): string[] {
  const cost = (label: string, n: number) => `${label} ${n}`
  return [
    `points in hand: ${points}`,
    `prices today: ${[cost('wander', prices.trip), cost('tend', prices.tend), cost('revisit', prices.revisit), cost('expand', prices.expand), cost('found', prices.foundRequest), cost('tinker (full work)', prices.fullWork), cost('tinker (sketch)', prices.sketch), cost('write', prices.write), cost('reply', prices.reply), cost('rest', prices.rest)].join(', ')}; a deep step costs 30`,
  ]
}

/**
 * What it read lately, and for a morning or a weekly review also what it decided on the last days, what it made and the
 * obsessions that have ended, so it can carry on its own work and does not fall back into an old fixation unknowingly.
 */
function describePast(i: UserInput): string[] {
  const past = i.past
  if (!past) return []
  const full = i.kind !== 'decide'
  const ended = full ? i.interests.past.slice(-5).reverse() : []
  const lines = [
    ...(past.readings.length > 0 ? ['what you read lately:', ...past.readings.map((r) => `- ${r.date}, "${r.title}": ${r.summary}`)] : []),
    ...(full && past.plans.length > 0 ? ['what you decided on the last days:', ...past.plans.map((p) => `- ${p.date}: ${p.reason}`)] : []),
    ...(full && past.art.length > 0 ? ['what you made lately:', ...past.art.map((a) => `- ${a.date} ${a.kind} "${a.title}"`)] : []),
    ...(ended.length > 0 ? ['obsessions that have ended (you do not have to go back to one just because it is familiar):', ...ended.map((o) => `- ${o.topic} (${o.startedAt.slice(0, 10)} to ${o.endedAt.slice(0, 10)})`)] : []),
  ]
  return lines.length > 0 ? ['', '<past>', ...lines, '</past>'] : []
}

/** Text from outside goes in between data tags, so it must not be able to close them. */

/** The links of the front pages, as data: a title and an address each, and a mark on the doors. */
function describeStartingPoints(points: readonly StartingPoint[] | undefined): string[] {
  if (!points || points.length === 0) return []
  return ['', '<data source="starting-points">', ...points.map((p) => defang(`${p.door ? '(door) ' : ''}${p.title} | ${p.url}`)), '</data>']
}

const TASKS: Record<ThinkKind, (i: UserInput) => string> = {
  morning: morningTask,
  decide: decideTask,
  weekly: weeklyTask,
}

/** The part of the prompt that changes every call. It goes after the cache breakpoint. */
export function buildUser(i: UserInput): string {
  const intention = i.forkling.intention
  const step = i.goals.now ? i.goals.today?.steps[i.goals.now.index] : undefined
  return [
    '<situation>',
    `time: ${i.localTime} (${i.forkling.timezone}); woke at ${i.wakeTime}; bedtime ${i.bedTime}`,
    `mood: ${i.mood}`,
    `doing now: ${intention.type}${intention.targetId ? ` at ${intention.targetId}` : ''} ("${intention.reason}")`,
    ...describeAllowance(i.allowance),
    ...(i.justNow.length > 0 ? ['', 'just now:', ...i.justNow.map((line) => `- ${line}`)] : []),
    '</situation>',
    '',
    '<interests>',
    ...describeInterests(i.interests),
    '</interests>',
    ...(i.memory.trim() ? ['', '<memory>', i.memory.trim(), '</memory>'] : []),
    ...(liveBeliefs(i.beliefs).length > 0 ? ['', '<beliefs>', ...liveBeliefs(i.beliefs).map(describeBelief), '</beliefs>'] : []),
    ...describePast(i),
    ...describeStartingPoints(i.startingPoints),
    '',
    '<goals>',
    json({
      long: i.goals.long ? { text: i.goals.long.text, reason: i.goals.long.reason, setAt: i.goals.long.setAt } : null,
      today: i.goals.today ?? null,
      currentStep: step && i.goals.now ? { index: i.goals.now.index, ...step, until: i.goals.now.until } : null,
    }),
    '</goals>',
    '',
    '<places>',
    i.places.join(', ') || 'none',
    '</places>',
    ...((i.growable ?? []).length > 0 ? ['', '<growable>', 'These places have earned an expand now (the interest that earned it):', ...i.growable!.map((g) => `- ${g}`), '</growable>'] : []),
    '',
    '<recent>',
    json({ steps: i.mindState.recent.slice(-8), rejectedPlans: i.mindState.rejections.slice(-3) }),
    '</recent>',
    ...(i.events.length > 0 ? ['', '<data source="visitors">', ...i.events.map((e) => json({ type: e.type, payload: e.payload, at: e.createdAt })), '</data>'] : []),
    '',
    '<triggers>',
    ...(i.triggers.length > 0 ? i.triggers.map((t) => `- ${t.kind}: ${t.detail}`) : ['- none']),
    '</triggers>',
    '',
    '## Your task',
    TASKS[i.kind](i),
  ].join('\n')
}
