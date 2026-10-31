import { WorldObject, type Holding, type Material, type ModelPart, type PlanStep, type SpeciesAction, type VerbGroup } from '@forkling/schema'
import type { Point2 } from './nav.ts'
import { composeMade, madeProperties, materialColor, matchesTarget, MAX_CARRY_KG, neededSessions, objectStatusAt } from './objects.ts'
import { createPrng, type Prng } from './prng.ts'

/** Most things a forkling has made, planted or cooked that can stand on the island at once. */
export const MAX_MADE_OBJECTS = 30

/** Materials put away at home. */
export type Stored = Partial<Record<Material, number>>

/** The part of the world a step can change: what the forkling holds and has stored, and the objects. */
export interface StepWorld {
  holding: Holding | undefined
  stored: Stored
  /** Where the forkling stands, in meters. Dropped things land here. */
  position: Point2
  objects: readonly WorldObject[]
}

export interface StepOptions {
  nowMs: number
  /** Skill level (0 to 10) in the verb's group. */
  skill: number
  /** The intention's seed. Placement and looks come from it, so a step always plays out the same way. */
  seed: number
}

export type StepEvent = {
  kind:
    | 'gathered'
    | 'pickedUp'
    | 'stored'
    | 'placed'
    | 'dropped'
    | 'opened'
    | 'closed'
    | 'started'
    | 'worked'
    | 'finished'
    | 'painted'
    | 'planted'
    | 'watered'
    | 'harvested'
    | 'cooked'
    | 'ate'
    | 'ateSpoiled'
    | 'read'
  objectId?: string
  material?: Material
}

export type StepResult =
  | {
      ok: true
      world: StepWorld
      /** Ids of objects created or changed, and of objects gone. The mind writes exactly these files. */
      upserted: string[]
      removed: string[]
      events: StepEvent[]
      /** Practice earned, in the verb's group. */
      xp: number
      group: VerbGroup
    }
  | { ok: false; reason: string }

const PAINTS = ['#d9534f', '#f0ad4e', '#5bc0de', '#5cb85c', '#9b59b6', '#e86fa0']
/** Hours a plant takes to ripen once watered. */
const GROW_HOURS = 48
/** Hours a cooked dish stays good. */
const DISH_HOURS = 12

const fail = (reason: string): StepResult => ({ ok: false, reason })
const round2 = (v: number) => Math.round(v * 100) / 100 + 0

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
    .replace(/-+$/g, '')
  return slug || 'thing'
}

