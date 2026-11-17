import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkProjectPath, checkWrite, listProjectFiles, PROJECT_LIMITS, resolveProjectPath } from '../src/builds/project-files.ts'

/** Step 3, tests 1 and 2: the file tools of a build session reach `projects/<id>/src/` only, under the limits of spec-v4 3.1. */

describe('checkProjectPath (spec-v4 3.1: the name rule)', () => {
  it('takes a plain name, with or without the src/ in front, and gives it back inside src/', () => {
    expect(checkProjectPath('index.html')).toEqual({ ok: true, rel: 'index.html' })
    expect(checkProjectPath('src/index.html')).toEqual({ ok: true, rel: 'index.html' })
    expect(checkProjectPath('js/main-loop_2.js')).toEqual({ ok: true, rel: 'js/main-loop_2.js' })
    for (const ext of ['html', 'js', 'css', 'json', 'svg', 'txt', 'md']) expect(checkProjectPath(`a.${ext}`).ok, ext).toBe(true)
  })

  it.each([
    ['../x', /\.\./],
    ['/etc/passwd', /absolute/],
    ['src/../../x', /\.\./],
    ['a/../b.js', /\.\./],
    ['C:/x.js', /absolute|letters/],
    ['a\\b.js', /letters/],
    ['Main.js', /lowercase|letters/],
    ['my file.js', /letters/],
    ['run.sh', /\.sh/],
    ['tool.exe', /\.exe/],
    ['noext', /kind of file/],
    ['', /empty/],
    ['a//b.js', /empty/],
    ['./a.js', /\./],
    ['.hidden.js', /dot/],
  ])('refuses %j with a plain reason', (path, reason) => {
    const r = checkProjectPath(path)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(reason)
  })
})

describe('resolveProjectPath (no way out of src/, not even by a link)', () => {
  let dir: string
  let outside: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'project-'))
    outside = mkdtempSync(join(tmpdir(), 'outside-'))
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(outside, 'secret.txt'), 'secret')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('resolves a good path inside src/', () => {
    const r = resolveProjectPath(dir, 'sub/a.js')
    expect(r).toEqual({ ok: true, rel: 'sub/a.js', abs: join(dir, 'src', 'sub', 'a.js') })
  })

  it('refuses ../x, /etc/passwd and src/../../x', () => {
    for (const p of ['../x', '/etc/passwd', 'src/../../x']) expect(resolveProjectPath(dir, p).ok, p).toBe(false)
  })

  // Making a link needs a privilege on Windows; where it cannot be made, the rule is still held on Linux, which is where it matters.
  const linked = (target: string, at: string, type: 'file' | 'dir') => {
    try {
      symlinkSync(target, at, type === 'dir' ? 'junction' : 'file')
      return true
    } catch {
      return false
    }
  }

  it('refuses a file that is a link pointing out', () => {
    if (!linked(join(outside, 'secret.txt'), join(dir, 'src', 'out.txt'), 'file')) return
    const r = resolveProjectPath(dir, 'out.txt')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/link/)
  })

  it('refuses a path through a folder that is a link pointing out', () => {
    if (!linked(outside, join(dir, 'src', 'away'), 'dir')) return
    const r = resolveProjectPath(dir, 'away/secret.txt')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/link/)
  })

  it('refuses when src/ itself is a link', () => {
    rmSync(join(dir, 'src'), { recursive: true })
    if (!linked(outside, join(dir, 'src'), 'dir')) return
    expect(resolveProjectPath(dir, 'secret.txt').ok).toBe(false)
  })

  it('lists the files in src/ with their sizes, sorted, and leaves links out', () => {
    writeFileSync(join(dir, 'src', 'index.html'), '<p>hi</p>')
    mkdirSync(join(dir, 'src', 'js'))
    writeFileSync(join(dir, 'src', 'js', 'a.js'), 'let a = 1')
    linked(join(outside, 'secret.txt'), join(dir, 'src', 'out.txt'), 'file')
    expect(listProjectFiles(dir)).toEqual([
      { path: 'index.html', bytes: 9 },
      { path: 'js/a.js', bytes: 9 },
    ])
  })

  it('lists nothing when there is no src/ yet', () => {
    rmSync(join(dir, 'src'), { recursive: true })
    expect(listProjectFiles(dir)).toEqual([])
  })
})

describe('checkWrite (spec-v4 3.1: 40 files, 500 KB a file, 2 MB in total)', () => {
  const KB = 1024
  const files = (n: number, bytes = 10) => Array.from({ length: n }, (_, i) => ({ path: `f${i}.js`, bytes }))

  it('holds the numbers of the spec', () => {
    expect(PROJECT_LIMITS).toEqual({ files: 40, fileBytes: 500 * KB, totalBytes: 2 * 1024 * KB })
  })

  it('lets the 40th file in and refuses the 41st, with a plain reason', () => {
    expect(checkWrite(files(39), 'new.js', 10)).toEqual({ ok: true })
    const r = checkWrite(files(40), 'new.js', 10)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/40 files/)
  })

  it('lets a 41st write that replaces a file in', () => {
    expect(checkWrite(files(40), 'f3.js', 20)).toEqual({ ok: true })
  })

  it('takes a 500 KB file and refuses a 501 KB one', () => {
    expect(checkWrite([], 'big.js', 500 * KB)).toEqual({ ok: true })
    const r = checkWrite([], 'big.js', 501 * KB)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/501 KB.*500 KB/)
  })

  it('refuses a write that takes the total over 2 MB, and counts a replaced file once', () => {
    const four = files(4, 500 * KB)
    expect(checkWrite(four, 'more.js', 48 * KB)).toEqual({ ok: true })
    const r = checkWrite(four, 'more.js', 49 * KB)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/2 MB/)
    expect(checkWrite(four, 'f0.js', 500 * KB)).toEqual({ ok: true })
  })
})
