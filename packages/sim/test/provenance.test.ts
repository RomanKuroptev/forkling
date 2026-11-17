import { describe, expect, it } from 'vitest'
import { GIFT_LINE, KIT_BUILT_LINE, latestFound, ROMAN_BUILT_LINE } from '../src/provenance.ts'

const line = (at: string, summary: string, verb = 'found') => ({ at, verb, summary })

describe('the founding lines (spec 10.3: who had the idea and who built it)', () => {
  it('has the three phrasings of the spec, word for word', () => {
    expect(ROMAN_BUILT_LINE).toBe('Asked for by Merge, built by Roman with Claude Code.')
    expect(KIT_BUILT_LINE).toBe('Founded by Merge, built by Merge from the kit.')
    expect(GIFT_LINE).toBe('A gift from Roman.')
  })

  it('takes the newest found line: the build that stands now', () => {
    const history = [line('2026-11-10T10:00:00Z', KIT_BUILT_LINE), line('2026-11-12T10:00:00Z', 'tended'.padEnd(6), 'tend'), line('2026-11-15T10:00:00Z', ROMAN_BUILT_LINE)]
    expect(latestFound(history)?.summary).toBe(ROMAN_BUILT_LINE)
  })

  it('does not depend on the order of the list', () => {
    const history = [line('2026-11-15T10:00:00Z', ROMAN_BUILT_LINE), line('2026-11-10T10:00:00Z', KIT_BUILT_LINE)]
    expect(latestFound(history)?.summary).toBe(ROMAN_BUILT_LINE)
  })

  it('is nothing when no one wrote it down', () => {
    expect(latestFound([])).toBeUndefined()
    expect(latestFound([line('2026-11-10T10:00:00Z', 'Looked after.', 'tend')])).toBeUndefined()
  })
})