function uniqueId(objects: readonly WorldObject[], base: string): string {
  const taken = new Set(objects.map((o) => o.id))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Spend materials from the paws first, then the store. */
function takeMaterials(holding: Holding | undefined, stored: Stored, wanted: readonly Material[]): { holding: Holding | undefined; stored: Stored } | { missing: Material[] } {
  let paws = holding
  const store: Stored = { ...stored }
  const missing: Material[] = []
  for (const m of wanted) {
    if (paws && 'material' in paws && paws.material === m) paws = undefined
    else if ((store[m] ?? 0) > 0) {
      const left = store[m]! - 1
      if (left > 0) store[m] = left
      else delete store[m]
    } else missing.push(m)
  }
  return missing.length > 0 ? { missing } : { holding: paws, stored: store }
}

function placeBeside(target: WorldObject | undefined, from: Point2, rng: Prng): [number, number, number] {
  const base = target ? { x: target.position[0], z: target.position[2] } : from
  const angle = rng.range(0, Math.PI * 2)
  const radius = (target?.properties.size ?? 0) * 0.5 + 1.5
  return [round2(base.x + Math.sin(angle) * radius), 0, round2(base.z + Math.cos(angle) * radius)]
}

function replace(objects: readonly WorldObject[], updated: WorldObject): WorldObject[] {
  return objects.map((o) => (o.id === updated.id ? updated : o))
}

function withoutHeld(obj: WorldObject): WorldObject {
  const { held: _held, ...state } = obj.state
  return { ...obj, state }
}

function describeMismatch(verb: SpeciesAction, id: string, world: StepWorld): string {
  if (verb.target.type !== 'object') return `${verb.id} cannot be done with "${id}"`
  const options = world.objects.filter((o) => !o.state.held && matchesTarget(verb.target as Extract<SpeciesAction['target'], { type: 'object' }>, verb.id, o)).map((o) => o.id)
  const need = verb.target.unlocked ? `${verb.id} needs an object that unlocks it` : `${verb.id} works on something else`
  return `${verb.id} cannot be done with "${id}": ${need}${options.length > 0 ? ` (try: ${options.slice(0, 4).join(', ')})` : ''}`
}

/**
 * What a finished step does to the world. Pure: it returns the new world and what changed, or why the step cannot
 * happen. The mind applies it when a step ends, and `validatePlan` runs it over a whole plan before the body ever sees it.
 */
export function applyStep(world: StepWorld, step: PlanStep, verb: SpeciesAction, opts: StepOptions): StepResult {
  if (verb.hands === 'empty' && world.holding) return fail(`${verb.id} needs empty paws, but its paws are full`)
  if (verb.hands === 'full' && !world.holding) return fail(`${verb.id} needs something in its paws, but its paws are empty`)

  let target: WorldObject | undefined
  if (verb.target.type === 'object') {
    if (step.targetId === undefined) {
      if (verb.effect !== 'none') return fail(`${verb.id} needs a target object`)
    } else {
      target = world.objects.find((o) => o.id === step.targetId)
      if (!target) return fail(`there is no object "${step.targetId}"`)
      if (target.state.held) return fail(`"${target.id}" is already in its paws`)
      if (verb.effect === 'make' && target.made) {
        if (target.made.done) return fail(`"${target.id}" is already finished`)
      } else if (!matchesTarget(verb.target, verb.id, target)) {
        return fail(describeMismatch(verb, target.id, world))
      }
    }
  }

  const at = new Date(opts.nowMs).toISOString()
  const rng = createPrng(opts.seed)
  const done = (next: StepWorld, upserted: string[], removed: string[], events: StepEvent[]): StepResult => ({
    ok: true,
    world: next,
    upserted,
    removed,
    events,
    xp: step.minutes,
    group: verb.group,
  })
  const needTarget = (): WorldObject | string => target ?? `${verb.id} needs an object to work on`
  const crowded = () => world.objects.filter((o) => o.made).length >= MAX_MADE_OBJECTS

  /** Check a step's named materials against what the verb works with and what the forkling has. */
  const gather = (materials: readonly Material[] | undefined): { holding: Holding | undefined; stored: Stored; materials: Material[] } | string => {
    if (!materials || materials.length === 0) return `${verb.id} needs the materials to use`
    for (const m of materials) if (verb.accepts.length > 0 && !verb.accepts.includes(m)) return `${verb.id} cannot work with ${m}`
    const taken = takeMaterials(world.holding, world.stored, materials)
    if ('missing' in taken) return `it does not have the ${[...new Set(taken.missing)].join(' and ')} for that`
    return { ...taken, materials: [...materials] }
  }

  switch (verb.effect) {
    case 'none':
    case 'hide':
    case 'give':
      return done(world, [], [], [])

    // Reading changes nothing in the world. What it reads and learns is the mind's business, from the topic of the step.
    case 'read':
    case 'study': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      return done(world, [], [], [{ kind: 'read', objectId: t.id }])
    }

    case 'pickUp':
    case 'cut': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      if (t.yields) {
        const { material } = t.yields
        if (verb.accepts.length > 0 && !verb.accepts.includes(material)) return fail(`${verb.id} cannot work with ${material}`)
        const stock = objectStatusAt(t, opts.nowMs).stock ?? 0
        if (stock < 1) return fail(`there is nothing left at "${t.id}" right now`)
        const updated: WorldObject = { ...t, state: { ...t.state, stock: stock - 1, stockAt: at } }
        return done({ ...world, holding: { material }, objects: replace(world.objects, updated) }, [t.id], [], [{ kind: 'gathered', objectId: t.id, material }])
      }
      if (verb.effect === 'cut') return fail(`there is nothing to cut at "${t.id}"`)
      if (!t.properties.carryable) return fail(`"${t.id}" cannot be picked up`)
      if (t.properties.weightKg > MAX_CARRY_KG) return fail(`"${t.id}" is too heavy to lift`)
      const updated: WorldObject = { ...t, state: { ...t.state, held: true } }
      return done({ ...world, holding: { objectId: t.id }, objects: replace(world.objects, updated) }, [t.id], [], [{ kind: 'pickedUp', objectId: t.id }])
    }

    case 'putOn': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      const paws = world.holding!
      if ('material' in paws) {
        if (!t.properties.storage) return fail(`"${t.id}" cannot keep raw material: put it on a storage place, or use it`)
        const stored = { ...world.stored, [paws.material]: (world.stored[paws.material] ?? 0) + 1 }
        return done({ ...world, holding: undefined, stored }, [], [], [{ kind: 'stored', objectId: t.id, material: paws.material }])
      }
      const held = world.objects.find((o) => o.id === paws.objectId)
      if (!held) return fail(`it is not holding "${paws.objectId}" any more`)
      const placed: WorldObject = { ...withoutHeld(held), position: [t.position[0], 0, t.position[2]] }
      return done({ ...world, holding: undefined, objects: replace(world.objects, placed) }, [placed.id], [], [{ kind: 'placed', objectId: placed.id }])
    }

    case 'drop': {
      const paws = world.holding!
      if ('material' in paws) return fail(`a loose ${paws.material} cannot just be dropped: put_on a storage place, or use it`)
      const held = world.objects.find((o) => o.id === paws.objectId)
      if (!held) return fail(`it is not holding "${paws.objectId}" any more`)
      const dropped: WorldObject = { ...withoutHeld(held), position: [round2(world.position.x), 0, round2(world.position.z)] }
      return done({ ...world, holding: undefined, objects: replace(world.objects, dropped) }, [dropped.id], [], [{ kind: 'dropped', objectId: dropped.id }])
    }

    case 'open':
    case 'close': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      const open = verb.effect === 'open'
      if ((t.state.open ?? false) === open) return fail(`"${t.id}" is already ${open ? 'open' : 'closed'}`)
      const updated: WorldObject = { ...t, state: { ...t.state, open } }
      return done({ ...world, objects: replace(world.objects, updated) }, [t.id], [], [{ kind: open ? 'opened' : 'closed', objectId: t.id }])
    }

    case 'make': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)

      if (t.made) {
        const sessions = t.made.sessions + 1
        const finished = sessions >= t.made.needed
        const { parts, size } = composeMade({ materials: t.made.materials, skill: t.made.skill, sessions, needed: t.made.needed, seed: t.made.seed ?? hashString(t.id) })
        const updated: WorldObject = {
          ...t,
          model: { parts },
          properties: madeProperties(t.made.materials, size),
          made: { ...t.made, sessions, done: finished },
        }
        return done({ ...world, objects: replace(world.objects, updated) }, [t.id], [], [{ kind: finished ? 'finished' : 'worked', objectId: t.id }])
      }

      const have = gather(step.materials)
      if (typeof have === 'string') return fail(have)
      if (!step.makes) return fail(`${verb.id} needs a name for what it makes`)
      if (crowded()) return fail(`the island is already full of made things (${MAX_MADE_OBJECTS})`)
      const id = uniqueId(world.objects, slugify(step.makes))
      const needed = neededSessions(have.materials)
      const seed = opts.seed >>> 0
      const { parts, size } = composeMade({ materials: have.materials, skill: opts.skill, sessions: 1, needed, seed })
      const finished = needed === 1
      const made = WorldObject.parse({
        id,
        kind: 'made',
        name: step.makes.trim().slice(0, 60),
        position: placeBeside(t, world.position, rng),
        model: { parts },
        properties: madeProperties(have.materials, size),
        made: { verb: verb.id, materials: have.materials, skill: opts.skill, sessions: 1, needed, done: finished, at, seed },
        reason: step.reason,
      })
      return done({ ...world, holding: have.holding, stored: have.stored, objects: [...world.objects, made] }, [id], [], [{ kind: finished ? 'finished' : 'started', objectId: id }])
    }

    case 'paint': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      const color = PAINTS[opts.seed % PAINTS.length]!
      const model = 'parts' in t.model ? { parts: t.model.parts.map((p): ModelPart => ({ ...p, color })) } : t.model
      const updated: WorldObject = { ...t, model, state: { ...t.state, paintedAt: at } }
      return done({ ...world, objects: replace(world.objects, updated) }, [t.id], [], [{ kind: 'painted', objectId: t.id }])
    }

    case 'plant': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      const have = gather(step.materials?.slice(0, 1))
      if (typeof have === 'string') return fail(have)
      if (crowded()) return fail(`the island is already full of made things (${MAX_MADE_OBJECTS})`)
      const seedMaterial = have.materials[0]!
      const gives: Material = seedMaterial === 'flowers' ? 'flowers' : 'produce'
      const id = uniqueId(world.objects, slugify(step.makes ?? `a ${seedMaterial} plant`))
      const plant = WorldObject.parse({
        id,
        kind: 'plant',
        name: (step.makes ?? `a ${seedMaterial} plant`).trim().slice(0, 60),
        position: placeBeside(t, world.position, rng),
        model: {
          parts: [
            { shape: 'cylinder', size: [0.05, 0.3, 0.05], at: [0, 0.15, 0], color: '#4f7d3a' },
            { shape: 'sphere', size: [0.18, 0.18, 0.18], at: [0, 0.36, 0], color: materialColor(gives) },
          ],
        },
        properties: { size: 0.45, weightKg: 0.5, soft: true, material: gives },
        grows: { hours: GROW_HOURS, gives },
        state: { plantedAt: at },
        made: { verb: verb.id, materials: [seedMaterial], skill: opts.skill, sessions: 1, needed: 1, done: true, at, seed: opts.seed >>> 0 },
        reason: step.reason,
      })
      return done({ ...world, holding: have.holding, stored: have.stored, objects: [...world.objects, plant] }, [id], [], [{ kind: 'planted', objectId: id, material: seedMaterial }])
    }

    case 'water': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      if (!t.grows) return fail(`"${t.id}" is not something that grows`)
      if (t.state.wateredAt) return fail(`"${t.id}" is already watered`)
      const updated: WorldObject = { ...t, state: { ...t.state, wateredAt: at } }
      return done({ ...world, objects: replace(world.objects, updated) }, [t.id], [], [{ kind: 'watered', objectId: t.id }])
    }

    case 'harvest': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      if (!t.grows) return fail(`"${t.id}" is not something that grows`)
      if (objectStatusAt(t, opts.nowMs).stage !== 'ripe') return fail(`"${t.id}" is not ripe yet`)
      const { gives } = t.grows
      return done(
        { ...world, holding: { material: gives }, objects: world.objects.filter((o) => o.id !== t.id) },
        [],
        [t.id],
        [{ kind: 'harvested', objectId: t.id, material: gives }],
      )
    }

    case 'cook': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      const have = gather(step.materials)
      if (typeof have === 'string') return fail(have)
      if (crowded()) return fail(`the island is already full of made things (${MAX_MADE_OBJECTS})`)
      const name = (step.makes ?? 'a hot meal').trim().slice(0, 60)
      const id = uniqueId(world.objects, slugify(name))
      const dish = WorldObject.parse({
        id,
        kind: 'dish',
        name,
        position: placeBeside(t, world.position, rng),
        model: {
          parts: [
            { shape: 'cylinder', size: [0.28, 0.08, 0.28], at: [0, 0.04, 0], color: materialColor('dish') },
            { shape: 'sphere', size: [0.2, 0.1, 0.2], at: [0, 0.12, 0], color: materialColor(have.materials[0]!) },
          ],
        },
        properties: madeProperties(['dish'], 0.3),
        spoilsAfterHours: DISH_HOURS,
        state: { cookedAt: at },
        made: { verb: verb.id, materials: have.materials, skill: opts.skill, sessions: 1, needed: 1, done: true, at, seed: opts.seed >>> 0 },
        reason: step.reason,
      })
      return done({ ...world, holding: have.holding, stored: have.stored, objects: [...world.objects, dish] }, [id], [], [{ kind: 'cooked', objectId: id }])
    }

    case 'eat': {
      const t = needTarget()
      if (typeof t === 'string') return fail(t)
      if (!t.properties.edible) return fail(`"${t.id}" is not food`)
      const kind = objectStatusAt(t, opts.nowMs).spoiled ? 'ateSpoiled' : 'ate'
      // Food that can be carried is used up; a bowl that stays on the floor is not.
      if (t.properties.carryable) {
        return done({ ...world, objects: world.objects.filter((o) => o.id !== t.id) }, [], [t.id], [{ kind, objectId: t.id }])
      }
      return done(world, [], [], [{ kind, objectId: t.id }])
    }
  }
}
