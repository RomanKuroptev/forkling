import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Beliefs, BudgetLedger, Forkling, forklingPackIssues, Goals, MindState, objectIdFromPath, PlanStep, Skills, SpeciesPack, WorldObject, type Material } from '@forkling/schema'
import { collectSpots, isWalkable, matchesTarget, runPlan, starterWorld, sunDirection, worldWithObjects } from '@forkling/sim'
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
        if ('asset' in object.model) expect(existsSync(join(assets, `${object.model.asset}.glb`)), `${path}: ${object.model.asset}`).toBe(true)
      }
    })

    it('keeps people.json a list', () => {
      if (!paths.includes('memory/people.json')) return
      expect(Array.isArray(read(join(dir, 'memory/people.json')))).toBe(true)
    })

    it('starts with no beliefs, and a place for the memory stream', () => {
      if (!paths.includes('memory/beliefs.json')) return
      expect(Beliefs.parse(read(join(dir, 'memory/beliefs.json')))).toEqual([])
      expect(paths).toContain('memory/stream/.gitkeep')
    })

    it('only contains files a world repo is allowed to have', () => {
      const allowed = /^(forkling\.json|README\.md|objects\/.+|memory\/.+|journal\/.+|mind\/.+|brain\/.+|events\/.+|\.github\/workflows\/(mind|heartbeat)\.yml)$/
      for (const path of paths) expect(path).toMatch(allowed)
    })

    it('has mind files that fit their schemas', () => {
      const schemas = { 'mind/goals.json': Goals, 'mind/state.json': MindState, 'brain/budget.json': BudgetLedger, 'brain/skills.json': Skills }
      for (const [path, schema] of Object.entries(schemas)) {
        if (paths.includes(path)) expect(schema.safeParse(read(join(dir, path))).success, path).toBe(true)
      }
    })
  })
}

