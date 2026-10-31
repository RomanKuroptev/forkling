import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkPaths, validateWorld, BUILDER_PATHS } from '../src/validate.ts'
import { loadSpecies } from '../src/species.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')

describe('checkPaths', () => {
  it('lets the builder touch only its own folders', () => {
    expect(BUILDER_PATHS).toEqual(['objects/', 'art/', 'site/', 'notebook/', 'journal/'])
    expect(checkPaths(['objects/clay-shelf.json', 'art/photos/a.jpg', 'site/projects/a/index.html', 'notebook/x.md', 'journal/2026-11-03.md']).ok).toBe(true)
  })

  it('refuses everything else, and names it', () => {
    const r = checkPaths(['objects/a.json', 'brain/persona.md', '.github/workflows/mind.yml', 'mind/state.json', 'memory/beliefs.json', 'forkling.json', 'CLAUDE.md'])
    expect(r.ok).toBe(false)
    expect(r.offending).toEqual(['brain/persona.md', '.github/workflows/mind.yml', 'mind/state.json', 'memory/beliefs.json', 'forkling.json', 'CLAUDE.md'])
  })

  it('does not be fooled by a folder name used as a prefix, or a path that climbs out', () => {
    expect(checkPaths(['objects-evil/a.json']).ok).toBe(false)
    expect(checkPaths(['objects/../brain/persona.md']).ok).toBe(false)
    expect(checkPaths(['/objects/a.json']).ok).toBe(false)
  })

  it('calls a change that adds or edits only objects data-only, and anything else not', () => {
    expect(checkPaths(['objects/a.json', 'objects/b.json']).dataOnly).toBe(true)
    expect(checkPaths(['objects/a.json', 'art/x.json']).dataOnly).toBe(false)
    expect(checkPaths(['objects/readme.md']).dataOnly).toBe(false)
    expect(checkPaths(['objects/sub/a.json']).dataOnly).toBe(false)
    expect(checkPaths([]).dataOnly).toBe(false)
  })
})

describe('validateWorld', () => {
  let dir: string
  const put = (rel: string, text: string) => {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'validate-'))
    cpSync(world, dir, { recursive: true })
    cpSync(merge, dir, { recursive: true })
  })

  const check = () => validateWorld(dir, { pack: cat.pack, behaviors: cat.behaviors })
  const shelf = {
    id: 'clay-shelf',
    kind: 'shelf',
    name: 'A clay shelf',
    position: [-6, 0, 10],
    model: { parts: [{ shape: 'box', size: [1, 0.1, 0.4], at: [0, 0.6, 0], color: '#b5651d' }] },
    reason: 'For my cups.',
  }

  it('finds nothing wrong with the starter world', () => {
    expect(check().problems).toEqual([])
  })

  it('accepts a good object added to the world', () => {
    put('objects/clay-shelf.json', JSON.stringify(shelf))
    expect(check().problems).toEqual([])
  })

  it('names an object that does not fit the schema', () => {
    put('objects/clay-shelf.json', JSON.stringify({ ...shelf, model: { parts: [] } }))
    expect(check().problems.join('\n')).toMatch(/objects\/clay-shelf\.json/)
  })

  it('names an object whose id does not match its file', () => {
    put('objects/clay-shelf.json', JSON.stringify({ ...shelf, id: 'other' }))
    expect(check().problems.join('\n')).toMatch(/doesn't match the file name/)
  })

  it('names an artifact that does not fit, which the mind would silently skip', () => {
    put('art/bad.json', JSON.stringify({ id: 'bad', kind: 'writing', title: 'x' }))
    expect(check().problems.join('\n')).toMatch(/art\/bad\.json/)
  })

  it('refuses a photo that is not a small jpeg', () => {
    put('art/photos/x.jpg', 'not a picture')
    expect(check().problems.join('\n')).toMatch(/art\/photos\/x\.jpg/)
  })

  it('refuses an object built on the water, where nothing can reach it', () => {
    put('objects/clay-shelf.json', JSON.stringify({ ...shelf, position: [44, 0, 44] }))
    expect(check().problems.join('\n')).toMatch(/clay-shelf.*(water|reach|land)/i)
  })

  it('refuses a world with no forkling', () => {
    const empty = mkdtempSync(join(tmpdir(), 'validate-empty-'))
    expect(validateWorld(empty, { pack: cat.pack, behaviors: cat.behaviors }).problems.length).toBeGreaterThan(0)
  })

  it('runs the whole world for a thousand ticks without anything breaking', () => {
    put('objects/clay-shelf.json', JSON.stringify(shelf))
    const r = check()
    expect(r.ticks).toBe(1000)
    expect(r.problems).toEqual([])
  })

  it('does not alter the world it checks', () => {
    const before = readFileSync(join(dir, 'forkling.json'), 'utf8')
    copyFileSync(join(dir, 'forkling.json'), join(dir, 'forkling.copy'))
    check()
    expect(readFileSync(join(dir, 'forkling.json'), 'utf8')).toBe(before)
  })
})
