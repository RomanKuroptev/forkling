import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { contentType, insideRoot, listWorldFiles, shotsToRender } from '../scripts/eyecamLib.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'eyecam-world-'))
})
const put = (rel: string, text = '{}') => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

describe('listWorldFiles', () => {
  it('lists every file of the world with forward slashes, and nothing from git or node_modules', () => {
    put('forkling.json')
    put('objects/bowl.json')
    put('art/photos/pond.jpg', 'x')
    put('.git/config', 'x')
    put('node_modules/a/b.js', 'x')
    expect(listWorldFiles(dir).sort()).toEqual(['art/photos/pond.jpg', 'forkling.json', 'objects/bowl.json'])
  })
})

describe('insideRoot', () => {
  it('accepts paths under the root and refuses the ones that climb out of it', () => {
    expect(insideRoot(dir, 'objects/bowl.json')).toBe(join(dir, 'objects', 'bowl.json'))
    expect(insideRoot(dir, '../secret.txt')).toBeNull()
    expect(insideRoot(dir, 'objects/../../secret.txt')).toBeNull()
  })
})

describe('contentType', () => {
  it('knows what the viewer and the world are made of', () => {
    expect(contentType('index.html')).toMatch(/text\/html/)
    expect(contentType('assets/index-abc.js')).toMatch(/javascript/)
    expect(contentType('assets/x.css')).toMatch(/css/)
    expect(contentType('world/objects/a.json')).toMatch(/json/)
    expect(contentType('models/cat.glb')).toBe('model/gltf-binary')
    expect(contentType('x.wasm')).toBe('application/wasm')
    expect(contentType('art/photos/a.jpg')).toBe('image/jpeg')
    expect(contentType('mystery.bin')).toBe('application/octet-stream')
  })
})

describe('shotsToRender', () => {
  const shot = { id: 'pond', at: '2026-11-03T12:00:00Z', eye: [0, 1, 0], look: [1, 1, 1], why: 'photograph', reason: 'r' }

  it('reads the queued shots from the mind state', () => {
    put('mind/state.json', JSON.stringify({ photos: { date: '2026-11-03', count: 1, queue: [shot] } }))
    expect(shotsToRender(dir).map((s) => s.id)).toEqual(['pond'])
  })

  it('is empty when nothing is queued, or there is no state', () => {
    expect(shotsToRender(dir)).toEqual([])
    put('mind/state.json', '{}')
    expect(shotsToRender(dir)).toEqual([])
  })
})
