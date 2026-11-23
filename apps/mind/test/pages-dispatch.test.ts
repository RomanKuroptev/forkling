import { describe, expect, it } from 'vitest'
import { PAGES_EVERY_MS, createPagesDispatcher } from '../src/pages-dispatch.ts'

const MIN = 60_000

function setup(fail = false) {
  const clock = { ms: Date.parse('2026-11-23T10:00:00Z') }
  const sent: number[] = []
  const logged: string[] = []
  const pages = createPagesDispatcher({
    dispatch: async () => {
      if (fail) throw new Error('GitHub answered 403: Resource not accessible by personal access token')
      sent.push(clock.ms)
    },
    now: () => clock.ms,
    log: (line) => logged.push(line),
  })
  return { clock, sent, logged, pages }
}

describe('the pages dispatcher (the site follows Merge within minutes, not hours)', () => {
  it('sends nothing while nothing Merge made was pushed', async () => {
    const { pages, sent } = setup()
    expect(await pages.tick()).toBe('idle')
    expect(sent).toHaveLength(0)
  })

  it('rebuilds at once after the first push of something Merge made', async () => {
    const { pages, sent } = setup()
    pages.changed()
    expect(await pages.tick()).toBe('dispatched')
    expect(sent).toHaveLength(1)
    expect(await pages.tick()).toBe('idle')
  })

  it('rebuilds at most once every 30 minutes, and sends what came in the meantime once the 30 minutes are up', async () => {
    const { pages, sent, clock } = setup()
    pages.changed()
    await pages.tick()
    clock.ms += 5 * MIN
    pages.changed()
    expect(await pages.tick()).toBe('waiting')
    clock.ms += 20 * MIN
    pages.changed()
    expect(await pages.tick()).toBe('waiting')
    clock.ms += PAGES_EVERY_MS - 25 * MIN
    expect(await pages.tick()).toBe('dispatched')
    expect(sent).toHaveLength(2)
    expect(sent[1]! - sent[0]!).toBe(PAGES_EVERY_MS)
  })

  it('says why when GitHub refuses, keeps the change and tries again only after 30 minutes', async () => {
    const { pages, logged, clock } = setup(true)
    pages.changed()
    expect(await pages.tick()).toBe('failed')
    expect(logged.join('\n')).toContain('403')
    clock.ms += 10 * MIN
    expect(await pages.tick()).toBe('waiting')
    clock.ms += 20 * MIN
    expect(await pages.tick()).toBe('failed')
    expect(logged).toHaveLength(2)
  })
})
