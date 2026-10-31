import { ObjectProperties, type ActionTarget, type Material, type ModelPart, type WorldObject } from '@forkling/schema'
import { createPrng } from './prng.ts'

/** The heaviest thing a forkling can carry, in kilograms. */
export const MAX_CARRY_KG = 5

/** Hours wet paint takes to dry. */
export const DRY_HOURS = 2

const HOUR_MS = 3_600_000

export type PlantStage = 'none' | 'seed' | 'growing' | 'ripe'

/** What an object is like right now. Worked out from its timestamps, so nothing has to write it back. */
export interface ObjectStatus {
  /** Material left in a source, or null when the object isn't one. */
  stock: number | null
  stage: PlantStage
  /** Freshly painted. */
  wet: boolean
  spoiled: boolean
  /** How far a build has got, 0 to 1. Things nobody built count as finished. */
  progress: number
}

function hoursSince(iso: string | undefined, nowMs: number): number | null {
  if (iso === undefined) return null
  const then = Date.parse(iso)
  return Number.isNaN(then) ? null : (nowMs - then) / HOUR_MS
}

/** Growth, respawn, paint and spoilage as of `nowMs`. Pure: the same object and time always give the same answer. */
export function objectStatusAt(obj: WorldObject, nowMs: number): ObjectStatus {
  let stock: number | null = null
  if (obj.yields) {
    const { max, respawnHours } = obj.yields
    const base = Math.min(max, obj.state.stock ?? max)
    const elapsed = hoursSince(obj.state.stockAt, nowMs)
    stock = elapsed === null ? base : Math.min(max, base + Math.floor((Math.max(0, elapsed) / respawnHours) * max))
  }

  let stage: PlantStage = 'none'
  if (obj.grows) {
    const grown = hoursSince(obj.state.wateredAt, nowMs)
    stage = grown === null ? 'seed' : grown >= obj.grows.hours ? 'ripe' : 'growing'
  }

  const painted = hoursSince(obj.state.paintedAt, nowMs)
  const wet = painted !== null && painted >= 0 && painted < DRY_HOURS

  const age = hoursSince(obj.state.cookedAt ?? obj.made?.at, nowMs)
  const spoiled = obj.spoilsAfterHours !== undefined && age !== null && age >= obj.spoilsAfterHours

  const progress = obj.made ? (obj.made.done ? 1 : Math.min(1, obj.made.sessions / obj.made.needed)) : 1

  return { stock, stage, wet, spoiled, progress }
}

const WEIGHT_KG: Record<Material, number> = {
  wood: 1.5,
  stone: 8,
  clay: 4,
  flowers: 0.2,
  fibre: 0.3,
  shells: 0.3,
  produce: 0.4,
  dish: 0.5,
}
const SOFT: ReadonlySet<Material> = new Set(['flowers', 'fibre'])
const FOOD: ReadonlySet<Material> = new Set(['produce', 'dish'])
const SHAPE: Record<Material, ModelPart['shape']> = {
  wood: 'box',
  stone: 'sphere',
  clay: 'cylinder',
  flowers: 'cone',
  fibre: 'cylinder',
  shells: 'cone',
  produce: 'sphere',
  dish: 'cylinder',
}
const COLOR: Record<Material, string> = {
  wood: '#a67c52',
  stone: '#8a8d91',
  clay: '#c2703d',
  flowers: '#e86fa0',
  fibre: '#d8c68a',
  shells: '#f2e2d0',
  produce: '#7cb342',
  dish: '#e0a458',
}

/** The colour a material shows in a composed model. */
export function materialColor(material: Material): string {
  return COLOR[material]
}

/** The commonest material, the first one named winning a tie. */
function dominant(materials: readonly Material[]): Material {
  const counts = new Map<Material, number>()
  for (const m of materials) counts.set(m, (counts.get(m) ?? 0) + 1)
  let best = materials[0]!
  for (const m of materials) if (counts.get(m)! > counts.get(best)!) best = m
  return best
}

