import { describe, expect, it } from 'vitest'
import { MindConfig } from '../src/index.ts'

describe('MindConfig (mind/config.json)', () => {
  it('has every switch off when it says nothing', () => {
    const c = MindConfig.parse({})
    expect(c.variety.sameTopicWrites).toEqual({ on: false, limit: 3, days: 7 })
    expect(c.variety.sameWorkTinker).toEqual({ on: false, limit: 2 })
  })

  it('turns one switch on and keeps the others off, and the limits can be tuned', () => {
    const c = MindConfig.parse({ variety: { sameTopicWrites: { on: true, limit: 4 } } })
    expect(c.variety.sameTopicWrites).toEqual({ on: true, limit: 4, days: 7 })
    expect(c.variety.sameWorkTinker.on).toBe(false)
  })

  it('refuses a switch it does not know and a limit that makes no sense, so a typo is never taken for "off"', () => {
    expect(MindConfig.safeParse({ variety: { sameTopicWrite: { on: true } } }).success).toBe(false)
    expect(MindConfig.safeParse({ variety: { sameTopicWrites: { on: true, limit: 0 } } }).success).toBe(false)
    expect(MindConfig.safeParse({ variety: { sameWorkTinker: { on: 'yes' } } }).success).toBe(false)
  })
})