describe('templates/forkling-world', () => {
  it('ships every top-level folder a world needs', () => {
    for (const folder of ['objects', 'memory', 'journal']) expect(existsSync(join(root, 'forkling-world', folder))).toBe(true)
    expect(existsSync(join(root, 'forkling-world', 'forkling.json'))).toBe(true)
  })

  it('starts with no goals, no memory of objects and a $10 ledger', () => {
    const dir = join(root, 'forkling-world')
    expect(Goals.parse(read(join(dir, 'mind/goals.json')))).toEqual({})
    expect(MindState.parse(read(join(dir, 'mind/state.json'))).knownObjects).toEqual([])
    const ledger = BudgetLedger.parse(read(join(dir, 'brain/budget.json')))
    expect(ledger.spentUsd).toBe(0)
    expect(ledger.capUsd).toBe(10)
    expect(existsSync(join(dir, 'events/inbox/.gitkeep'))).toBe(true)
    expect(existsSync(join(dir, 'brain/persona.md'))).toBe(true)
  })

  it('wakes the mind on a schedule and on visitor events, one run at a time, from a pinned engine', () => {
    const workflow = readFileSync(join(root, 'forkling-world', '.github/workflows/mind.yml'), 'utf8')
    // Off the busy :00 and :30 marks, and under 10 so the hourly sleeping-hours tick still lands on it.
    expect(workflow).toMatch(/cron: '[3-9]-59\/10 \* \* \* \*'/)
    expect(workflow).toMatch(/repository_dispatch:\s+types: \[visitor-event\]/)
    expect(workflow).toMatch(/concurrency:\s+group: mind\s+cancel-in-progress: false/)
    expect(workflow).toMatch(/FORKLING_REF: v\d+\.\d+\.\d+\s/)
    expect(workflow).toMatch(/contents: write/)
    expect(workflow).toMatch(/id-token: write/)
    expect(workflow).toMatch(/audience=https:\/\/api\.anthropic\.com/)
    expect(workflow).toMatch(/ANTHROPIC_IDENTITY_TOKEN_FILE=/)
    expect(workflow).toMatch(/if \[ -z "\$ANTHROPIC_API_KEY" \]; then unset ANTHROPIC_API_KEY; fi/)
    expect(workflow).toMatch(/ANTHROPIC_API_KEY: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/)
    expect(workflow).toMatch(/git commit -m "chore\(mind\): /)
  })
})

describe('templates/forkling-world heartbeat', () => {
  const heartbeat = () => readFileSync(join(root, 'forkling-world', '.github/workflows/heartbeat.yml'), 'utf8')

  it('is opt-in, so worlds whose cron works do not keep a runner busy', () => {
    expect(heartbeat()).toMatch(/if: vars\.MIND_HEARTBEAT == 'true'/)
  })

  it('runs one at a time, in its own group so it never blocks a mind tick', () => {
    expect(heartbeat()).toMatch(/concurrency:\s+group: heartbeat\s+cancel-in-progress: false/)
    expect(heartbeat()).not.toMatch(/group: mind/)
  })

  it('dispatches the mind every 10 minutes at :03, skips if one just ran, and hands over to itself before the 6 hour limit', () => {
    const text = heartbeat()
    expect(text).toMatch(/permissions:\s+actions: write/)
    expect(text).toMatch(/\* 600 \+ 180/)
    expect(text).toMatch(/gh workflow run mind\.yml/)
    expect(text).toMatch(/gh workflow run heartbeat\.yml/)
    expect(text).toMatch(/-lt 240/)
    expect(text).toMatch(/timeout-minutes: 3[0-4]\d/)
  })

  it('keeps a restarter on a staggered cron', () => {
    expect(heartbeat()).toMatch(/cron: '\d-59\/30 \* \* \* \*'/)
  })
})

describe('templates/merge', () => {
  it('has a persona of its own for the owner to review', () => {
    const persona = readFileSync(join(root, 'merge', 'brain/persona.md'), 'utf8')
    expect(persona.trim().length).toBeGreaterThan(40)
  })
})

describe('templates/forkling-world starter objects', () => {
  const pack = packs.cat!
  const readAll = (template: string) => {
    const dir = join(root, template, 'objects')
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => WorldObject.parse(read(join(dir, f))))
  }
  const starter = readAll('forkling-world')
  const byId = (id: string) => starter.find((o) => o.id === id)!

  it('has a home, tools and places, each unlocking verbs of its own', () => {
    for (const id of ['house', 'desk', 'workbench', 'kitchen', 'garden', 'bookshelf', 'drum', 'telescope', 'bed', 'bowl', 'water-bowl']) {
      expect(byId(id), id).toBeDefined()
    }
    expect(byId('desk').unlocks).toEqual(expect.arrayContaining(['write', 'draw', 'code']))
    expect(byId('workbench').unlocks).toEqual(expect.arrayContaining(['build', 'join', 'shape', 'sew', 'paint', 'tinker']))
    expect(byId('kitchen').unlocks).toEqual(['cook'])
    expect(byId('garden').unlocks).toEqual(['plant'])
    expect(byId('bookshelf').unlocks).toEqual(expect.arrayContaining(['read', 'study']))
    expect(byId('drum').unlocks).toEqual(expect.arrayContaining(['play', 'compose']))
    expect(byId('telescope').unlocks).toEqual(['observe'])
  })

  it('gives every material a source that refills slowly', () => {
    const gives = new Map(starter.filter((o) => o.yields).map((o) => [o.yields!.material, o.yields!]))
    for (const material of ['wood', 'stone', 'clay', 'flowers', 'fibre', 'shells', 'produce'] as Material[]) {
      const source = gives.get(material)
      expect(source, material).toBeDefined()
      expect(source!.respawnHours).toBeGreaterThanOrEqual(12)
    }
  })

  it('has a bowl to eat from that is never used up, and a place to keep things', () => {
    expect(byId('bowl').properties).toMatchObject({ edible: true, carryable: false })
    expect(starter.some((o) => o.properties.storage)).toBe(true)
  })

  it('gives every object verb of the cat something to work on, except what must be made first', () => {
    const needsMaking = new Set(['dine', 'water', 'harvest'])
    for (const verb of pack.actions) {
      if (verb.target.type !== 'object' || needsMaking.has(verb.id)) continue
      const target = verb.target
      expect(
        starter.some((o) => matchesTarget(target, verb.id, o)),
        `nothing in the starter world for ${verb.id}`,
      ).toBe(true)
    }
  })

  it('uses ids that do not collide with the objects of a specific world', () => {
    const ids = new Set(starter.map((o) => o.id))
    for (const o of readAll('merge')) expect(ids.has(o.id), o.id).toBe(false)
  })

  it('puts everything where the body can reach it', () => {
    const world = worldWithObjects([...starter, ...readAll('merge')])
    const spots = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(12), world.objects)
    for (const o of starter) {
      expect(spots[o.id]?.length, `${o.id} is somewhere unreachable`).toBe(1)
      expect(isWalkable(world.nav.grid, spots[o.id]![0]!.x, spots[o.id]![0]!.z), o.id).toBe(true)
    }
  })

  it('lets a cat gather, put away and build, all the way through, with nothing but these files', () => {
    const step = (verb: string, extra: Record<string, unknown> = {}) => PlanStep.parse({ verb, reason: 'Because I can.', minutes: 5, ...extra })
    const run = runPlan({
      pack: { ...pack, needs: Object.fromEntries(Object.entries(pack.needs).map(([id, n]) => [id, { ...n!, decayPerHour: 0 }])) },
      seed: 12,
      startMs: Date.parse('2026-11-03T09:00:00Z'),
      objects: starter,
      steps: [
        step('pick_up', { targetId: 'driftwood' }),
        step('put_on', { targetId: 'house' }),
        step('pick_up', { targetId: 'pebbles' }),
        step('put_on', { targetId: 'house' }),
        step('build', { targetId: 'workbench', materials: ['wood', 'stone'], makes: 'a driftwood marker' }),
        step('pick_up', { targetId: 'meadow' }),
        step('put_on', { targetId: 'house' }),
        step('plant', { targetId: 'garden', materials: ['flowers'], makes: 'a first flower' }),
      ],
    })
    expect(run.steps.map((s) => s.reason ?? 'ok')).toEqual(Array(8).fill('ok'))
    expect(run.objects.find((o) => o.id === 'a-driftwood-marker')?.made?.done).toBe(true)
    expect(run.objects.find((o) => o.id === 'a-first-flower')?.grows?.gives).toBe('flowers')
    expect(run.stored).toEqual({})
  })
})
