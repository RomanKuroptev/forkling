import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { BuildRequest, Material, MAX_IMPULSE, MAX_RUN_SEC, WorldObject, type BudgetCall, type SpeciesPack, type TemperamentRoll } from '@forkling/schema'
import { createPrng, heightAt, localDate, MAX_CARRY_KG, skillLevel, starterIsland } from '@forkling/sim'
import { skillGuide } from './art.ts'
import { runContraption } from './physics.ts'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, monthOf, rollLedger } from './budget.ts'
import { writeBuildResult } from './build-result.ts'
import { clampText } from './decision.ts'
import type { LlmClient } from './llm.ts'
import { buildSystem } from './prompts.ts'
import { readWorld, writeJson } from './world.ts'

/** The most parts a designed object has, and the largest it may be in any direction, in meters. */
const MAX_PARTS = 24
const MAX_EXTENT = 3
const MAX_UNLOCKS = 4
const MAX_DESIGN_TOKENS = 2500
const MAX_WEIGHT_KG = 500
/** How far from home a designed object may be put, and how close it may be to anything else. */
const PLACE_RADII = [4, 6, 8, 10, 12, 14]
const PLACE_CLEARANCE = 2.5
const ISLAND_LIMIT = 40
const ANGLES = 16

/**
 * What the model returns for a designed object: plain strings, numbers and booleans so it fits structured outputs.
 * Everything is forced into range by `objectFromDesign`, and the real `WorldObject` schema has the last word.
 */
export const DesignOutput = z.object({
  name: z.string(),
  /** One lowercase word for what it is: shelf, lamp, bridge. */
  kind: z.string(),
  /** Up to 24 primitives: shape is box, sphere, cylinder or cone; size and at are [x, y, z] in meters (y up, at is the centre, parts rest on y = 0 or above). */
  parts: z.array(z.object({ shape: z.string(), size: z.array(z.number()), at: z.array(z.number()), color: z.string() })),
  weightKg: z.number(),
  carryable: z.boolean(),
  soft: z.boolean(),
  canHide: z.boolean(),
  high: z.boolean(),
  storage: z.boolean(),
  /** What it is mostly made of, or null. */
  material: z.string().nullable(),
  /** Verbs it makes possible, from the list it was given. */
  unlocks: z.array(z.string()),
  /** Only when a contraption was asked for: which parts move, and the one push that sets it off. */
  contraption: z
    .object({
      bodies: z.array(z.object({ part: z.number(), dynamic: z.boolean(), massKg: z.number() })),
      triggerPart: z.number(),
      impulse: z.array(z.number()),
      runSec: z.number(),
    })
    .nullish(),
  /** Why it wanted it, in its voice. */
  reason: z.string(),
  /** The pull request that brings it to the island, in its voice. */
  prTitle: z.string(),
  prBody: z.string(),
})
export type DesignOutput = z.infer<typeof DesignOutput>

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '')
const SHAPES = new Set(['box', 'sphere', 'cylinder', 'cone'])

