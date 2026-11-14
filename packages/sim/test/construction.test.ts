import { describe, expect, it } from 'vitest'
import { finishedBuildings, isBuilding } from '../src/construction.ts'

const building = (finishesAt: string) => ({ construction: { kind: 'expand' as const, finishesAt } })
const NOW = Date.parse('2026-11-20T12:00:00Z')

describe('isBuilding (spec 4.5: until the construction ends the place shows scaffolding)', () => {
  it('is false for a place with no construction', () => {
    expect(isBuilding({ construction: null }, NOW)).toBe(false)
    expect(isBuilding({ construction: null })).toBe(false)
  })

  it('is true until the finish time, and false from that moment on', () => {
    expect(isBuilding(building('2026-11-20T12:00:01Z'), NOW)).toBe(true)
    expect(isBuilding(building('2026-11-20T12:00:00Z'), NOW)).toBe(false)
    expect(isBuilding(building('2026-11-19T12:00:00Z'), NOW)).toBe(false)
  })

  it('without a clock goes by the file: a construction that is written down is going on', () => {
    expect(isBuilding(building('2020-01-01T00:00:00Z'))).toBe(true)
  })
})

describe('finishedBuildings (which places the mind should close the construction of)', () => {
  it('lists the places whose finish time has come, and leaves those still being built or not built at all', () => {
    const places = [
      { id: 'done', state: building('2026-11-20T11:00:00Z') },
      { id: 'now', state: building('2026-11-20T12:00:00Z') },
      { id: 'later', state: building('2026-11-20T13:00:00Z') },
      { id: 'none', state: { construction: null } },
    ]
    expect(finishedBuildings(places, NOW).map((p) => p.id)).toEqual(['done', 'now'])
  })
})
