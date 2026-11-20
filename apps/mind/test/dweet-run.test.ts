import { describe, expect, it } from 'vitest'
import { hasPolicy } from '../src/builds/sandbox.ts'
import { DWEET_FRAME, dweetRunPage, renderDweet } from '../src/builds/dweet-run.ts'
import type { PageFiles, Sandbox } from '../src/builds/sandbox-run.ts'
import { dweetRuns } from '../src/tick/wander.ts'
import { WebError, type Fetcher } from '../src/web/fetch.ts'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const CODE = 'c.width|=0;for(i=9;i--;)x.fillRect(i*99,540+S(t+i)*99,50,50)'

function fakeSandbox(sandboxed: boolean) {
  const runs: PageFiles[] = []
  const sandbox: Sandbox = {
    sandboxed,
    async run(page) {
      runs.push(page)
      return { ok: true, errors: [], screenshotPng: PNG, sandboxed } as unknown as Awaited<ReturnType<Sandbox['run']>>
    },
    available: async () => true,
    close: async () => undefined,
  }
  return { sandbox, runs }
}

describe('a dweet runs only in the sandbox unit (Roman, 20 November)', () => {
  it('is put in a page with the work policy, Dwitter\'s helpers and its code as u(t), and cannot end its own script tag', () => {
    const page = dweetRunPage(`${CODE};"</script><img src=x>"`)
    expect(hasPolicy(page)).toBe(true)
    expect(page).toContain('function u(t){')
    expect(page).toContain(CODE)
    expect(page).toContain('<\\/script><img src=x>')
    expect(page.match(/<\/script>/g)).toHaveLength(1)
  })

  it('is never run in this process: with no unit, or a sandbox that is not the unit, there is no picture and no run', async () => {
    const local = fakeSandbox(false)
    expect(await renderDweet(undefined, CODE)).toBeNull()
    expect(await renderDweet(local.sandbox, CODE)).toBeNull()
    expect(local.runs).toHaveLength(0)
  })

  it('gives the screenshot of its run in the unit', async () => {
    const unit = fakeSandbox(true)
    expect(await renderDweet(unit.sandbox, CODE)).toEqual(PNG)
    expect(unit.runs[0]!.frame).toBe(DWEET_FRAME)
    expect(unit.runs[0]!.files.get(DWEET_FRAME)!.toString()).toContain(CODE)
  })
})

describe('a dweet on a trip', () => {
  const API = 'https://www.dwitter.net/apiv2beta/dweets/'
  const fetcher = (): Fetcher & { asked: string[] } => {
    const asked: string[] = []
    const answers: Record<string, unknown> = {
      [`${API}5/`]: { id: 5, code: CODE, author: { username: 'ann' }, awesome_count: 3, posted: '2026-11-19T00:00:00Z', comments: [] },
      [`${API}?username=ann&limit=6`]: { results: [] },
    }
    return {
      asked,
      log: [],
      pausedHosts: () => ({}),
      text: async () => '',
      json: async (url) => {
        asked.push(url)
        if (!(url in answers)) throw new WebError('http', '404', 404)
        return answers[url]
      },
      bytes: async (url) => {
        asked.push(url)
        return { bytes: new Uint8Array([9]), contentType: 'image/jpeg', url }
      },
    }
  }

  it('is text only without the unit', async () => {
    const f = fetcher()
    const { open, fetcher: lookFetcher } = dweetRuns(f, fakeSandbox(false).sandbox)
    expect((await open('https://www.dwitter.net/d/5')).images).toEqual([])
    expect(lookFetcher).toBe(f)
  })

  it('has its run as a picture in the unit, which a look gets from the sandbox and never from the web', async () => {
    const f = fetcher()
    const unit = fakeSandbox(true)
    const { open, fetcher: lookFetcher } = dweetRuns(f, unit.sandbox)
    const item = await open('https://www.dwitter.net/d/5')
    expect(item.images).toEqual([{ url: 'https://www.dwitter.net/d/5#run', licence: null, credit: 'a run of Dweet 5 by ann in the sandbox' }])
    const got = await lookFetcher.bytes('https://www.dwitter.net/d/5#run')
    expect(Buffer.from(got.bytes)).toEqual(PNG)
    expect(got.contentType).toBe('image/png')
    expect(unit.runs).toHaveLength(1)
    expect(f.asked.some((u) => u.includes('#run'))).toBe(false)
    // Any other picture is fetched from the web as before.
    await lookFetcher.bytes('https://upload.wikimedia.org/a.jpg')
    expect(f.asked).toContain('https://upload.wikimedia.org/a.jpg')
  })
})
