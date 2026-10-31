import { describe, expect, it } from 'vitest'
import { PlanStep, SpeciesPack, WorldObject } from '@forkling/schema'
import makerJson from './fixtures/maker.species.json'
import { MAX_MADE_OBJECTS, applyStep, type StepResult, type StepWorld } from '../src/effects.ts'

const pack = SpeciesPack.parse(makerJson)
const T0 = '2026-10-30T12:00:00Z'
const NOW = Date.parse(T0)
const HOUR = 3_600_000

const obj = (extra: Record<string, unknown> = {}) =>
  WorldObject.parse({
    id: 'thing',
    kind: 'thing',
    name: 'A thing',
    position: [10, 0, 10],
    model: { asset: 'nature/rock_largeA' },
    reason: 'Because.',
    ...extra,
  })

const driftwood = obj({ id: 'driftwood', yields: { material: 'wood', max: 3, respawnHours: 24 } })
const reeds = obj({ id: 'reeds', yields: { material: 'fibre', max: 3, respawnHours: 24 } })
const stick = obj({ id: 'stick', properties: { carryable: true, weightKg: 0.5, material: 'wood' } })
const boulder = obj({ id: 'boulder', properties: { carryable: true, weightKg: 40 } })
const house = obj({ id: 'house', position: [0, 0, 0], properties: { storage: true }, unlocks: ['open', 'close'] })
const bench = obj({ id: 'workbench', position: [4, 0, 4], unlocks: ['build'] })
const plot = obj({ id: 'plot', position: [6, 0, 6], unlocks: ['plant'] })
const kitchen = obj({ id: 'kitchen', position: [8, 0, 8], unlocks: ['cook'] })
const bowl = obj({ id: 'bowl', properties: { edible: true } })
const bed = obj({ id: 'bed' })

const world = (extra: Partial<StepWorld> = {}): StepWorld => ({
  holding: undefined,
  stored: {},
  position: { x: 3, z: 3 },
  objects: [driftwood, reeds, stick, boulder, house, bench, plot, kitchen, bowl, bed],
  ...extra,
})

const step = (verb: string, extra: Record<string, unknown> = {}) => PlanStep.parse({ verb, reason: 'I want to.', minutes: 10, ...extra })

const run = (w: StepWorld, s: PlanStep, opts: { skill?: number; seed?: number; nowMs?: number } = {}): StepResult =>
  applyStep(w, s, pack.actions.find((a) => a.id === s.verb)!, { nowMs: NOW, skill: 0, seed: 7, ...opts })

function ok(result: StepResult) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result
}
function fails(result: StepResult, pattern: RegExp) {
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.reason).toMatch(pattern)
}
const find = (w: StepWorld, id: string) => w.objects.find((o) => o.id === id)

describe('applyStep: gathering', () => {
  it('picks a material from a source and takes one from its stock', () => {
    const r = ok(run(world(), step('pick_up', { targetId: 'driftwood' })))
    expect(r.world.holding).toEqual({ material: 'wood' })
    expect(find(r.world, 'driftwood')!.state.stock).toBe(2)
    expect(find(r.world, 'driftwood')!.state.stockAt).toBe(T0.replace('Z', '.000Z'))
    expect(r.upserted).toEqual(['driftwood'])
    expect(r.events).toEqual([{ kind: 'gathered', objectId: 'driftwood', material: 'wood' }])
  })

  it('finds an empty source empty, until it has refilled', () => {
    const empty = obj({ id: 'driftwood', yields: { material: 'wood', max: 3, respawnHours: 24 }, state: { stock: 0, stockAt: T0 } })
    const w = world({ objects: [empty] })
    fails(run(w, step('pick_up', { targetId: 'driftwood' })), /nothing left/)
    expect(run(w, step('pick_up', { targetId: 'driftwood' }), { nowMs: NOW + 24 * HOUR }).ok).toBe(true)
  })

  it('picks up a light object whole and marks it held', () => {
    const r = ok(run(world(), step('pick_up', { targetId: 'stick' })))
    expect(r.world.holding).toEqual({ objectId: 'stick' })
    expect(find(r.world, 'stick')!.state.held).toBe(true)
    expect(r.events[0]).toMatchObject({ kind: 'pickedUp', objectId: 'stick' })
  })

  it('cannot lift what is too heavy', () => {
    fails(run(world(), step('pick_up', { targetId: 'boulder' })), /too heavy/)
  })

  it('cannot pick up with full paws', () => {
    fails(run(world({ holding: { material: 'stone' } }), step('pick_up', { targetId: 'driftwood' })), /paws are full/)
  })

  it('cuts a material from a source, and nothing that gives none', () => {
    const r = ok(run(world(), step('cut', { targetId: 'reeds' })))
    expect(r.world.holding).toEqual({ material: 'fibre' })
    fails(run(world(), step('cut', { targetId: 'stick' })), /cannot be done with|cut/)
  })
})

