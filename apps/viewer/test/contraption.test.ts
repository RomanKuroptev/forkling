import { describe, expect, it } from 'vitest'
import { WorldObject } from '@forkling/schema'
import { bodyOf, shouldRun, TINKER_RANGE, VISITOR_RANGE } from '../src/world/contraptionRules.ts'

const object = WorldObject.parse({
  id: 'marble-run',
  kind: 'contraption',
  name: 'A marble run',
  position: [4, 0, 5],
  model: { parts: [{ shape: 'box', size: [1, 0.1, 0.4], at: [0, 0.4, 0], color: '#aa8855' }, { shape: 'sphere', size: [0.2, 0.2, 0.2], at: [-0.4, 0.55, 0], color: '#cc3333' }, { shape: 'box', size: [0.1, 0.1, 0.1], at: [0.4, 0.1, 0], color: '#333333' }] },
  contraption: { bodies: [{ part: 1, body: 'dynamic', massKg: 0.3 }], trigger: { part: 1, impulse: [0.1, 0, 0] }, runSec: 8 },
  reason: 'To watch it roll.',
})

describe('bodyOf', () => {
  it('is dynamic for the parts that move and fixed for the rest, including parts it was not told about', () => {
    expect(bodyOf(object, 0)).toEqual({ body: 'fixed', massKg: 1 })
    expect(bodyOf(object, 1)).toEqual({ body: 'dynamic', massKg: 0.3 })
    expect(bodyOf(object, 2)).toEqual({ body: 'fixed', massKg: 1 })
  })
})

describe('shouldRun', () => {
  const base = { running: false, wasTinkering: false, tinkering: false, visitorPressed: false, visitorDistance: 10 }

  it('starts when the forkling begins to tinker with it, not while it carries on', () => {
    expect(shouldRun({ ...base, tinkering: true })).toBe(true)
    expect(shouldRun({ ...base, tinkering: true, wasTinkering: true })).toBe(false)
  })

  it('starts when a visitor close enough presses the key', () => {
    expect(shouldRun({ ...base, visitorPressed: true, visitorDistance: VISITOR_RANGE - 0.1 })).toBe(true)
    expect(shouldRun({ ...base, visitorPressed: true, visitorDistance: VISITOR_RANGE + 0.1 })).toBe(false)
  })

  it('does nothing without a reason', () => {
    expect(shouldRun(base)).toBe(false)
  })

  it('never starts over a run that is going', () => {
    expect(shouldRun({ ...base, running: true, tinkering: true, visitorPressed: true, visitorDistance: 1 })).toBe(false)
  })

  it('knows how near counts as tinkering', () => {
    expect(TINKER_RANGE).toBeGreaterThan(VISITOR_RANGE)
  })
})
