import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Artifact, BuildResult, type BuildRequest } from '@forkling/schema'
import { checkProject, finishProject, MAX_PROJECT_BYTES } from '../src/project.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const NOW = new Date('2026-11-03T16:00:00Z')

const request: BuildRequest = {
  id: 'gate-toy',
  kind: 'code',
  name: 'Gate toy',
  purpose: 'A toy of logic gates.',
  howItPlays: 'Click the switches and watch the lamp.',
  contraption: false,
  requestedAt: '2026-11-03T10:00:00Z',
}

let dir: string
const put = (rel: string, text: string | Buffer) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
const good = () => {
  put('site/projects/gate-toy/index.html', '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><canvas id="c"></canvas><script src="app.js"></script></body></html>')
  put('site/projects/gate-toy/style.css', 'body { margin: 0 }')
  put('site/projects/gate-toy/app.js', 'const c = document.getElementById("c"); c.getContext("2d")')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'project-'))
  copyFileSync(join(merge, 'forkling.json'), join(dir, 'forkling.json'))
  put('mind/builds/gate-toy.json', JSON.stringify(request))
})

const resultOf = () => BuildResult.parse(JSON.parse(readFileSync(join(dir, 'mind/builds/gate-toy.result.json'), 'utf8')))

describe('checkProject', () => {
  it('accepts a small page of plain files', () => {
    good()
    expect(checkProject(dir, 'gate-toy')).toEqual({ ok: true, problems: [] })
  })

  it('needs an index.html to open', () => {
    put('site/projects/gate-toy/app.js', '1')
    expect(checkProject(dir, 'gate-toy').problems.join('\n')).toMatch(/index\.html/)
  })

  it('has nothing to check when the folder is not there', () => {
    expect(checkProject(dir, 'gate-toy').ok).toBe(false)
  })

  it('allows only the file types a project may have', () => {
    good()
    put('site/projects/gate-toy/run.exe', 'MZ')
    put('site/projects/gate-toy/data.txt', 'x')
    const r = checkProject(dir, 'gate-toy')
    expect(r.ok).toBe(false)
    expect(r.problems.join('\n')).toMatch(/run\.exe/)
    expect(r.problems.join('\n')).toMatch(/data\.txt/)
  })

  it('keeps the whole project small', () => {
    good()
    put('site/projects/gate-toy/big.json', Buffer.alloc(MAX_PROJECT_BYTES + 1, 32))
    expect(checkProject(dir, 'gate-toy').problems.join('\n')).toMatch(/too big/)
  })

  it('allows no network: no outside addresses except one pinned library host, and no calls out', () => {
    good()
    put('site/projects/gate-toy/index.html', '<script src="https://evil.example/x.js"></script>')
    expect(checkProject(dir, 'gate-toy').problems.join('\n')).toMatch(/evil\.example/)
    put('site/projects/gate-toy/index.html', '<script src="//evil.example/x.js"></script>')
    expect(checkProject(dir, 'gate-toy').problems.join('\n')).toMatch(/evil\.example/)
    put('site/projects/gate-toy/index.html', '<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>')
    expect(checkProject(dir, 'gate-toy').ok).toBe(true)
    for (const call of ['fetch("/x")', 'new XMLHttpRequest()', 'new WebSocket("wss://a")', 'navigator.sendBeacon("/")', 'importScripts("a.js")']) {
      put('site/projects/gate-toy/app.js', call)
      expect(checkProject(dir, 'gate-toy').problems.join('\n'), call).toMatch(/not allowed/)
    }
  })

  it('refuses frames, forms and anything that pulls the page elsewhere', () => {
    good()
    for (const html of ['<iframe src="a.html"></iframe>', '<form action="/x"><input></form>', '<meta http-equiv="refresh" content="0;url=a">']) {
      put('site/projects/gate-toy/index.html', html)
      expect(checkProject(dir, 'gate-toy').ok, html).toBe(false)
    }
  })

  it('refuses a project id that is not a plain folder name', () => {
    expect(checkProject(dir, '../brain').ok).toBe(false)
  })
})

describe('finishProject', () => {
  const finish = (usd = 0) => finishProject(dir, { now: NOW, id: 'gate-toy', usd })

  it('keeps the idea and how it plays as an artifact, once the files pass', () => {
    good()
    const r = finish()
    expect(r.ok).toBe(true)
    const a = Artifact.parse(JSON.parse(readFileSync(join(dir, 'art/gate-toy.json'), 'utf8')))
    expect(a).toMatchObject({ id: 'gate-toy', kind: 'code', title: 'Gate toy', content: { project: 'gate-toy', idea: 'A toy of logic gates.', howItPlays: 'Click the switches and watch the lamp.' }, createdAt: NOW.toISOString() })
    expect(r.written).toContain('art/gate-toy.json')
  })

  it('writes no artifact for a project that does not pass, and says what is wrong', () => {
    put('site/projects/gate-toy/index.html', '<iframe src="x"></iframe>')
    const r = finish()
    expect(r.ok).toBe(false)
    expect(r.problems.join('\n')).toMatch(/iframe/)
    expect(existsSync(join(dir, 'art/gate-toy.json'))).toBe(false)
  })

  it('reports a project that does not pass as failed, with why, so the mind can close the build and ask again', () => {
    put('site/projects/gate-toy/index.html', '<iframe src="x"></iframe>')
    const r = finish()
    expect(r.written).toEqual(['mind/builds/gate-toy.result.json'])
    expect(resultOf()).toMatchObject({ id: 'gate-toy', kind: 'code', status: 'failed', reason: expect.stringMatching(/iframe/) })
    // The mind's state and the stream are the mind's to write.
    expect(existsSync(join(dir, 'mind/state.json'))).toBe(false)
    expect(existsSync(join(dir, 'memory/stream'))).toBe(false)
  })

  it('reports a project that passes as waiting for a person, which is what the pull request will do', () => {
    good()
    finish()
    expect(resultOf()).toMatchObject({ id: 'gate-toy', kind: 'code', status: 'pr-open' })
  })

  it('reports what the builder spent in the result file, for the mind to book, and never writes the ledger', () => {
    good()
    finish(0.0731)
    expect(resultOf().calls).toMatchObject([{ kind: 'code', model: 'claude-haiku-5-5', usd: 0.0731 }])
    expect(existsSync(join(dir, 'brain/budget.json'))).toBe(false)
  })

  it('counts what was spent even when the project does not pass', () => {
    put('site/projects/gate-toy/index.html', '<iframe src="x"></iframe>')
    finish(0.05)
    expect(resultOf()).toMatchObject({ status: 'failed', calls: [{ usd: 0.05 }] })
  })

  it('reports no call when nothing was spent', () => {
    good()
    finish(0)
    expect(resultOf().calls).toEqual([])
  })

  it('is no use without a request, or with an object request', () => {
    good()
    writeFileSync(join(dir, 'mind/builds/gate-toy.json'), JSON.stringify({ ...request, kind: 'object' }))
    expect(finish().ok).toBe(false)
    expect(finishProject(dir, { now: NOW, id: 'nope', usd: 0 }).ok).toBe(false)
  })
})