/** What a made thing is like physically. The materials decide: wood is light, stone is heavy, flowers are soft. */
export function madeProperties(materials: readonly Material[], size: number): ObjectProperties {
  const weight = materials.reduce((sum, m) => sum + WEIGHT_KG[m], 0)
  return ObjectProperties.parse({
    size,
    weightKg: Math.round(weight * 10) / 10,
    carryable: weight <= MAX_CARRY_KG,
    soft: materials.filter((m) => SOFT.has(m)).length * 2 >= materials.length,
    edible: materials.every((m) => FOOD.has(m)),
    canHide: size >= 0.8,
    material: dominant(materials),
  })
}

/** Sessions a build takes: one for every two materials. */
export function neededSessions(materials: readonly unknown[]): number {
  return Math.max(1, Math.ceil(materials.length / 2))
}

export interface MadeInput {
  materials: readonly Material[]
  /** Making skill level, 0 to 10. */
  skill: number
  /** Sessions worked so far and how many it takes. */
  sessions: number
  needed: number
  seed: number
}

const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0

/**
 * The look of a made thing: a stack that grows with each session. Skill sets how big the pieces are and how tidy:
 * a beginner's pile leans and wobbles, an expert's sits straight. Deterministic from its inputs.
 */
export function composeMade(input: MadeInput): { parts: ModelPart[]; size: number } {
  const { materials, skill, seed } = input
  const progress = Math.min(1, input.sessions / input.needed)
  const finalCount = Math.min(24, Math.max(2, materials.length * 3))
  const count = Math.max(1, Math.round(finalCount * progress))
  const wobble = 1 - Math.min(10, Math.max(0, skill)) / 10
  const base = 0.1 * (0.7 + 0.05 * skill)
  const rng = createPrng(seed)

  const parts: ModelPart[] = []
  let top = 0
  for (let i = 0; i < count; i++) {
    const material = materials[i % materials.length]!
    const s = base * (1 - (0.4 * i) / finalCount) * (1 + wobble * 0.3 * rng.range(-1, 1))
    const dx = wobble * 0.5 * s * rng.range(-1, 1)
    const dz = wobble * 0.5 * s * rng.range(-1, 1)
    const tilt = [wobble * 0.35 * rng.range(-1, 1), wobble * Math.PI * rng.range(-1, 1), wobble * 0.35 * rng.range(-1, 1)] as const
    parts.push({
      shape: SHAPE[material],
      size: [round3(s), round3(s), round3(s)],
      at: [round3(dx), round3(top + s / 2), round3(dz)],
      ...(wobble > 0 ? { rotation: [round3(tilt[0]), round3(tilt[1]), round3(tilt[2])] as [number, number, number] } : {}),
      color: COLOR[material],
    })
    top += s
  }

  const reach = Math.max(...parts.map((p) => Math.max(Math.abs(p.at[0]), Math.abs(p.at[2])) + p.size[0] / 2))
  return { parts, size: round3(Math.max(top, reach * 2)) }
}

/** Whether an object is somewhere the world offers as a spot of this kind: by its old affordances, or because it is high up (a perch). */
export function offersSpot(obj: WorldObject, kind: string): boolean {
  return obj.affordances.includes(kind as never) || (kind === 'perch' && obj.properties.high)
}

/** Whether `obj` is a target for a verb: it matches the verb's property filter and, if asked, unlocks the verb. */
export function matchesTarget(target: Extract<ActionTarget, { type: 'object' }>, verbId: string, obj: WorldObject): boolean {
  if (target.unlocked && !obj.unlocks.includes(verbId)) return false
  const { yields, grows, material, ...flags } = target.where
  if (yields !== undefined && (obj.yields !== undefined) !== yields) return false
  if (grows !== undefined && (obj.grows !== undefined) !== grows) return false
  if (material !== undefined && obj.properties.material !== material) return false
  for (const [key, want] of Object.entries(flags)) {
    if (want !== undefined && obj.properties[key as keyof ObjectProperties] !== want) return false
  }
  return true
}
