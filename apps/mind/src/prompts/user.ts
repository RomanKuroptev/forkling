import type { Belief, Forkling, Goals, Interests, MindState, Skills, TemperamentRoll, VisitorEvent, WorldObject } from '@forkling/schema'
import { liveBeliefs, objectStatusAt, type Trigger } from '@forkling/sim'
import { decideTask } from './decide.ts'
import { morningTask } from './morning.ts'
import { describeBelief, describeInterests, json, type ThinkKind } from './shared.ts'
import { weeklyTask } from './weekly.ts'

export interface UserInput {
  kind: ThinkKind
  forkling: Forkling
  goals: Goals
  mindState: MindState
  objects: readonly WorldObject[]
  /** Spot kinds the world offers right now (`perch`, `sunbeam`, ...), not object ids. */
  spotKinds: readonly string[]
  triggers: readonly Trigger[]
  events: readonly VisitorEvent[]
  /** Local time like `Tuesday 2026-11-03 10:00`. */
  localTime: string
  /** Local times like `07:10` and `23:05`. */
  wakeTime: string
  bedTime: string
  /** Hours of waking left today, rounded. */
  hoursLeft: number
  body: { x: number; z: number; needs: Record<string, number> }
  /** Unix ms, for what grows, refills and goes off. */
  nowMs: number
  /** What it holds and has stored, after anything its last step did. */
  holding: Forkling['holding']
  stored: Forkling['stored']
  skills: Skills
  temperament: TemperamentRoll | null
  /** How its mood label is made up, in words. */
  feelings: string
  /** What its last step did, one line each. */
  justNow: readonly string[]
  /** `memory/beliefs.json`; dropped ones are left out of the prompt. */
  beliefs: readonly Belief[]
  /** `memory/summary.md`. */
  memory: string
  /** `brain/interests.json`. */
  interests: Interests
  /** Whether it may ask for an object to be designed now: yes, a request is still waiting, or today's is used. */
  designs?: 'ready' | 'open' | 'used'
}

const TASKS: Record<ThinkKind, (i: UserInput) => string> = {
  morning: morningTask,
  decide: decideTask,
  weekly: weeklyTask,
}

/** One object as the model sees it: where it is, what it unlocks, what it gives, how it is getting on. */
function describeObject(o: WorldObject, nowMs: number): Record<string, unknown> {
  const status = objectStatusAt(o, nowMs)
  const p = o.properties
  const flags = (['carryable', 'storage', 'edible', 'soft', 'high', 'canHide', 'diggable'] as const).filter((f) => p[f])
  return {
    id: o.id,
    name: o.name,
    kind: o.kind,
    at: [o.position[0], o.position[2]],
    why: o.reason,
    ...(flags.length > 0 || p.material ? { is: [...flags, ...(p.material ? [p.material] : [])] } : {}),
    ...(o.unlocks.length > 0 ? { unlocks: o.unlocks } : {}),
    ...(o.yields ? { gives: o.yields.material, left: status.stock } : {}),
    ...(o.grows ? { grows: status.stage } : {}),
    ...(o.made && !o.made.done ? { unfinished: `${o.made.sessions} of ${o.made.needed} sessions` } : {}),
    ...(o.state.open !== undefined ? { open: o.state.open } : {}),
    ...(o.state.held ? { inYourPaws: true } : {}),
    ...(o.contraption ? { mechanism: true, ...(o.contraption.lastRun ? { lastRun: o.contraption.lastRun.moved ? `moved ${o.contraption.lastRun.maxTravel} m` : 'nothing moved' } : {}) } : {}),
    ...(status.spoiled ? { spoiled: true } : {}),
    ...(status.wet ? { wetPaint: true } : {}),
  }
}

/** The part of the prompt that changes every call. It goes after the cache breakpoint. */
export function buildUser(i: UserInput): string {
  const needs = Object.entries(i.body.needs)
    .map(([id, v]) => `${id} ${Math.round(v)}`)
    .join(', ')
  const intention = i.forkling.intention
  const step = i.goals.now ? i.goals.today?.steps[i.goals.now.index] : undefined
  const paws = i.holding ? ('material' in i.holding ? `a piece of ${i.holding.material}` : `the object ${i.holding.objectId}`) : 'nothing'
  const stored = Object.entries(i.stored)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([m, n]) => `${n} ${m}`)
    .join(', ')
  const skills = Object.entries(i.skills)
    .map(([g, s]) => `${g} ${s!.level}`)
    .join(', ')
  const taste = (list: readonly { category: string; value: string }[]) => list.map((t) => `${t.value} (${t.category})`).join(', ') || 'nothing in particular'
  return [
    '<situation>',
    `time: ${i.localTime} (${i.forkling.timezone}); woke at ${i.wakeTime}; bedtime ${i.bedTime}`,
    `needs (0 empty, 100 full): ${needs}`,
    `mood: ${i.forkling.mood} (${i.feelings})`,
    `position: x ${i.body.x.toFixed(0)}, z ${i.body.z.toFixed(0)}`,
    `doing now: ${intention.type}${intention.targetId ? ` at ${intention.targetId}` : ''} ("${intention.reason}")`,
    `in your paws: ${paws}`,
    `stored at home: ${stored || 'nothing'}`,
    ...(i.designs ? [`asking for a designed object: ${i.designs === 'ready' ? 'you may ask for one today' : i.designs === 'open' ? 'one is already being built' : 'you have asked for one today already'}`] : []),
    ...(skills ? [`how practised you are (0 to 10): ${skills}`] : []),
    ...(i.justNow.length > 0 ? ['', 'just now:', ...i.justNow.map((line) => `- ${line}`)] : []),
    '</situation>',
    ...(i.temperament
      ? [
          '',
          '<you>',
          `likes: ${taste(i.temperament.likes)}`,
          `dislikes: ${taste(i.temperament.dislikes)}`,
          ...i.temperament.quirks.map((q) => `quirk (${q.id}): ${q.text}`),
          '</you>',
        ]
      : []),
    '',
    '<interests>',
    ...describeInterests(i.interests),
    '</interests>',
    ...(i.memory.trim() ? ['', '<memory>', i.memory.trim(), '</memory>'] : []),
    ...(liveBeliefs(i.beliefs).length > 0 ? ['', '<beliefs>', ...liveBeliefs(i.beliefs).map(describeBelief), '</beliefs>'] : []),
    '',
    '<goals>',
    json({
      long: i.goals.long ? { text: i.goals.long.text, reason: i.goals.long.reason, setAt: i.goals.long.setAt } : null,
      today: i.goals.today ?? null,
      currentStep: step && i.goals.now ? { index: i.goals.now.index, ...step, until: i.goals.now.until } : null,
    }),
    '</goals>',
    '',
    '<world>',
    `places you can go (spot kinds): ${i.spotKinds.join(', ') || 'none'}`,
    ...i.objects.slice(0, 100).map((o) => json(describeObject(o, i.nowMs))),
    '</world>',
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
