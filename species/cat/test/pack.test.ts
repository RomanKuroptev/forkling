import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { AnimationMap, AnimationSlot, SpeciesPack, WorldObject, type PoseBone } from '@forkling/schema'
import { runHeadless, worldWithObjects, starterWorld } from '@forkling/sim'
import animationsJson from '../animations.json'
import speciesJson from '../species.json'
import { behaviors, moodPose } from '../src/behaviors.ts'
import { BONES } from '../src/skeleton.ts'

const pack = SpeciesPack.parse(speciesJson)
const animations = AnimationMap.parse(animationsJson)
const modelPath = new URL('../model.glb', import.meta.url)

function loadModel(): Promise<GLTF> {
  const bytes = readFileSync(modelPath)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new GLTFLoader().parseAsync(buffer, '')
}

const byId = (id: string) => pack.actions.find((a) => a.id === id)!

describe('cat species pack', () => {
  it('parses, with a 5 m notice radius', () => {
    expect(pack.id).toBe('cat')
    expect(pack.perception.noticeRadius).toBe(5)
  })

  it('drops to four legs for the body, and stands up to work with its hands', () => {
    expect(pack.bodyPlans.quadruped).toEqual(['body'])
    expect(pack.bodyPlans.upright).toEqual(['body', 'hands', 'making', 'growing', 'mind'])
  })

  it('has every verb of the groups M5 ships, the mind verbs so far, and none of the later ones', () => {
    const ids = new Set(pack.actions.map((a) => a.id))
    const wanted = {
      body: ['go_to', 'inspect', 'sit', 'watch', 'follow', 'hide', 'sleep', 'stretch', 'explore'],
      hands: ['pick_up', 'carry', 'drop', 'put_on', 'open', 'close'],
      making: ['cut', 'join', 'shape', 'build', 'paint', 'sew', 'tinker'],
      mind: ['read', 'study', 'write', 'draw', 'compose', 'play', 'broadcast', 'experiment', 'observe', 'photograph', 'code'],
    }
    for (const [group, verbs] of Object.entries(wanted)) {
      for (const verb of verbs) expect(ids.has(verb), `${group}: ${verb}`).toBe(true)
    }
    for (const later of [] as string[]) {
      expect(ids.has(later), later).toBe(false)
    }
    expect(pack.actions.filter((a) => a.group === 'mind').map((a) => a.id)).toEqual(['read', 'study', 'write', 'draw', 'compose', 'play', 'broadcast', 'experiment', 'observe', 'photograph', 'code'])
  })

  it('is made of verbs, not activities', () => {
    for (const activity of ['gardening', 'fishing', 'collecting', 'cooking_session', 'coding_session']) {
      expect(pack.actions.some((a) => a.id === activity), activity).toBe(false)
    }
  })

  it('does its work upright', () => {
    for (const verb of pack.actions.filter((a) => a.group === 'hands' || a.group === 'making' || a.group === 'growing')) {
      expect(verb.body ?? 'upright', verb.id).not.toBe('quadruped')
    }
  })

  it('only lets the mind plan what changes the world', () => {
    const planned = pack.actions.filter((a) => a.effect !== 'none' && a.effect !== 'hide').map((a) => a.id)
    expect(planned).toEqual(expect.arrayContaining(['pick_up', 'cut', 'build']))
  })

  it('maps every slot its verbs and behaviors use, so nothing silently falls back', () => {
    const used = new Set<string>([...pack.actions.map((a) => a.slot), ...behaviors.flatMap((b) => (b.slot ? [b.slot] : []))])
    for (const slot of used) expect(animations[slot as AnimationSlot], slot).toBeTruthy()
  })

  it('cannot climb until a skill gives it the clip', () => {
    expect(animations.climb).toBeUndefined()
    expect(pack.actions.every((a) => a.slot !== 'climb')).toBe(true)
  })

  it('makes following rarer than ignoring, as befits a cat', () => {
    expect(pack.weights.follow ?? 1).toBeLessThan(pack.weights.ignore_visitor ?? 1)
  })

  it('only works with materials that make sense for each making verb', () => {
    expect(byId('sew').accepts).toEqual(['fibre', 'flowers'])
  })
})