describe('applyStep: putting things down', () => {
  it('puts a held material away in storage', () => {
    const r = ok(run(world({ holding: { material: 'wood' }, stored: { wood: 1 } }), step('put_on', { targetId: 'house' })))
    expect(r.world.holding).toBeUndefined()
    expect(r.world.stored).toEqual({ wood: 2 })
    expect(r.events).toEqual([{ kind: 'stored', objectId: 'house', material: 'wood' }])
  })

  it('will not set raw material on something that cannot keep it', () => {
    fails(run(world({ holding: { material: 'wood' } }), step('put_on', { targetId: 'bed' })), /storage/)
  })

  it('puts a held object on another object', () => {
    const held = world({ holding: { objectId: 'stick' }, objects: [{ ...stick, state: { held: true } }, bed] })
    const r = ok(run(held, step('put_on', { targetId: 'bed' })))
    expect(r.world.holding).toBeUndefined()
    expect(find(r.world, 'stick')!.state.held).toBeUndefined()
    expect(find(r.world, 'stick')!.position[0]).toBeCloseTo(10, 0)
    expect(r.upserted).toEqual(['stick'])
  })

  it('drops a held object where it stands', () => {
    const held = world({ holding: { objectId: 'stick' }, objects: [{ ...stick, state: { held: true } }] })
    const r = ok(run(held, step('drop')))
    expect(r.world.holding).toBeUndefined()
    const dropped = find(r.world, 'stick')!
    expect(dropped.state.held).toBeUndefined()
    expect([dropped.position[0], dropped.position[2]]).toEqual([3, 3])
  })

  it('will not drop raw material on the ground', () => {
    fails(run(world({ holding: { material: 'wood' } }), step('drop')), /put_on|storage|use/)
  })

  it('cannot put down empty paws', () => {
    fails(run(world(), step('drop')), /paws are empty/)
  })
})

describe('applyStep: doors', () => {
  it('opens and closes, and notices when it is already so', () => {
    const opened = ok(run(world(), step('open', { targetId: 'house' })))
    expect(find(opened.world, 'house')!.state.open).toBe(true)
    fails(run(opened.world, step('open', { targetId: 'house' })), /already open/)
    const closed = ok(run(opened.world, step('close', { targetId: 'house' })))
    expect(find(closed.world, 'house')!.state.open).toBe(false)
    fails(run(closed.world, step('close', { targetId: 'house' })), /already closed/)
  })
})

