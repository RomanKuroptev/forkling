import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MindState, Goals } from '@forkling/schema'
import { flagGoalClosed, readMindConfig, readWrittenPages, varietyFor } from '../src/tick/variety.ts'

const world = () => mkdtempSync(join(tmpdir(), 'variety-'))
const put = (dir: string, rel: string, text: string) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

describe('readMindConfig', () => {
  it('has every switch off when there is no file', () => {
    const { config, problem } = readMindConfig(world())
    expect(problem).toBeNull()
    expect(config.variety.sameTopicWrites.on).toBe(false)
  })

  it('reads a switch that is on', () => {
    const dir = world()
    put(dir, 'mind/config.json', JSON.stringify({ variety: { sameTopicWrites: { on: true }, sameWorkTinker: { on: true, limit: 3 } } }))
    const { config } = readMindConfig(dir)
    expect(config.variety.sameTopicWrites).toEqual({ on: true, limit: 3, days: 7 })
    expect(config.variety.sameWorkTinker).toEqual({ on: true, limit: 3 })
  })

  it('never stops a tick over a bad file: every switch is off and the problem is named', () => {
    const dir = world()
    put(dir, 'mind/config.json', '{ "variety": { "sameTopicWrite": { "on": true } } }')
    const bad = readMindConfig(dir)
    expect(bad.config.variety.sameTopicWrites.on).toBe(false)
    expect(bad.problem).toMatch(/mind\/config\.json/)
    put(dir, 'mind/config.json', 'not json')
    expect(readMindConfig(dir).problem).toMatch(/mind\/config\.json/)
  })
})

describe('readWrittenPages', () => {
  it("reads the notebook with each page's time from its name, and its target from the write step before it", () => {
    const dir = world()
    put(dir, 'notebook/writing/2026-11-15-0739-what-a-dem-is.md', '# What a DEM is\n\nThe elevation grid keeps heights.\n')
    put(dir, 'notebook/writing/2026-11-16-1038-shaded-relief.md', '# Shaded relief\n\nLight from one side.\n')
    put(dir, 'notebook/writing/2026-11-02-0900-old.md', '# Old\n\nToo old.\n')
    put(dir, 'memory/timeline/2026-11-15.jsonl', `${JSON.stringify({ at: '2026-11-15T06:57:00.000Z', verb: 'write', targetId: 'Digital elevation model', reason: 'x', goalRef: 'today:1' })}\n`)
    const pages = readWrittenPages(dir, '2026-11-16', 7)
    expect(pages.map((p) => p.title)).toEqual(['What a DEM is', 'Shaded relief'])
    expect(pages[0]).toMatchObject({ at: '2026-11-15T07:39:00.000Z', target: 'Digital elevation model' })
    expect(pages[1]!.target).toBeNull()
    expect(pages[0]!.text).toMatch(/elevation grid/)
  })

  it('is empty when there is no notebook', () => {
    expect(readWrittenPages(world(), '2026-11-16', 7)).toEqual([])
  })
})

describe('varietyFor', () => {
  const off = readMindConfig(world()).config
  const dir = world()
  put(dir, 'mind/config.json', JSON.stringify({ variety: { sameTopicWrites: { on: true, limit: 3, days: 7 }, sameWorkTinker: { on: true, limit: 2 } } }))
  const on = readMindConfig(dir).config

  it('is undefined when nothing is on, so nothing is read', () => {
    expect(varietyFor(off, () => { throw new Error('should not read') }, [])).toBeUndefined()
  })

  it('carries the pages and the latest tinkers of a switch that is on, oldest first, and reads twice the look-back', () => {
    const recent = [
      { verb: 'tinker', targetId: 'Grain', at: '2026-11-15T10:00:00Z' },
      { verb: 'rest', at: '2026-11-15T11:00:00Z' },
      { verb: 'tinker', targetId: 'Ripples', at: '2026-11-15T12:00:00Z' },
    ]
    let asked = 0
    const v = varietyFor(on, (days) => { asked = days; return [] }, recent)!
    expect(asked).toBe(14)
    expect(v.sameTopicWrites).toEqual({ limit: 3, days: 7, pages: [] })
    expect(v.sameWorkTinker).toEqual({ limit: 2, recent: ['Grain', 'Ripples'] })
  })
})

describe('flagGoalClosed (the long goal is on a topic that is closed for writing)', () => {
  const common = 'lidar canopy ground returns terrain elevation forest archaeology surface survey'
  const long = { text: 'Write one short page on telling a real lidar find from a wishful one.', reason: 'Lidar finds under canopy are easy to over-read.', setAt: '2026-11-11T17:00:00Z', reviewedAt: '2026-11-16T17:00:00Z' }
  const make = (config: unknown, withLong = true) => {
    const dir = world()
    put(dir, 'mind/config.json', JSON.stringify(config))
    for (const [day, title] of [['14', 'Lidar under trees'], ['15', 'Lidar and wishful finds'], ['16', 'Reading a lidar find']] as const) {
      put(dir, `notebook/writing/2026-11-${day}-1000-${title.toLowerCase().replace(/ /g, '-')}.md`, `# ${title}

${common} page ${day}.
`)
    }
    return { dir, config: readMindConfig(dir).config, goals: Goals.parse(withLong ? { long } : {}), mind: MindState.parse({}), today: '2026-11-17', nowMs: Date.parse('2026-11-17T12:00:00Z') }
  }
  const on = { variety: { sameTopicWrites: { on: true, limit: 3, days: 7 } } }

  it('marks an early review for today when the goal topic has reached the limit', () => {
    const t = make(on)
    flagGoalClosed(t)
    expect(t.mind.goalReviewEarly).toEqual({ date: '2026-11-17', closed: 3 })
  })

  it('marks nothing when the switch is off, there is no long goal, the limit is not reached, or an early review already ran today', () => {
    for (const t of [make({}), make(on, false), make({ variety: { sameTopicWrites: { on: true, limit: 4, days: 7 } } })]) {
      flagGoalClosed(t)
      expect(t.mind.goalReviewEarly).toBeUndefined()
    }
    const ran = make(on)
    ran.mind.goalReviewEarlyOn = '2026-11-17'
    flagGoalClosed(ran)
    expect(ran.mind.goalReviewEarly).toBeUndefined()
  })
})
