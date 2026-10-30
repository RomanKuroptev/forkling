import { describe, expect, it } from 'vitest'
import { parseHour } from '../src/parseHour.ts'

describe('parseHour', () => {
  it('parses hours and hours:minutes into hours since midnight', () => {
    expect(parseHour('18')).toBe(18)
    expect(parseHour('18:30')).toBe(18.5)
    expect(parseHour('0:15')).toBeCloseTo(0.25)
    expect(parseHour('7:05')).toBeCloseTo(7 + 5 / 60)
  })

  it('returns null for anything else', () => {
    expect(parseHour(null)).toBeNull()
    expect(parseHour('')).toBeNull()
    expect(parseHour('noon')).toBeNull()
    expect(parseHour('24:00')).toBeNull()
    expect(parseHour('12:75')).toBeNull()
    expect(parseHour('-3')).toBeNull()
  })
})