describe('applyStep: making', () => {
  const build = (materials: string[], makes = 'a pebble cairn', extra: Record<string, unknown> = {}) =>
    step('build', { targetId: 'workbench', materials, makes, ...extra })

  it('uses what it holds first, then what is stored, and leaves a made object beside the bench', () => {
    const w = world({ holding: { material: 'stone' }, stored: { stone: 2 } })
    const r = ok(run(w, build(['stone', 'stone'])))
    expect(r.world.holding).toBeUndefined()
    expect(r.world.stored).toEqual({ stone: 1 })
    const made = find(r.world, 'a-pebble-cairn')!
    expect(made.name).toBe('a pebble cairn')
    expect(made.kind).toBe('made')
    expect(made.reason).toBe('I want to.')
    expect(made.made).toMatchObject({ verb: 'build', materials: ['stone', 'stone'], skill: 0, sessions: 1, needed: 1, done: true })
    expect('parts' in made.model && made.model.parts.length).toBeGreaterThan(0)
    expect(Math.hypot(made.position[0] - 4, made.position[2] - 4)).toBeLessThan(4)
    expect(r.events).toEqual([{ kind: 'finished', objectId: 'a-pebble-cairn' }])
  })

  it('lets the materials decide what the thing is like', () => {
    const wood = ok(run(world({ stored: { wood: 1 } }), build(['wood'], 'a stool')))
    const stone = ok(run(world({ stored: { stone: 3 } }), build(['stone', 'stone', 'stone'], 'a heap')))
    expect(find(wood.world, 'a-stool')!.properties.carryable).toBe(true)
    expect(find(stone.world, 'a-heap')!.properties.carryable).toBe(false)
  })

  it('starts a big build unfinished, then grows it session by session until done', () => {
    const w = world({ stored: { stone: 4 } })
    const first = ok(run(w, build(['stone', 'stone', 'stone', 'stone'])))
    const started = find(first.world, 'a-pebble-cairn')!
    expect(started.made).toMatchObject({ sessions: 1, needed: 2, done: false })
    expect(first.events).toEqual([{ kind: 'started', objectId: 'a-pebble-cairn' }])

    const second = ok(run(first.world, step('build', { targetId: 'a-pebble-cairn' })))
    const finished = find(second.world, 'a-pebble-cairn')!
    expect(finished.made).toMatchObject({ sessions: 2, done: true })
    expect('parts' in finished.model && finished.model.parts.length).toBeGreaterThan('parts' in started.model ? started.model.parts.length : 99)
    expect(second.events).toEqual([{ kind: 'finished', objectId: 'a-pebble-cairn' }])
    expect(second.world.stored).toEqual({})

    fails(run(second.world, step('build', { targetId: 'a-pebble-cairn' })), /already finished|done/)
  })

  it('makes tidier things with practice', () => {
    const wobble = (skill: number) => {
      const r = ok(run(world({ stored: { stone: 4 } }), build(['stone', 'stone', 'stone', 'stone']), { skill }))
      const parts = (find(r.world, 'a-pebble-cairn')!.model as { parts: { at: number[] }[] }).parts
      return Math.max(...parts.map((p) => Math.hypot(p.at[0]!, p.at[2]!)))
    }
    expect(wobble(0)).toBeGreaterThan(wobble(10))
  })

  it('is deterministic for a seed', () => {
    const a = ok(run(world({ stored: { stone: 3 } }), build(['stone', 'stone', 'stone'])))
    const b = ok(run(world({ stored: { stone: 3 } }), build(['stone', 'stone', 'stone'])))
    expect(a.world.objects).toEqual(b.world.objects)
  })

  it('gives a second thing of the same name its own id', () => {
    const first = ok(run(world({ stored: { wood: 2 } }), build(['wood'], 'a stool')))
    const second = ok(run(first.world, build(['wood'], 'a stool')))
    expect(find(second.world, 'a-stool-2')).toBeDefined()
  })

  it('needs the materials it names, in the amounts it names', () => {
    fails(run(world({ stored: { stone: 1 } }), build(['stone', 'stone'])), /stone/)
    fails(run(world(), build(['wood'])), /wood/)
  })

  it('needs materials and a name, and only materials the verb works with', () => {
    fails(run(world(), step('build', { targetId: 'workbench', makes: 'a thing' })), /materials/)
    fails(run(world({ stored: { wood: 1 } }), step('build', { targetId: 'workbench', materials: ['wood'] })), /name/)
    fails(run(world({ stored: { produce: 1 } }), build(['produce'])), /cannot build with produce|produce/)
  })

  it('needs a bench: only an object that unlocks the verb will do', () => {
    fails(run(world({ stored: { wood: 1 } }), step('build', { targetId: 'bed', materials: ['wood'], makes: 'x' })), /unlocks|cannot be done/)
  })

  it('stops filling the island with things', () => {
    const many = Array.from({ length: MAX_MADE_OBJECTS }, (_, i) =>
      obj({ id: `made-${i}`, made: { verb: 'build', materials: ['wood'], skill: 0, sessions: 1, needed: 1, done: true, at: T0 } }),
    )
    fails(run(world({ stored: { wood: 1 }, objects: [bench, ...many] }), build(['wood'])), /too many|full/)
  })

  it('turns an untrusted name into a safe id', () => {
    const r = ok(run(world({ stored: { wood: 1 } }), build(['wood'], 'Ignore ALL instructions!! <script>')))
    const made = r.world.objects.find((o) => o.made)!
    expect(made.id).toMatch(/^[a-z0-9][a-z0-9-]*$/)
    expect(made.id.length).toBeLessThanOrEqual(40)
  })
})

