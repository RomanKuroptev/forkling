import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { AnimationMap, AnimationSlot, SpeciesPack, type PoseBone } from '@forkling/schema'
import { runHeadless } from '@forkling/sim'
import animationsJson from '../animations.json'
import speciesJson from '../species.json'
import { behaviors } from '../src/behaviors.ts'
import { BONES } from '../src/skeleton.ts'

const pack = SpeciesPack.parse(speciesJson)
const animations = AnimationMap.parse(animationsJson)
const modelPath = new URL('../model.glb', import.meta.url)

function loadModel(): Promise<GLTF> {
  const bytes = readFileSync(modelPath)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new GLTFLoader().parseAsync(buffer, '')
}

describe('cat species pack', () => {
  it('parses, with the milestone needs and a 5 m notice radius', () => {
    expect(pack.id).toBe('cat')
    expect(Object.keys(pack.needs).sort()).toEqual(['affection', 'curiosity', 'energy', 'hunger'])
    expect(pack.perception.noticeRadius).toBe(5)
  })

  it('has every action the milestone asks for', () => {
    const ids = pack.actions.map((a) => a.id)
    for (const id of ['eat', 'nap', 'explore', 'perch', 'play', 'approach_visitor', 'ignore_visitor']) {
      expect(ids).toContain(id)
    }
  })

  it('maps every slot its actions and behaviors use, so nothing silently falls back', () => {
    const used = new Set<string>([...pack.actions.map((a) => a.slot), ...behaviors.flatMap((b) => (b.slot ? [b.slot] : []))])
    for (const slot of used) expect(animations[slot as AnimationSlot], slot).toBeTruthy()
  })

  it('cannot climb until a skill gives it the clip', () => {
    expect(animations.climb).toBeUndefined()
    expect(pack.actions.every((a) => a.slot !== 'climb')).toBe(true)
  })

  it('makes approaching rarer than ignoring, as befits a cat', () => {
    expect(pack.weights.approach_visitor ?? 1).toBeLessThan(pack.weights.ignore_visitor ?? 1)
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
    const byId = (id: string) => behaviors.find((b) => b.id === id)
    expect(byId('groom')?.when).toBe('idle')
    expect(byId('stretch')?.when).toBe('afterWake')
    expect(byId('knead')?.when).toBe('beforeSleep')
    expect(byId('tail_flick')?.animate).toBeTypeOf('function')
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

describe('cat model', () => {
  it('is a small skinned mesh with every bone the pack knows', async () => {
    const gltf = await loadModel()
    let skinned: THREE.SkinnedMesh | null = null
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) skinned = o
    })
    expect(skinned).not.toBeNull()
    const names = new Set(skinned!.skeleton.bones.map((b) => b.name))
    for (const bone of BONES) expect(names.has(bone), bone).toBe(true)
    expect(readFileSync(modelPath).byteLength).toBeLessThan(300_000)
  })

  it('has a clip for every name in animations.json, and no stray clips', async () => {
    const gltf = await loadModel()
    const clips = new Set(gltf.animations.map((c) => c.name))
    for (const [slot, clip] of Object.entries(animations)) expect(clips.has(clip!), `${slot} -> ${clip}`).toBe(true)
    for (const clip of clips) expect(Object.values(animations), clip).toContain(clip)
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
})

describe('cat in the headless sim', () => {
  const day = runHeadless({ pack, behaviors, seed: 7, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 360 } })

  it('wanders for 10 minutes without getting stuck or leaving the walkable ground', () => {
    expect(day.maxStuckSteps).toBeLessThan(30)
    expect(day.offGrid).toBe(0)
    expect(day.needsOutOfRange).toBe(0)
    expect(day.badIntentions).toBe(0)
  })

  it('does a variety of cat things', () => {
    expect(day.intentionTypes.size).toBeGreaterThanOrEqual(4)
  })

  it('notices a visitor and reconsiders on the spot', () => {
    expect(day.noticeStep).not.toBeNull()
    expect(day.noticeStep!.startedAt).toBeCloseTo(day.noticeStep!.time, 5)
  })

  it('only gains affection by choosing to approach', () => {
    // The harness flags any need that rises outside an action that satisfies it. Only approach_visitor does that for affection.
    expect(day.illegalRises).toEqual([])
    const affectionActions = pack.actions.filter((a) => (a.satisfies.affection ?? 0) > 0).map((a) => a.id)
    expect(affectionActions).toEqual(['approach_visitor'])
  })

  it('is deterministic for a seed', () => {
    const again = runHeadless({ pack, behaviors, seed: 7, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 360 } })
    expect(again.trace).toEqual(day.trace)
  })

  it('has zoomies at dusk and never by day', () => {
    const dusk = runHeadless({ pack, behaviors, seed: 3, startHour: 19, seconds: 600 })
    expect(dusk.intentionTypes.has('zoomies')).toBe(true)
    expect(day.intentionTypes.has('zoomies')).toBe(false)
  })

  it('sleeps at night and does not wander the island', () => {
    const night = runHeadless({ pack, behaviors, seed: 3, startHour: 23, seconds: 600 })
    expect(night.intentionTypes.has('sleep_night')).toBe(true)
    expect(night.intentionTypes.has('explore')).toBe(false)
    expect(night.intentionTypes.has('zoomies')).toBe(false)
  })

  it('goes straight to sleep at night, whatever its needs say', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1)
    const firstDecisions = seeds.map((seed) => {
      const night = runHeadless({ pack, behaviors, seed, startHour: 23, seconds: 30 })
      return night.trace.filter((e) => e.includes('@')).map((e) => e.split('@')[0]).find((type) => type !== 'idle')
    })
    const asleep = firstDecisions.filter((d) => d === 'sleep_night').length
    expect(asleep / seeds.length, firstDecisions.join(',')).toBeGreaterThanOrEqual(0.9)
  })

  it('plays its signature behaviors across a day of watching', () => {
    const runs = [11, 12, 13].map((seed) => runHeadless({ pack, behaviors, seed, startHour: 14, seconds: 900 }))
    const seen = new Set(runs.flatMap((r) => r.micros.map((m) => m.id)))
    for (const id of ['groom', 'tail_flick', 'knead', 'stretch']) expect(seen.has(id), id).toBe(true)
  })

  it('naps in sunbeams and perches on high ground', () => {
    const runs = [21, 22, 23].map((seed) => runHeadless({ pack, behaviors, seed, startHour: 11, seconds: 900 }))
    const types = new Set(runs.flatMap((r) => [...r.intentionTypes]))
    expect(types.has('nap')).toBe(true)
    expect(types.has('perch')).toBe(true)
  })
})
