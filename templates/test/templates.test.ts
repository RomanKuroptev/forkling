import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Forkling, forklingPackIssues, objectIdFromPath, SpeciesPack, WorldObject } from '@forkling/schema'
import { isWalkable, starterWorld } from '@forkling/sim'
import catSpecies from '@forkling/species-cat/species.json'

const root = fileURLToPath(new URL('..', import.meta.url))
const assets = fileURLToPath(new URL('../../apps/viewer/public/models', import.meta.url))
const packs: Record<string, SpeciesPack> = { cat: SpeciesPack.parse(catSpecies) }
const { nav } = starterWorld()

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? files(full) : [full]
  })
}

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

/** Each world template is a full repo (`forkling-world`) or the files a specific world changes on top of it (`merge`). */
for (const template of ['forkling-world', 'merge']) {
  const dir = join(root, template)
  const paths = files(dir).map((f) => relative(dir, f).replaceAll('\\', '/'))

  describe(`templates/${template}`, () => {
    it('has a valid forkling.json that matches its species pack and stands on dry land', () => {
      if (!paths.includes('forkling.json')) return
      const forkling = Forkling.parse(read(join(dir, 'forkling.json')))
      const pack = packs[forkling.species]
      expect(pack, `no species pack "${forkling.species}"`).toBeDefined()
      expect(forklingPackIssues(forkling, pack!)).toEqual([])
      expect(isWalkable(nav.grid, forkling.position[0], forkling.position[2])).toBe(true)
    })

    it('has objects that parse, are named after their id and use shipped assets', () => {
      for (const path of paths.filter((p) => p.startsWith('objects/') && p.endsWith('.json'))) {
        const object = WorldObject.parse(read(join(dir, path)))
        expect(objectIdFromPath(path), path).toBe(object.id)
        expect(existsSync(join(assets, `${object.model.asset}.glb`)), `${path}: ${object.model.asset}`).toBe(true)
      }
    })

    it('keeps people.json a list', () => {
      if (!paths.includes('memory/people.json')) return
      expect(Array.isArray(read(join(dir, 'memory/people.json')))).toBe(true)
    })

    it('only contains files a world repo is allowed to have', () => {
      const allowed = /^(forkling\.json|README\.md|objects\/.+|memory\/.+|journal\/.+)$/
      for (const path of paths) expect(path).toMatch(allowed)
    })
  })
}

describe('templates/forkling-world', () => {
  it('ships every top-level folder a world needs', () => {
    for (const folder of ['objects', 'memory', 'journal']) expect(existsSync(join(root, 'forkling-world', folder))).toBe(true)
    expect(existsSync(join(root, 'forkling-world', 'forkling.json'))).toBe(true)
  })
})
