import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { RevisitAnswer, buildRevisitUser, souvenirsSince, toRevisitPatch } from '../src/builds/revisit.ts'

const home = Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../../templates/forkling-world/places/home.json', import.meta.url)), 'utf8')))
const fog = { id: 'fog', kind: 'quote', content: 'fog, fog, fog', why: 'it repeats', fetchedAt: '2026-11-05T10:00:00Z' }

describe('the revisit prompt (spec 2.4: reread the history, the notes and the souvenirs kept since)', () => {
  const user = buildRevisitUser({ place: home, reason: 'I have not been there in a while.', daysSinceCare: 9, since: [fog], notes: ['The Sea'] })
  it('says what the place is, how long, why, and shows its history', () => {
    expect(user).toContain('Home')
    expect(user).toMatch(/9 days/)
    expect(user).toContain('I have not been there in a while.')
    expect(user).toMatch(/<data source="history">/)
  })
  it('shows what was kept since as data, and the titles of its own notes', () => {
    expect(user).toMatch(/<data source="since">[\s\S]*fog, fog, fog[\s\S]*<\/data>/)
    expect(user).toContain('The Sea')
  })
  it('says a revisit changes nothing in the place', () => {
    expect(user).toMatch(/nothing in the place changes|does not change/i)
  })
})

describe('turning the answer into a patch', () => {
  it('is a revisit patch with only the summary', () => {
    const r = toRevisitPatch(RevisitAnswer.parse({ summary: 'Sat a while.', thought: 'The shelf is dusty.' }))
    expect(r).toEqual({ verb: 'revisit', summary: 'Sat a while.' })
  })
  it('needs both lines', () => {
    expect(RevisitAnswer.safeParse({ summary: '', thought: 'x' }).success).toBe(false)
  })
})

describe('souvenirs since', () => {
  it('keeps those fetched after the last care, newest first, and all of them if never cared for', () => {
    const list = [fog, { ...fog, id: 'old', fetchedAt: '2026-10-01T00:00:00Z' }]
    expect(souvenirsSince(list, '2026-11-01T00:00:00Z').map((s) => s.id)).toEqual(['fog'])
    expect(souvenirsSince(list, null).map((s) => s.id)).toEqual(['fog', 'old'])
  })
})