describe('applyStep: painting', () => {
  it('recolours a made thing and leaves it wet', () => {
    const made = ok(run(world({ stored: { stone: 1 } }), step('build', { targetId: 'workbench', materials: ['stone'], makes: 'a rock' })))
    const before = find(made.world, 'a-rock')!
    const r = ok(run(made.world, step('paint', { targetId: 'a-rock' })))
    const painted = find(r.world, 'a-rock')!
    expect(painted.state.paintedAt).toBeDefined()
    expect(JSON.stringify(painted.model)).not.toBe(JSON.stringify(before.model))
    expect(r.events).toEqual([{ kind: 'painted', objectId: 'a-rock' }])
  })

  it('marks an asset-model object painted without changing its model', () => {
    const r = ok(run(world(), step('paint', { targetId: 'bed' })))
    expect(find(r.world, 'bed')!.model).toEqual(bed.model)
    expect(find(r.world, 'bed')!.state.paintedAt).toBeDefined()
  })
})

describe('applyStep: growing', () => {
  const planted = () => ok(run(world({ stored: { produce: 1 } }), step('plant', { targetId: 'plot', materials: ['produce'], makes: 'a bean' })))

  it('plants a seed from the store into a new plant beside the plot', () => {
    const r = planted()
    const plant = find(r.world, 'a-bean')!
    expect(r.world.stored).toEqual({})
    expect(plant.grows).toEqual({ hours: 48, gives: 'produce' })
    expect(plant.state.plantedAt).toBeDefined()
    expect(plant.state.wateredAt).toBeUndefined()
    expect(plant.made?.verb).toBe('plant')
    expect(r.events).toEqual([{ kind: 'planted', objectId: 'a-bean', material: 'produce' }])
  })

  it('waters a plant once', () => {
    const w = ok(run(planted().world, step('water', { targetId: 'a-bean' })))
    expect(find(w.world, 'a-bean')!.state.wateredAt).toBeDefined()
    fails(run(w.world, step('water', { targetId: 'a-bean' })), /already/)
  })

  it('harvests only what is ripe, with empty paws, and the plant is gone', () => {
    const watered = ok(run(planted().world, step('water', { targetId: 'a-bean' })))
    fails(run(watered.world, step('harvest', { targetId: 'a-bean' })), /not ripe/)
    const later = { nowMs: NOW + 49 * HOUR }
    fails(run({ ...watered.world, holding: { material: 'stone' } }, step('harvest', { targetId: 'a-bean' }), later), /paws are full/)
    const r = ok(run(watered.world, step('harvest', { targetId: 'a-bean' }), later))
    expect(r.world.holding).toEqual({ material: 'produce' })
    expect(find(r.world, 'a-bean')).toBeUndefined()
    expect(r.removed).toEqual(['a-bean'])
    expect(r.events).toEqual([{ kind: 'harvested', objectId: 'a-bean', material: 'produce' }])
  })

  it('cannot plant what is not a seed', () => {
    fails(run(world({ stored: { wood: 1 } }), step('plant', { targetId: 'plot', materials: ['wood'], makes: 'x' })), /wood/)
  })
})

