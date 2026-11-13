import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { kit } from '@forkling/schema/kit'

const dir = fileURLToPath(new URL('../../../kit/models/', import.meta.url))
const files = readdirSync(dir).filter((f) => f.endsWith('.glb'))
const credits = readFileSync(join(dir, 'CREDITS.md'), 'utf8')

/** A binary glTF: its JSON chunk gives the meshes, the triangles and the box of the positions. */
function glb(file: string) {
  const buf = readFileSync(join(dir, file))
  expect(buf.readUInt32LE(0), `${file} starts like a GLB`).toBe(0x46546c67)
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as {
    meshes: { primitives: { indices?: number; attributes: { POSITION: number } }[] }[]
    accessors: { count: number; min?: number[]; max?: number[] }[]
  }
  let triangles = 0
  let meshes = 0
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const mesh of json.meshes) {
    for (const p of mesh.primitives) {
      meshes++
      triangles += (p.indices !== undefined ? json.accessors[p.indices]!.count : json.accessors[p.attributes.POSITION]!.count) / 3
      const pos = json.accessors[p.attributes.POSITION]!
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i]!, pos.min![i]!)
        max[i] = Math.max(max[i]!, pos.max![i]!)
      }
    }
  }
  return { bytes: buf.length, meshes, triangles, min, max, size: max.map((v, i) => v - min[i]!) }
}

const withModels = kit.parts.filter((p) => p.model)
const MAX_TRIANGLES = 2000
const MAX_MESHES = 2

describe('the kit models (spec 5.3: CC0 model files, each credited, none too heavy)', () => {
  it('has the trees and rocks as models, and every other part as primitives only', () => {
    expect(withModels.map((p) => p.id).sort()).toEqual(['rock-large', 'rock-small', 'tree-pine', 'tree-round', 'tree-tall'])
    for (const p of withModels) expect(p.primitives.length, `${p.id} keeps its primitives as the fallback`).toBeGreaterThan(0)
  })

  it('has every file a part names, and no file that no part names', () => {
    for (const p of withModels) expect(existsSync(join(dir, p.model!.file)), p.id).toBe(true)
    const named = new Set(withModels.map((p) => p.model!.file))
    for (const f of files) expect(named.has(f), `${f} is not used by any part`).toBe(true)
  })

  it('credits every file: its pack, its author, its source and the licence, which is CC0', () => {
    for (const f of files) {
      const line = credits.split('\n').find((l) => l.includes(f))
      expect(line, `${f} is in CREDITS.md`).toBeDefined()
      expect(line).toMatch(/CC0/)
      expect(line).toMatch(/Kenney/)
      expect(line).toMatch(/https:\/\/kenney\.nl\//)
    }
    expect(existsSync(join(dir, 'License-kenney-nature-kit.txt'))).toBe(true)
    expect(readFileSync(join(dir, 'License-kenney-nature-kit.txt'), 'utf8')).toMatch(/Creative Commons Zero, CC0/)
  })

  it('keeps the whole folder under 3 MB', () => {
    const total = readdirSync(dir).reduce((n, f) => n + statSync(join(dir, f)).size, 0)
    expect(total).toBeLessThan(3 * 1024 * 1024)
  })

  it(`keeps each model light: at most ${MAX_MESHES} meshes and ${MAX_TRIANGLES} triangles (the render budget assumes it)`, () => {
    for (const f of files) {
      const g = glb(f)
      expect(g.meshes, f).toBeLessThanOrEqual(MAX_MESHES)
      expect(g.triangles, f).toBeLessThanOrEqual(MAX_TRIANGLES)
    }
  })

  it('stands each model on the ground, and scales it to about the size of the part it stands in for', () => {
    for (const p of withModels) {
      const g = glb(p.model!.file)
      expect(Math.abs(g.min[1]!), `${p.id} stands on y = 0`).toBeLessThan(0.1)
      const model = Math.max(...g.size) * p.model!.scale
      const box = Math.max(...p.size)
      expect(model / box, `${p.id}: ${model.toFixed(2)} m against the part's ${box} m`).toBeGreaterThan(0.6)
      expect(model / box).toBeLessThan(1.4)
    }
  })
})
