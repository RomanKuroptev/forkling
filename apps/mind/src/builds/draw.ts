import type { Interests, Souvenir } from '@forkling/schema'
import { drawCollision, type Collision } from '@forkling/sim'
import { readPlaces } from '../places.ts'
import { drawConstraint } from '../prompts/constraints.ts'
import type { TinkerCollision, TinkerSouvenir } from './tinker.ts'
import { readAllSouvenirs } from './works.ts'

/** What a tinker, expand or found call is offered besides its task (spec 12.4, items 4 and 5): a constraint, and maybe two souvenirs. */
export interface BuildDraw {
  constraint: string
  collision: TinkerCollision | null
}

const asTinker = (s: Souvenir): TinkerSouvenir => ({ id: s.id, kind: s.kind, content: s.content, source: { title: s.source.title, url: s.source.url } })

/**
 * The draw for one call: the constraint and the collision, both fixed by the forkling's seed and a key naming the call
 * (`sketch:<date>:<step>`, `tinker:<job id>`), so the same call always gets the same draw. It reads the world (places and
 * souvenirs on disk) and the interests, and calls no model.
 */
export function drawForBuild(dir: string, o: { seed: number; key: string; interests: Interests }): BuildDraw {
  const souvenirs = readAllSouvenirs(dir)
  const places = readPlaces(dir)
  const drawn: Collision | null = drawCollision(
    {
      places: places.map((p) => ({ id: p.id, chunk: p.chunk, tags: p.tags })),
      souvenirs: souvenirs.map((s) => ({ id: s.id, placedIn: s.placedIn, topics: s.topics })),
      interests: Object.keys(o.interests.topics),
    },
    o.seed,
    o.key,
  )
  const find = (id: string) => souvenirs.find((s) => s.id === id)
  const name = (id: string) => places.find((p) => p.id === id)?.name ?? id
  let collision: TinkerCollision | null = null
  if (drawn) {
    const [a, b] = [find(drawn.a.souvenir), find(drawn.b.souvenir)]
    if (a && b) {
      collision =
        drawn.how === 'places'
          ? { how: 'places', a: { souvenir: asTinker(a), from: name(drawn.a.place) }, b: { souvenir: asTinker(b), from: name(drawn.b.place) } }
          : { how: 'interests', a: { souvenir: asTinker(a), from: drawn.a.interest }, b: { souvenir: asTinker(b), from: drawn.b.interest } }
    }
  }
  return { constraint: drawConstraint(o.seed, o.key), collision }
}