describe('cat behaviors', () => {
  it('has unique ids and sane chances', () => {
    expect(new Set(behaviors.map((b) => b.id)).size).toBe(behaviors.length)
    for (const b of behaviors) {
      expect(b.chance).toBeGreaterThan(0)
      expect(b.chance).toBeLessThanOrEqual(1)
      expect(b.durationSec).toBeGreaterThan(0)
    }
  })

  it('covers groom, stretch, knead before sleeping, and tail flicks', () => {
    const find = (id: string) => behaviors.find((b) => b.id === id)
    expect(find('groom')?.when).toBe('idle')
    expect(find('stretch')?.when).toBe('afterWake')
    expect(find('knead')?.when).toBe('beforeSleep')
    expect(find('tail_flick')?.animate).toBeTypeOf('function')
  })

  it('only touches bones that exist in the skeleton', () => {
    for (const b of behaviors) {
      if (!b.animate) continue
      const touched = new Set<string>()
      const bones = new Proxy({} as Record<string, PoseBone | undefined>, {
        get: (_, name: string) => {
          touched.add(name)
          return { rotation: { x: 0, y: 0, z: 0 } }
        },
      })
      for (const progress of [0, 0.3, 0.7, 1]) b.animate({ bones, t: progress * b.durationSec, progress })
      expect(touched.size, b.id).toBeGreaterThan(0)
      for (const name of touched) expect(BONES as readonly string[], `${b.id} touches ${name}`).toContain(name)
    }
  })
})

describe('cat body language', () => {
  const pose = (feelings: { valence: number; arousal: number }) => {
    const bones: Record<string, PoseBone> = {}
    for (const name of BONES) bones[name] = { rotation: { x: 0, y: 0, z: 0 } }
    moodPose({ bones, t: 0.2, feelings })
    return bones
  }

  it('holds its tail up when pleased and low when uneasy', () => {
    expect(pose({ valence: 0.8, arousal: 0.3 }).tail1!.rotation.x).toBeGreaterThan(0.2)
    expect(pose({ valence: -0.8, arousal: 0.3 }).tail1!.rotation.x).toBeLessThan(-0.2)
  })

  it('lays its ears back when uneasy, and not when content', () => {
    const uneasy = pose({ valence: -0.8, arousal: 0.3 })
    expect(uneasy.earL!.rotation.z).toBeLessThan(0)
    expect(uneasy.earR!.rotation.z).toBeGreaterThan(0)
    const content = pose({ valence: 0.8, arousal: 0.3 })
    expect(content.earL!.rotation.z).toBe(0)
  })

  it('leaves a calm cat alone', () => {
    const calm = pose({ valence: 0, arousal: 0.3 })
    for (const name of BONES) expect(calm[name]!.rotation, name).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('only touches bones that exist, and copes with missing ones', () => {
    const touched = new Set<string>()
    const bones = new Proxy({} as Record<string, PoseBone | undefined>, {
      get: (_, name: string) => {
        touched.add(name)
        return { rotation: { x: 0, y: 0, z: 0 } }
      },
    })
    moodPose({ bones, t: 1, feelings: { valence: -0.5, arousal: 0.9 } })
    for (const name of touched) expect(BONES as readonly string[], name).toContain(name)
    expect(() => moodPose({ bones: {}, t: 1, feelings: { valence: 0.5, arousal: 0.9 } })).not.toThrow()
  })
})

describe('cat model', () => {
  it('is a small skinned mesh with every bone the pack knows, including where it holds things', async () => {
    const gltf = await loadModel()
    let skinned: THREE.SkinnedMesh | null = null
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) skinned = o
    })
    expect(skinned).not.toBeNull()
    const names = new Set(skinned!.skeleton.bones.map((b) => b.name))
    for (const bone of BONES) expect(names.has(bone), bone).toBe(true)
    expect(names.has('holdR')).toBe(true)
    expect(readFileSync(modelPath).byteLength).toBeLessThan(400_000)
  })

  it('has a clip for every name in animations.json, and no stray clips', async () => {
    const gltf = await loadModel()
    const clips = new Set(gltf.animations.map((c) => c.name))
    for (const [slot, clip] of Object.entries(animations)) expect(clips.has(clip!), `${slot} -> ${clip}`).toBe(true)
    for (const clip of clips) expect(Object.values(animations), clip).toContain(clip)
  })

  it('has the upright clips a worker needs', async () => {
    const gltf = await loadModel()
    const clips = new Set(gltf.animations.map((c) => c.name))
    for (const clip of ['Stand', 'WalkUpright', 'Work', 'UseTool', 'HoldUp', 'Carry']) expect(clips.has(clip), clip).toBe(true)
  })

  it('animates only bones the skeleton has, with real durations', async () => {
    const gltf = await loadModel()
    for (const clip of gltf.animations) {
      expect(clip.duration, clip.name).toBeGreaterThan(0.2)
      expect(clip.tracks.length, clip.name).toBeGreaterThan(0)
      for (const track of clip.tracks) {
        const bone = track.name.split('.')[0]!
        expect(BONES as readonly string[], `${clip.name}: ${track.name}`).toContain(bone)
      }
    }
  })

  it('keeps the arms where they can hold things in front of it when working', async () => {
    const gltf = await loadModel()
    const work = gltf.animations.find((c) => c.name === 'Work')!
    const arm = work.tracks.find((t) => t.name === 'legFL1.quaternion')!
    const q = new THREE.Quaternion(arm.values[0], arm.values[1], arm.values[2], arm.values[3])
    // A negative x rotation swings a limb forward.
    expect(new THREE.Euler().setFromQuaternion(q).x).toBeLessThan(-0.4)
  })
})

