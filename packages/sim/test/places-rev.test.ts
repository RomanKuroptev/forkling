import { describe, expect, it } from 'vitest'
import { placesRev } from '../src/places-rev.ts'

describe('placesRev', () => {
  it('is 8 hex digits, the same for the same places and different when one changes', () => {
    const a = [{ id: 'home', sign: 'HOME' }]
    expect(placesRev(a)).toMatch(/^[0-9a-f]{8}$/)
    expect(placesRev(JSON.parse(JSON.stringify(a)))).toBe(placesRev(a))
    expect(placesRev([{ id: 'home', sign: 'MY HOME' }])).not.toBe(placesRev(a))
    expect(placesRev([])).toMatch(/^[0-9a-f]{8}$/)
  })
})