function hash(text: string): number {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/**
 * A spot for a designed object: on dry land in rings around home, clear of everything already there. Deterministic from
 * `key`. Null when there is no room.
 */
export function placeDesigned(objects: readonly WorldObject[], home: readonly [number, number], key: string): [number, number, number] | null {
  const rng = createPrng(hash(key))
  const start = rng.next() * Math.PI * 2
  for (const r of PLACE_RADII) {
    for (let i = 0; i < ANGLES; i++) {
      const angle = start + (i / ANGLES) * Math.PI * 2
      const x = Math.round((home[0] + Math.cos(angle) * r) * 10) / 10
      const z = Math.round((home[1] + Math.sin(angle) * r) * 10) / 10
      if (Math.abs(x) > ISLAND_LIMIT || Math.abs(z) > ISLAND_LIMIT) continue
      if (heightAt(x, z, starterIsland) < starterIsland.waterLevel + 0.6) continue
      if (objects.some((o) => Math.hypot(o.position[0] - x, o.position[2] - z) < PLACE_CLEARANCE)) continue
      return [x, 0, z]
    }
  }
  return null
}

export interface DesignContext {
  pack: SpeciesPack
  objects: readonly WorldObject[]
  /** Where home is, in x and z. */
  home: readonly [number, number]
  nowIso: string
  /** Making skill, for the record. */
  skill: number
}

/** Verbs a designed object may unlock: those the pack lets it do at a place. */
export function unlockableVerbs(pack: SpeciesPack): string[] {
  return pack.actions.filter((a) => a.target.type === 'object' && a.target.unlocked).map((a) => a.id)
}

/**
 * The model's design as a checked world object: parts forced into range and scaled to fit in three meters, the
 * properties measured from the parts, only real verbs unlocked, a spot found near home. Null when nothing usable is left.
 */
export function objectFromDesign(design: DesignOutput, request: BuildRequest, ctx: DesignContext): WorldObject | null {
  // A part that is wrong is corrected, never dropped, so the numbers a mechanism uses still mean the same part.
  const parts = design.parts.slice(0, MAX_PARTS).map((p) => ({
    shape: SHAPES.has(p.shape) ? p.shape : 'box',
    size: [clamp(p.size[0] ?? 0.2, 0.02, MAX_EXTENT), clamp(p.size[1] ?? 0.2, 0.02, MAX_EXTENT), clamp(p.size[2] ?? 0.2, 0.02, MAX_EXTENT)],
    at: [clamp(p.at[0] ?? 0, -MAX_EXTENT, MAX_EXTENT), clamp(p.at[1] ?? 0, 0, MAX_EXTENT), clamp(p.at[2] ?? 0, -MAX_EXTENT, MAX_EXTENT)],
    color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color.toLowerCase() : '#888888',
  }))
  if (parts.length === 0) return null

  let contraption: unknown
  if (request.contraption) {
    const c = design.contraption
    const bodies: { part: number; body: 'fixed' | 'dynamic'; massKg: number }[] = []
    for (const b of c?.bodies ?? []) {
      const part = Math.round(b.part)
      if (part < 0 || part >= parts.length || bodies.some((x) => x.part === part)) continue
      bodies.push({ part, body: b.dynamic ? 'dynamic' : 'fixed', massKg: Math.round(clamp(b.massKg, 0.01, 100) * 100) / 100 })
    }
    const moving = bodies.filter((b) => b.body === 'dynamic')
    if (!c || moving.length === 0) return null
    const trigger = moving.find((b) => b.part === Math.round(c.triggerPart)) ?? moving[0]!
    const push = [c.impulse[0] ?? 0, c.impulse[1] ?? 0, c.impulse[2] ?? 0].map((n) => (Number.isFinite(n) ? n : 0))
    const strength = Math.hypot(...push)
    const eased = strength > MAX_IMPULSE ? push.map((n) => (n / strength) * MAX_IMPULSE) : push
    contraption = { bodies, trigger: { part: trigger.part, impulse: eased.map((n) => Math.round(n * 1000) / 1000) }, runSec: clamp(c.runSec, 1, MAX_RUN_SEC) }
  }

  // How big it is, from where its parts are, not from what the model says. Too big, and it is scaled down to fit.
  const extent = Math.max(
    ...[0, 1, 2].map((axis) => Math.max(...parts.map((p) => p.at[axis]! + p.size[axis]! / 2)) - Math.min(...parts.map((p) => p.at[axis]! - p.size[axis]! / 2))),
  )
  const scale = extent > MAX_EXTENT ? MAX_EXTENT / extent : 1

  const position = placeDesigned(ctx.objects, ctx.home, request.id)
  if (!position) return null
  const unlockable = new Set(unlockableVerbs(ctx.pack))
  const weight = Math.round(clamp(design.weightKg, 0, MAX_WEIGHT_KG) * 10) / 10
  const material = Material.safeParse(design.material)
  const kind = slug(design.kind) || 'made'

  const parsed = WorldObject.safeParse({
    id: request.id,
    kind,
    name: clampText(design.name.trim() || request.name, 60),
    position,
    scale: Math.round(scale * 1000) / 1000,
    model: { parts },
    properties: {
      size: Math.round(extent * scale * 100) / 100,
      weightKg: weight,
      carryable: design.carryable && weight <= MAX_CARRY_KG,
      soft: design.soft,
      canHide: design.canHide,
      high: design.high,
      storage: design.storage,
      ...(material.success ? { material: material.data } : {}),
    },
    unlocks: [...new Set(design.unlocks.filter((v) => unlockable.has(v)))].slice(0, MAX_UNLOCKS),
    ...(contraption ? { contraption } : {}),
    reason: clampText(design.reason.trim() || request.purpose, 200),
  })
  return parsed.success ? parsed.data : null
}

/** The user part of a design call: the request as the forkling's own words, then the rules of the format. */
export function buildDesignUser(input: { request: BuildRequest; temperament: TemperamentRoll | null; existing: readonly string[]; verbs: readonly string[]; skill: number; date: string }): string {
  const { request, temperament } = input
  const taste = (list: readonly { category: string; value: string }[]) => list.map((t) => `${t.value} (${t.category})`).join(', ') || 'nothing in particular'
  return [
    ...(temperament
      ? ['<you>', `likes: ${taste(temperament.likes)}`, `dislikes: ${taste(temperament.dislikes)}`, ...temperament.quirks.map((q) => `quirk (${q.id}): ${q.text}`), '</you>', '']
      : []),
    '<request>',
    `name: ${clampText(request.name, 60)}`,
    `what it is for: ${clampText(request.purpose, 300)}`,
    '</request>',
    '',
    `<island>already there: ${input.existing.slice(0, 40).join(', ') || 'nothing'}</island>`,
    '',
    '## Your task',
    `It is ${input.date}. You asked for this object, and now you draw it up so a builder can put it on the island.`,
    `- Build it from at most ${MAX_PARTS} simple parts: box, sphere, cylinder or cone. Each has size [x, y, z] in meters and at [x, y, z], its centre, y up. Things rest on y = 0. The whole object fits in ${MAX_EXTENT} meters.`,
    '- Colours are #rrggbb. Keep to a few that go together, in the low-poly style of the island.',
    `- unlocks lists what it makes possible, only from: ${input.verbs.join(', ')}. Leave it empty if it is just a thing.`,
    ...(input.request.contraption
      ? [
          '- This one is a contraption: a mechanism that runs by itself once pushed. List in contraption which parts move (dynamic) and which stay fixed, by their number in parts (the first is 0), each moving part\'s mass in kg, the part that gets pushed (triggerPart, which has to move) and the push as impulse [x, y, z] in newton-seconds (a few tenths is a gentle push; the most allowed is 20), and runSec, how long to watch (1 to 15). Parts that are not listed stay fixed as scenery. It runs on flat ground with gravity, so use ramps, drops and things that knock into each other. It must actually do something, and nothing must fly off the island.',
        ]
      : []),
    '- Say honestly how heavy it is and whether a cat could carry it (under 5 kg), whether it is soft, whether something small could hide in it, whether it is a lookout, and whether things can be put away in it.',
    '- reason is one sentence in your voice about why you wanted it. prTitle and prBody are what you say when you hand it over, in your voice, plainly: no mentions of other people.',
    `Your skill at making is ${input.skill} of 10. ${skillGuide(input.skill)}`,
    'Answer only with the JSON the schema asks for.',
  ].join('\n')
}

export interface DesignDeps {
  now: Date
  /** Null when there is no key: the build stays open so it can be retried. */
  llm: LlmClient | null
  pack: SpeciesPack
  speciesPersona: string
  /** The id of `mind/builds/<id>.json` to design. */
  id: string
  dryRun?: boolean
}

export interface DesignResult {
  ok: boolean
  written: string[]
  notes: string[]
  calls: BudgetCall[]
  /** What to say on the pull request, with no `@` that could notify anyone. */
  pr: { title: string; body: string } | null
}

const MAX_PR_TITLE = 100
const MAX_PR_BODY = 1500
const noMentions = (text: string) => text.replace(/@/g, '')

/**
 * The builder: one Haiku call turns the forkling's request into an object, which is written to `objects/<id>.json`
 * for the workflow to put on a branch and open as a pull request. A design that can't be used closes the build so the
 * mind may ask again; a missing key or budget leaves it open.
 */
export async function runDesign(dir: string, deps: DesignDeps): Promise<DesignResult> {
  const nowMs = deps.now.getTime()
  const nowIso = deps.now.toISOString()
  const result: DesignResult = { ok: false, written: [], notes: [], calls: [], pr: null }

  const requestPath = join(dir, 'mind/builds', `${deps.id}.json`)
  const parsedRequest = existsSync(requestPath) ? BuildRequest.safeParse(JSON.parse(readFileSync(requestPath, 'utf8'))) : null
  if (!parsedRequest?.success) {
    result.notes.push(`no request to build: mind/builds/${deps.id}.json is missing or not a request`)
    return result
  }
  const request = parsedRequest.data
  if (request.kind !== 'object') {
    result.notes.push(`"${request.id}" is a ${request.kind} build, not an object`)
    return result
  }

  const w = readWorld(dir, (f) => monthOf(f.timezone, nowMs))
  const tz = w.forkling.timezone
  const today = localDate(tz, nowMs)
  let budget = rollLedger(w.budget, monthOf(tz, nowMs))
  const system = buildSystem({ pack: deps.pack, name: w.forkling.name, speciesPersona: deps.speciesPersona, persona: w.persona })
  const user = buildDesignUser({
    request,
    temperament: w.temperament,
    existing: w.objects.map((o) => o.name),
    verbs: unlockableVerbs(deps.pack),
    skill: skillLevel(w.skills, 'making'),
    date: today,
  })
  const tokens = estimateTokens(system) + estimateTokens(user)
  const maxUsd = estimateCallUsd('claude-haiku-5-5', tokens, MAX_DESIGN_TOKENS)

  // The builder's only report to the mind: what became of the build and what it cost. The mind books the cost, closes a
  // failed build and gives back its slot; the builder never writes the ledger, the stream or the mind's state.
  const report = (status: 'designed' | 'failed', reason?: string) => {
    if (deps.dryRun) return
    result.written.push(writeBuildResult(dir, { id: request.id, kind: 'object', status, ...(reason ? { reason: clampText(reason, 300) } : {}), calls: result.calls, at: nowIso }))
  }
  if (tokens > MAX_PROMPT_TOKENS) {
    result.notes.push(`prompt too long (about ${tokens} tokens): no call`)
    report('failed', 'the prompt was too long')
  } else if (deps.dryRun) {
    result.notes.push(`dry run: design call for ${request.id}, about ${tokens} tokens, at most $${maxUsd.toFixed(4)}`)
  } else if (!deps.llm) {
    result.notes.push('no credentials: no design')
    report('failed', 'the builder has no credentials')
  } else if (!canSpend(budget, maxUsd)) {
    result.notes.push(`monthly budget reached ($${budget.spentUsd.toFixed(2)} of $${budget.capUsd}): no design`)
    report('failed', 'the monthly budget is spent')
  } else {
    const close = (why: string) => {
      report('failed', why)
      result.notes.push(`${request.id}: ${why}`)
    }
    try {
      const answer = await deps.llm.complete({ kind: 'design', model: 'claude-haiku-5-5', system, user, maxTokens: MAX_DESIGN_TOKENS, effort: 'low', schema: DesignOutput })
      const call: BudgetCall = { at: nowIso, kind: 'design', model: 'claude-haiku-5-5', ...answer.usage, usd: costUsd('claude-haiku-5-5', answer.usage) }
      result.calls.push(call)

      const house = w.objects.find((o) => o.id === 'house')?.position ?? w.forkling.position
      const object = answer.parsed ? objectFromDesign(answer.parsed, request, { pack: deps.pack, objects: w.objects, home: [house[0], house[2]], nowIso, skill: skillLevel(w.skills, 'making') }) : null
      // A contraption has to work before it is proposed: it runs headless here, and what it did is kept with it.
      const ran = object?.contraption ? await runContraption(object) : null
      const flaw = ran ? (ran.escaped ? 'its parts were flung off the island' : !ran.moved ? 'nothing moved' : !ran.settled ? 'it never came to rest' : null) : null
      if (object?.contraption && ran && !flaw) object.contraption.lastRun = { at: nowIso, moved: ran.moved, maxTravel: ran.maxTravel, settled: ran.settled }
      if (!answer.parsed || !object || flaw) {
        close(flaw ? `the mechanism did not work: ${flaw}` : answer.parsed ? 'nothing in the design could be built' : `no usable design (stopped: ${answer.stopReason ?? 'unknown'})`)
      } else {
        writeJson(dir, `objects/${object.id}.json`, object)
        result.written.push(`objects/${object.id}.json`)
        result.pr = {
          title: clampText(noMentions(answer.parsed.prTitle).replace(/\s+/g, ' ').trim() || request.name, MAX_PR_TITLE),
          body: clampText(noMentions(answer.parsed.prBody).trim() || request.purpose, MAX_PR_BODY),
        }
        result.ok = true
        report('designed')
      }
    } catch (e) {
      result.notes.push(`call failed: ${(e as Error).message}`)
      report('failed', `the design call failed: ${(e as Error).message}`)
    }
  }
  return result
}