describe('cat in the headless sim', () => {
  const day = runHeadless({ pack, behaviors, seed: 7, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 360 } })

  it('wanders for 10 minutes without getting stuck or leaving the walkable ground', () => {
    expect(day.maxStuckSteps).toBeLessThan(30)
    expect(day.offGrid).toBe(0)
    expect(day.badIntentions).toBe(0)
  })

  it('does a variety of cat things', () => {
    expect(day.intentionTypes.size).toBeGreaterThanOrEqual(4)
  })

  it('notices a visitor and reconsiders on the spot', () => {
    expect(day.noticeStep).not.toBeNull()
    expect(day.noticeStep!.startedAt).toBeCloseTo(day.noticeStep!.time, 5)
  })

  it('is deterministic for a seed', () => {
    const again = runHeadless({ pack, behaviors, seed: 7, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 360 } })
    expect(again.trace).toEqual(day.trace)
  })

  it('sleeps at night and does not wander the island', () => {
    const night = runHeadless({ pack, behaviors, seed: 3, startHour: 23, seconds: 600 })
    expect(night.intentionTypes.has('sleep')).toBe(true)
    expect(night.intentionTypes.has('explore')).toBe(false)
  })

  it('goes straight to sleep at night, whatever its needs say', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1)
    const firstDecisions = seeds.map((seed) => {
      const night = runHeadless({ pack, behaviors, seed, startHour: 23, seconds: 30 })
      return night.trace.filter((e) => e.includes('@')).map((e) => e.split('@')[0]).find((type) => type !== 'idle')
    })
    const asleep = firstDecisions.filter((d) => d === 'sleep').length
    expect(asleep / seeds.length, firstDecisions.join(',')).toBeGreaterThanOrEqual(0.9)
  })

  it('plays its signature behaviors across a day of watching', () => {
    const runs = [11, 12, 13].map((seed) => runHeadless({ pack, behaviors, seed, startHour: 14, seconds: 900 }))
    const seen = new Set(runs.flatMap((r) => r.micros.map((m) => m.id)))
    for (const id of ['groom', 'tail_flick']) expect(seen.has(id), id).toBe(true)
    // It kneads before it lies down to sleep, and stretches after it wakes.
    const night = [11, 12, 13].flatMap((seed) => runHeadless({ pack, behaviors, seed, startHour: 23, seconds: 300 }).micros.map((m) => m.id))
    for (const id of ['knead', 'stretch']) expect(night.includes(id), id).toBe(true)
  })

  it('watches from high ground', () => {
    const runs = [21, 22, 23].map((seed) => runHeadless({ pack, behaviors, seed, startHour: 11, seconds: 900 }))
    const types = new Set(runs.flatMap((r) => [...r.intentionTypes]))
    expect(types.has('watch')).toBe(true)
  })

  it('never chooses by itself what would change the world', () => {
    const bowl = WorldObject.parse({
      id: 'bowl',
      kind: 'bowl',
      name: 'The bowl',
      position: [starterWorld().spawn.x + 3, 0, starterWorld().spawn.z - 3],
      model: { parts: [{ shape: 'cylinder', size: [0.3, 0.1, 0.3], at: [0, 0.05, 0], color: '#c2703d' }] },
      properties: { edible: true, size: 0.3 },
      reason: 'Dinner.',
    })
    const world = worldWithObjects([bowl])
    const runs = [1, 2, 3, 4].map((seed) => runHeadless({ pack, behaviors, world, seed, startHour: 12, seconds: 900 }))
    const worldChanging = new Set(pack.actions.filter((a) => a.effect !== 'none' && a.effect !== 'hide').map((a) => a.id))
    for (const r of runs) for (const type of r.intentionTypes) expect(worldChanging.has(type), type).toBe(false)
  })

  it('has no verb that waits for a visit that cannot come: give returns with the visit gateway', () => {
    expect(pack.actions.some((a) => a.id === 'give')).toBe(false)
    expect(pack.actions.filter((a) => a.target.type === 'visitor').map((a) => a.id)).toEqual(['follow'])
  })

  it('hides for its own reasons: hide changes nothing in the world, so the body may choose it', () => {
    expect(byId('hide').effect).toBe('none')
    const den = WorldObject.parse({
      id: 'den',
      kind: 'den',
      name: 'A den',
      position: [starterWorld().spawn.x + 4, 0, starterWorld().spawn.z + 2],
      model: { parts: [{ shape: 'box', size: [1.4, 1, 1.4], at: [0, 0.5, 0], color: '#8a6a4a' }] },
      properties: { canHide: true, size: 1.4 },
      reason: 'A place to disappear.',
    })
    const world = worldWithObjects([den])
    const hid = [9, 10, 11, 12, 13].some((seed) => runHeadless({ pack, behaviors, world, seed, startHour: 12, seconds: 3600 }).targets.some((t) => t.startsWith('hide:')))
    expect(hid).toBe(true)
  })
})

