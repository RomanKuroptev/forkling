import { describe, expect, it } from 'vitest'
import { PlanStep, SpeciesPack, WorldObject } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { runPlan } from '../src/headless.ts'
import { starterWorld } from '../src/starter.ts'

const pack = SpeciesPack.parse(blobJson)
const spawn = starterWorld().spawn
const at = (dx: number, dz: number) => [spawn.x + dx, 0, spawn.z + dz]
const part = { shape: 'sphere', size: [0.5, 0.5, 0.5], at: [0, 0.25, 0], color: '#44aa66' }
const obj = (extra: Record<string, unknown>) =>
  WorldObject.parse({ kind: 'thing', name: 'A thing', model: { parts: [part] }, reason: 'Because.', ...extra })

describe('a blob makes things too, because nothing in the engine is about cats', () => {
  const objects = [
    obj({ id: 'clay-bank', position: at(5, -2), yields: { material: 'clay', max: 4, respawnHours: 12 } }),
    obj({ id: 'goo-pit', position: at(-5, -3), properties: { storage: true }, unlocks: ['goo_up'] }),
  ]
  const step = (verb: string, extra: Record<string, unknown> = {}) => PlanStep.parse({ verb, reason: 'Blob has its reasons.', minutes: 3, ...extra })

  it('gathers, stores and makes a lump on four legs', () => {
    const r = runPlan({
      pack,
      seed: 3,
      startMs: Date.parse('2026-10-30T12:00:00Z'),
      objects,
      steps: [step('grab', { targetId: 'clay-bank' }), step('stash', { targetId: 'goo-pit' }), step('goo_up', { targetId: 'goo-pit', materials: ['clay'], makes: 'a lump' })],
    })
    expect(r.steps.map((s) => s.ok)).toEqual([true, true, true])
    expect(r.objects.find((o) => o.id === 'a-lump')?.made?.verb).toBe('goo_up')
    expect(r.skills.making?.xp).toBe(3)
  })
})
