import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Artifact, BudgetLedger, MindState, type BuildRequest } from '@forkling/schema'
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

  it('closes the build when the project does not pass, so the mind may ask again, and remembers why', () => {
    put('site/projects/gate-toy/index.html', '<iframe src="x"></iframe>')
    put('mind/state.json', JSON.stringify({ ...MindState.parse({}), openBuild: { id: 'gate-toy', kind: 'code', requestedAt: request.requestedAt } }))
    const r = finish()
    expect(r.written).toEqual(expect.arrayContaining(['mind/state.json', 'memory/stream/2026-11-03.jsonl']))
    expect(MindState.parse(JSON.parse(readFileSync(join(dir, 'mind/state.json'), 'utf8'))).openBuild).toBeNull()
    expect(readFileSync(join(dir, 'memory/stream/2026-11-03.jsonl'), 'utf8')).toMatch(/Gate toy could not be built/)
  })

  it('leaves another build alone when it closes this one', () => {
    put('site/projects/gate-toy/index.html', '<iframe src="x"></iframe>')
    put('mind/state.json', JSON.stringify({ ...MindState.parse({}), openBuild: { id: 'other', kind: 'object', requestedAt: request.requestedAt } }))
    finish()
    expect(MindState.parse(JSON.parse(readFileSync(join(dir, 'mind/state.json'), 'utf8'))).openBuild?.id).toBe('other')
  })

  it('puts what the builder spent in the ledger', () => {
    good()
    finish(0.0731)
    const ledger = BudgetLedger.parse(JSON.parse(readFileSync(join(dir, 'brain/budget.json'), 'utf8')))
    expect(ledger.calls).toMatchObject([{ kind: 'code', model: 'claude-haiku-5-5', usd: 0.0731 }])
    expect(ledger.spentUsd).toBeCloseTo(0.0731, 6)
  })

  it('does not touch the ledger when nothing was spent', () => {
    good()
    finish(0)
    expect(existsSync(join(dir, 'brain/budget.json'))).toBe(false)
  })

  it('is no use without a request, or with an object request', () => {
    good()
    writeFileSync(join(dir, 'mind/builds/gate-toy.json'), JSON.stringify({ ...request, kind: 'object' }))
    expect(finish().ok).toBe(false)
    expect(finishProject(dir, { now: NOW, id: 'nope', usd: 0 }).ok).toBe(false)
  })
})
