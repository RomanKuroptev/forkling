import { describe, expect, it } from 'vitest'
import { addXp, levelForXp, skillLevel } from '../src/skills.ts'

describe('levelForXp', () => {
  it('starts at 0 and rises with practice, more slowly each time', () => {
    expect(levelForXp(0)).toBe(0)
    expect(levelForXp(19)).toBe(0)
    expect(levelForXp(20)).toBe(1)
    expect(levelForXp(79)).toBe(1)
    expect(levelForXp(80)).toBe(2)
    expect(levelForXp(180)).toBe(3)
  })

  it('stops at 10', () => {
    expect(levelForXp(2000)).toBe(10)
    expect(levelForXp(1_000_000)).toBe(10)
  })
})

describe('skills', () => {
  it('reads level 0 for a group never practised', () => {
    expect(skillLevel({}, 'making')).toBe(0)
    expect(skillLevel({ making: { xp: 100, level: 2 } }, 'making')).toBe(2)
  })

  it('adds practice to one group without touching the others', () => {
    const before = { hands: { xp: 5, level: 0 } }
    const after = addXp(before, 'making', 30)
    expect(after.making).toEqual({ xp: 30, level: 1 })
    expect(after.hands).toEqual({ xp: 5, level: 0 })
    expect(before).toEqual({ hands: { xp: 5, level: 0 } })
  })

  it('accumulates and levels up', () => {
    const once = addXp({}, 'making', 15)
    const twice = addXp(once, 'making', 15)
    expect(once.making!.level).toBe(0)
    expect(twice.making).toEqual({ xp: 30, level: 1 })
  })

  it('ignores nothing and negative practice', () => {
    expect(addXp({}, 'making', 0)).toEqual({})
    expect(addXp({}, 'making', -5)).toEqual({})
  })
})
