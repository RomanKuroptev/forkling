import { describe, expect, it } from 'vitest'
import { memeFindings } from '../../src/behaviour/memes.ts'
import { readRun } from '../../src/behaviour/read-run.ts'
import { makeRun, type RunShape, WEEK } from './make-run.ts'

const FORMAT = 'https://imgflip.com/meme/181913649'
const DAYS = WEEK.slice(0, 2)
const planner = (user: string, system = 'You are Merge.') => [
  { kind: 'morning', user, system },
  { kind: 'decide', user, system },
]
const readFormat = () => [{ url: FORMAT, title: 'Drake Hotline Bling', reaction: 'Two panels: no, then yes.' }]
const meme = (over: Record<string, unknown> = {}) => ({ id: 'no-then-yes', title: 'No, Then Yes', kind: 'meme', about: 'me and the dark', made: `${DAYS[0]}T12:00:00.000Z`, status: 'shelf', sources: [{ url: FORMAT, role: 'looked' }, { url: FORMAT, role: 'read' }], ...over })

const trailOf = (shape: Omit<RunShape, 'days'>, live = false) => {
  const { world, out } = makeRun({ ...shape, days: DAYS })
  return memeFindings(readRun({ world, outDir: live ? null : out, label: 'test' }))
}

describe('the eight meme steps, planted', () => {
  it('stops at 1 when no planner prompt had a format', () => {
    const { trail, results } = trailOf({ prompts: planner('Starting points: https://en.wikipedia.org/wiki/Moth') })
    expect(trail.stoppedAt?.step).toBe(1)
    expect(results[0]).toMatchObject({ id: 'behaviour.memes', severity: 'major', fixKind: 'data', title: 'No memes: they stop at step 1, "offered"' })
    expect(results[0]!.what).toContain('0 of 2 morning and decide prompts had an Imgflip format')
  })

  it('stops at 2 when formats were offered but none was read', () => {
    const { trail } = trailOf({ prompts: planner(`Starting points: ${FORMAT}`), trails: () => [{ url: FORMAT, title: 'Drake', failed: 'skipped: read in the last 30 days' }] })
    expect(trail.stoppedAt?.step).toBe(2)
    expect(trail.stoppedAt?.detail).toContain('read in the last 30 days')
  })

  it('stops at 3 when the planner saw formats but was never told it can make a meme', () => {
    const { trail, results } = trailOf({ prompts: planner(`Starting points: ${FORMAT}. Verbs: tinker makes a sketch.`), trails: readFormat })
    expect(trail.stoppedAt?.step).toBe(3)
    expect(results[0]).toMatchObject({ fixKind: 'prompt' })
    expect(results[0]!.what).toContain('in 0 of 2 morning and decide prompts')
  })

  it('live, with no prompts, step 3 is unknown (never 0) and the stop is the first real zero', () => {
    const { trail, results } = trailOf({ trails: readFormat }, true)
    expect(trail.steps[2]).toMatchObject({ count: null })
    expect(trail.stoppedAt?.step).toBe(4)
    expect(results[0]!.what).toContain('Unknown before it: seen by the planner')
  })

  it('stops at 5 when every meme plan was turned down', () => {
    const { trail } = trailOf({
      prompts: planner(`You can make a meme. ${FORMAT}`),
      trails: readFormat,
      plans: () => ['1. **tinker** (a meme), 30 min: I want to make a meme of my day.'],
      notes: () => ['plan turned down (step 1: a meme needs a format you read): asking again'],
    })
    expect(trail.stoppedAt?.step).toBe(5)
  })

  it('stops at 6 when the meme answer was unusable', () => {
    const { trail } = trailOf({ prompts: planner(`You can make a meme. ${FORMAT}`), trails: readFormat, works: [meme({ status: 'scrap', scrapReason: 'the model gave no usable answer (sources: too many)' })] })
    expect(trail.stoppedAt?.step).toBe(6)
  })

  it('stops at 7 when the browser check turned the meme down', () => {
    const { trail } = trailOf({ prompts: planner(`You can make a meme. ${FORMAT}`), trails: readFormat, works: [meme({ status: 'scrap', scrapReason: 'the page was blank' })] })
    expect(trail.stoppedAt?.step).toBe(7)
  })

  it('a meme that made it through raises no alarm, and goes to the look reviewer with its picture', () => {
    const { trail, results } = trailOf({ prompts: planner(`You can make a meme. ${FORMAT}`), trails: readFormat, works: [meme()] })
    expect(trail.stoppedAt).toBeNull()
    expect(trail.steps.map((s) => s.count)).toEqual([2, 2, 2, 1, 1, 1, 1, 1])
    expect(results).toEqual([expect.objectContaining({ id: 'behaviour.meme-look', severity: 'info', fixKind: 'look' })])
    expect(results[0]!.evidence[0]).toMatch(/no-then-yes[\\/]thumb\.png$/)
  })
})
