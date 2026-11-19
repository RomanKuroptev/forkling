import { describe, expect, it } from 'vitest'
import { SIGN_LINE, signLine, signLineProblem, wrapWords } from '../src/sign-line.ts'

type P = Parameters<typeof signLine>[0]
const place = (id: string, name: string, sign: string, purpose = '', over: Partial<P> = {}): P => ({ id, name, purpose, founded: '2026-11-11', exterior: { sign }, state: { closed: null }, ...over })

const home = place('home', 'Home', 'HOME', 'Where my days start and end: a desk to read and write at, a bed, a shelf.')
const workshop = place('workshop', 'Workshop', 'WORKSHOP', 'Where I make things and test them.')
const hillside = place('hillside-room-five-lamps', 'Hillside Room, Five Lamps', 'HILLSIDE ROOM, FIVE LAMP', 'A small room for the hillside toy and its five lamps, where the light outside sets the pattern inside. Short, plain, and built to be changed.')
const all = [home, workshop, hillside]

describe('the second line of a place sign (issues 359, 363, 366)', () => {
  it('keeps the sign text Merge wrote when it says something of its own', () => {
    expect(signLine(place('home', 'Home', 'Come in, mind the cat'), all)).toBe('Come in, mind the cat')
  })

  it('never repeats the name: a sign that is the name says what the place is for instead', () => {
    expect(signLine(home, all)).toBe('Where my days start and end: a desk to read and write at')
    expect(signLine(workshop, all)).toBe('Where I make things and test them')
  })

  it('treats a sign that is the name cut short as the name', () => {
    expect(signLine(hillside, all)).not.toMatch(/five lamp/i)
    expect(signLine(hillside, all)).toBe('A small room for the hillside toy')
  })

  it('never names another place: Home\'s sign that says WORKSHOP shows what Home is for', () => {
    const patched = { ...home, exterior: { sign: 'PATCH BENCH: WORKSHOP' } }
    expect(signLine(patched, all)).toBe('Where my days start and end: a desk to read and write at')
  })

  it('falls back to the day the place was founded when the purpose is empty or says the name', () => {
    expect(signLine(place('home', 'Home', 'Home', ''), all)).toBe('Founded 11 Nov 2026')
    expect(signLine(place('home', 'Home', 'Home', 'Home, the Workshop next door.'), all)).toBe('Founded 11 Nov 2026')
  })

  it('a closed place says why it is closed', () => {
    expect(signLine(place('home', 'Home', 'HOME', 'x', { state: { closed: { reason: 'too cold' } } }), all)).toBe('Closed: too cold')
  })

  it('always fits two lines of the sign, word for word, without an ellipsis', () => {
    const long = place('x', 'X Place', 'X PLACE', 'Averyveryverylongwordthatnevereverendsatallinanyway and some more words after it go on and on and on.')
    for (const p of [...all, long]) {
      const line = signLine(p, [...all, long])
      expect(line).not.toContain('…')
      expect(wrapWords(line, SIGN_LINE.perLine).length, line).toBeLessThanOrEqual(SIGN_LINE.lines)
    }
  })

  it('tells why a shown line is wrong: the name again, or another place', () => {
    expect(signLineProblem('HOME', home, all)).toBe('repeats-name')
    expect(signLineProblem('HILLSIDE ROOM, FIVE LAMP', hillside, all)).toBe('repeats-name')
    expect(signLineProblem('PATCH BENCH: WORKSHOP', home, all)).toEqual({ names: 'workshop' })
    expect(signLineProblem('Where my days start and end', home, all)).toBeNull()
    // A word inside another word is not the name.
    expect(signLineProblem('Homesick lamps', workshop, all)).toBeNull()
  })
})
