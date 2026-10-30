import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { applyAction, decayNeeds, initialNeeds } from '../src/needs.ts'

const blob = SpeciesPack.parse(blobJson)
const action = (id: string) => blob.actions.find((a) => a.id === id)!

describe('initialNeeds', () => {
  it('starts every declared need at its initial value and nothing else', () => {
    expect(initialNeeds(blob)).toEqual({ hunger: 60, energy: 70, fun: 50 })
  })
})

describe('decayNeeds', () => {
  it('lowers each need by decayPerHour scaled to the elapsed time', () => {
    const next = decayNeeds({ hunger: 60, energy: 70, fun: 50 }, blob, 30)
    expect(next.hunger).toBeCloseTo(60 - 240 / 120)
    expect(next.energy).toBeCloseTo(70 - 180 / 120)
  })

  it('never goes below zero and never raises a need', () => {
    expect(decayNeeds({ hunger: 0.5, energy: 0, fun: 10 }, blob, 3600)).toEqual({ hunger: 0, energy: 0, fun: 0 })
  })

  it('does not mutate its input', () => {
    const before = { hunger: 60, energy: 70, fun: 50 }
    decayNeeds(before, blob, 100)
    expect(before).toEqual({ hunger: 60, energy: 70, fun: 50 })
  })
})

describe('applyAction', () => {
  it('applies the action satisfies scaled by the fraction of the action performed', () => {
    const next = applyAction({ hunger: 10, energy: 70, fun: 50 }, action('eat'), 0.5)
    expect(next.hunger).toBeCloseTo(10 + 35)
  })

  it('clamps to 0 and 100, and supports negative costs', () => {
    expect(applyAction({ hunger: 95, energy: 70, fun: 50 }, action('eat'), 1).hunger).toBe(100)
    expect(applyAction({ hunger: 50, energy: 10, fun: 50 }, action('dash'), 1).energy).toBe(0)
  })

  it('leaves needs the action does not mention alone', () => {
    const next = applyAction({ hunger: 10, energy: 70, fun: 50 }, action('eat'), 1)
    expect(next.energy).toBe(70)
    expect(next.fun).toBe(50)
  })
})
