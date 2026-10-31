import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { StreamEntry, TimelineEntry } from '@forkling/schema'
import { appendStream, appendTimeline, prune, readStream, STREAM_KEEP_DAYS } from '../src/stream.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stream-'))
})

const lines = (rel: string) =>
  readFileSync(join(dir, rel), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))

describe('appendStream', () => {
  it('numbers entries within the local day, continuing across ticks', () => {
    const first = appendStream(dir, '2026-11-03', [
      { at: '2026-11-03T09:00:00Z', kind: 'wake', text: 'Woke up.' },
      { at: '2026-11-03T09:00:00Z', kind: 'step', text: 'Started watching the sunny rock.', verb: 'watch', objectId: 'sunny-rock' },
    ])
    expect(first.map((e) => e.id)).toEqual(['2026-11-03#1', '2026-11-03#2'])
    const second = appendStream(dir, '2026-11-03', [{ at: '2026-11-03T09:30:00Z', kind: 'thought', text: 'The rock is warm.' }])
    expect(second.map((e) => e.id)).toEqual(['2026-11-03#3'])
    const written = lines('memory/stream/2026-11-03.jsonl')
    expect(written).toHaveLength(3)
    for (const entry of written) expect(StreamEntry.safeParse(entry).success).toBe(true)
  })

  it('writes nothing when there is nothing to say', () => {
    expect(appendStream(dir, '2026-11-03', [])).toEqual([])
    expect(existsSync(join(dir, 'memory/stream/2026-11-03.jsonl'))).toBe(false)
  })

  it('clamps long text so a file never holds an essay', () => {
    const [entry] = appendStream(dir, '2026-11-03', [{ at: '2026-11-03T09:00:00Z', kind: 'event', text: 'x'.repeat(1000) }])
    expect(entry!.text.length).toBeLessThanOrEqual(300)
  })

  it('keeps days apart', () => {
    appendStream(dir, '2026-11-03', [{ at: '2026-11-03T09:00:00Z', kind: 'wake', text: 'a' }])
    const [next] = appendStream(dir, '2026-11-04', [{ at: '2026-11-04T09:00:00Z', kind: 'wake', text: 'b' }])
    expect(next!.id).toBe('2026-11-04#1')
  })
})

describe('readStream', () => {
  it('reads a day back, and skips lines that do not fit', () => {
    appendStream(dir, '2026-11-03', [{ at: '2026-11-03T09:00:00Z', kind: 'wake', text: 'Woke up.' }])
    writeFileSync(join(dir, 'memory/stream/2026-11-03.jsonl'), `${readFileSync(join(dir, 'memory/stream/2026-11-03.jsonl'), 'utf8')}not json\n`)
    expect(readStream(dir, '2026-11-03').map((e) => e.text)).toEqual(['Woke up.'])
  })

  it('is empty for a day with no stream', () => {
    expect(readStream(dir, '2026-11-09')).toEqual([])
  })
})

describe('appendTimeline', () => {
  it('keeps one line per step with its reason and the beliefs it acted on', () => {
    appendTimeline(dir, '2026-11-03', { at: '2026-11-03T09:00:00Z', verb: 'sit', targetId: 'pond', reason: 'The pond felt right.', goalRef: 'today:0', beliefRefs: ['b1'] })
    appendTimeline(dir, '2026-11-03', { at: '2026-11-03T09:30:00Z', verb: 'watch', reason: 'Birds.' })
    const written = lines('memory/timeline/2026-11-03.jsonl')
    expect(written).toHaveLength(2)
    expect(TimelineEntry.parse(written[0])).toMatchObject({ verb: 'sit', beliefRefs: ['b1'] })
  })
})

describe('prune', () => {
  it('deletes streams older than a week and leaves the timeline alone', () => {
    mkdirSync(join(dir, 'memory/stream'), { recursive: true })
    mkdirSync(join(dir, 'memory/timeline'), { recursive: true })
    for (const day of ['2026-10-20', '2026-10-27', '2026-10-28', '2026-11-03']) writeFileSync(join(dir, `memory/stream/${day}.jsonl`), '{}\n')
    writeFileSync(join(dir, 'memory/timeline/2026-10-20.jsonl'), '{}\n')
    writeFileSync(join(dir, 'memory/stream/.gitkeep'), '')

    const removed = prune(dir, '2026-11-03')

    expect(STREAM_KEEP_DAYS).toBe(7)
    expect(removed.sort()).toEqual(['memory/stream/2026-10-20.jsonl', 'memory/stream/2026-10-27.jsonl'])
    expect(existsSync(join(dir, 'memory/stream/2026-10-28.jsonl'))).toBe(true)
    expect(existsSync(join(dir, 'memory/stream/.gitkeep'))).toBe(true)
    expect(existsSync(join(dir, 'memory/timeline/2026-10-20.jsonl'))).toBe(true)
  })

  it('does nothing when there is no stream yet', () => {
    expect(prune(dir, '2026-11-03')).toEqual([])
  })
})