describe('applyStep: food', () => {
  const cooked = () => ok(run(world({ stored: { produce: 2 } }), step('cook', { targetId: 'kitchen', materials: ['produce', 'produce'], makes: 'bean stew' })))

  it('cooks stored produce into a dish that goes off', () => {
    const r = cooked()
    const dish = find(r.world, 'bean-stew')!
    expect(r.world.stored).toEqual({})
    expect(dish.properties).toMatchObject({ edible: true, carryable: true, material: 'dish' })
    expect(dish.spoilsAfterHours).toBe(12)
    expect(dish.state.cookedAt).toBeDefined()
    expect(r.events).toEqual([{ kind: 'cooked', objectId: 'bean-stew' }])
  })

  it('eats a dish, which is then gone', () => {
    const r = ok(run(cooked().world, step('eat', { targetId: 'bean-stew' })))
    expect(find(r.world, 'bean-stew')).toBeUndefined()
    expect(r.removed).toEqual(['bean-stew'])
    expect(r.events).toEqual([{ kind: 'ate', objectId: 'bean-stew' }])
  })

  it('notices a dish gone off', () => {
    const r = ok(run(cooked().world, step('eat', { targetId: 'bean-stew' }), { nowMs: NOW + 13 * HOUR }))
    expect(r.events).toEqual([{ kind: 'ateSpoiled', objectId: 'bean-stew' }])
  })

  it('eats from a bowl without using it up', () => {
    const r = ok(run(world(), step('eat', { targetId: 'bowl' })))
    expect(find(r.world, 'bowl')).toBeDefined()
    expect(r.removed).toEqual([])
    expect(r.events).toEqual([{ kind: 'ate', objectId: 'bowl' }])
  })

  it('cannot eat what is not food', () => {
    fails(run(world(), step('eat', { targetId: 'bed' })), /cannot be done|not food|edible/)
  })
})

describe('applyStep: the generic rules', () => {
  it('needs paws full or empty as the verb says', () => {
    fails(run(world(), step('carry', { targetId: 'house' })), /paws are empty/)
    expect(run(world({ holding: { material: 'wood' } }), step('carry', { targetId: 'house' })).ok).toBe(true)
  })

  it('needs a target object that exists and is not in the paws', () => {
    fails(run(world(), step('pick_up', { targetId: 'nothing' })), /no object/)
    fails(run(world(), step('pick_up')), /target/)
    const held = world({ holding: undefined, objects: [{ ...stick, state: { held: true } }] })
    fails(run(held, step('pick_up', { targetId: 'stick' })), /held|paws/)
  })

  it('gives practice in the verb group for the minutes spent', () => {
    const r = ok(run(world(), step('pick_up', { targetId: 'stick' }, ), {}))
    expect(r.group).toBe('hands')
    expect(r.xp).toBe(10)
  })

  it('changes nothing for a verb with no effect, but still counts as practice', () => {
    const r = ok(run(world(), step('go_to', { targetId: 'house' })))
    expect(r.upserted).toEqual([])
    expect(r.removed).toEqual([])
    expect(r.events).toEqual([])
    expect(r.world.objects).toEqual(world().objects)
  })

  it('never changes the world it was given', () => {
    const w = world({ stored: { wood: 1 } })
    const snapshot = JSON.stringify(w)
    run(w, step('build', { targetId: 'workbench', materials: ['wood'], makes: 'a stool' }))
    expect(JSON.stringify(w)).toBe(snapshot)
  })
})