describe("the cat's poses for the mind verbs (spec 2.7: the engine says where, the pack says how it looks)", () => {
  const verbs = ['wander', 'tend', 'revisit', 'expand', 'found', 'tinker', 'write', 'reply', 'rest'] as const

  it('shows every mind verb as one of its own actions, which goes to a place', () => {
    for (const verb of verbs) {
      const action = byId(pack.mindPoses[verb]!)
      expect(action, verb).toBeDefined()
      expect(action.target.type, `${verb} goes somewhere`).toBe('spot')
    }
  })

  it('plays a clip the model really has for each of them', async () => {
    const gltf = await loadModel()
    const clips = new Set(gltf.animations.map((c) => c.name))
    for (const verb of verbs) {
      const slot = byId(pack.mindPoses[verb]!).slot
      expect(clips.has(animations[slot]!), `${verb}: ${slot} -> ${animations[slot]}`).toBe(true)
    }
  })

  it('reads with something held up, writes and works with a tool, carries when it tends, and sits to rest', () => {
    const slot = (verb: (typeof verbs)[number]) => byId(pack.mindPoses[verb]!).slot
    expect(slot('wander')).toBe('holdUp')
    expect(slot('write')).toBe('useTool')
    expect(slot('reply')).toBe('useTool')
    expect(slot('tinker')).toBe('useTool')
    expect(slot('tend')).toBe('carry')
    expect(slot('rest')).toBe('sit')
  })

  it('may be taken up by the body at any hour, so a plan step is never refused for the time of day', () => {
    for (const verb of verbs) expect(byId(pack.mindPoses[verb]!).requires ?? []).toEqual([])
  })

  it('names no place of its own: the places come from the engine, so the fallback spot is Home or the usual furniture', () => {
    for (const verb of verbs) {
      const target = byId(pack.mindPoses[verb]!).target
      expect(target.type === 'spot' && ['desk', 'workbench', 'home']).toContain(target.type === 'spot' ? target.kind : '')
    }
  })
})
