import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Place } from '@forkling/schema'
import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

export interface Expected {
  id: string
  kind: 'place' | 'room' | 'work'
  file: string
}

interface RawPlace {
  file: string
  id: string
  data: unknown
  error: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [])

/** Every place file as written, read as plain JSON: a file the schema would drop is still here, which is the point. */
function rawPlaces(dir: string): RawPlace[] {
  const placesDir = join(dir, 'places')
  if (!existsSync(placesDir)) return []
  return readdirSync(placesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const file = `places/${f}`
      const fallback = f.replace(/\.json$/, '')
      try {
        const data = JSON.parse(readFileSync(join(placesDir, f), 'utf8')) as Record<string, unknown>
        return { file, id: str(data?.id) ?? fallback, data, error: null }
      } catch (e) {
        return { file, id: fallback, data: null, error: `not JSON (${e instanceof Error ? e.message : String(e)})` }
      }
    })
}

/** What the files say the world has: each place, its rooms and the works shown in it. */
export function expectedFromFiles(dir: string): Expected[] {
  return rawPlaces(dir).flatMap((p) => {
    const data = (p.data ?? {}) as Record<string, unknown>
    return [
      { id: p.id, kind: 'place' as const, file: p.file },
      ...list(data.rooms).flatMap((r) => (str(r.id) ? [{ id: `${p.id}/${r.id}`, kind: 'room' as const, file: p.file }] : [])),
      ...list(data.exhibits).flatMap((e) => (str(e.id) && e.kind === 'work' ? [{ id: `${p.id}/${e.id}`, kind: 'work' as const, file: p.file }] : [])),
    ]
  })
}

const WORDS = { place: 'place', room: 'room', work: 'work', merge: 'Merge' } as const

/**
 * Every place, room and work the files name, and Merge, is in `__qa.scene()` exactly once (audit spec 7.2, steps Q1). The files
 * are read raw: a place the viewer leaves out because it does not fit the schema is the finding, with the schema's reason.
 */
export function sceneListsFiles(dir: string, scene: readonly SceneObject[], fixture: string): CheckResult[] {
  const out: CheckResult[] = []
  const count = new Map<string, number>()
  for (const o of scene) count.set(`${o.kind}|${o.id}`, (count.get(`${o.kind}|${o.id}`) ?? 0) + 1)
  const raw = new Map(rawPlaces(dir).map((p) => [p.id, p]))
  const missingPlaces = new Set<string>()
  const finding = (kind: keyof typeof WORDS, id: string, title: string, what: string, where?: string): CheckResult => ({
    id: 'world.scene-lists-files',
    fingerprint: `world.scene-lists-files|${fixture}|${kind}|${id}`,
    severity: 'major',
    title,
    what,
    causes: kind === 'merge' ? 'A visitor comes to see Merge and finds no one.' : `A visitor never sees this ${WORDS[kind]}, though the site and the diary may talk about it.`,
    evidence: [],
    ...(where ? { where } : {}),
    fixKind: 'code',
    fixture,
  })
  for (const e of expectedFromFiles(dir)) {
    const n = count.get(`${e.kind}|${e.id}`) ?? 0
    const placeId = e.id.split('/')[0]!
    if (n === 0) {
      if (e.kind !== 'place' && missingPlaces.has(placeId)) continue
      if (e.kind === 'place') missingPlaces.add(e.id)
      const p = raw.get(placeId)
      const why = e.kind !== 'place' ? '' : p?.error ? ` The file is ${p.error}.` : (() => {
        const parsed = Place.safeParse(p?.data)
        return parsed.success ? '' : ` The file does not fit the schema, so the viewer leaves it out: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}.`
      })()
      out.push(finding(e.kind, e.id, `The ${WORDS[e.kind]} ${e.id} is missing from the 3D world`, `${e.file} names the ${WORDS[e.kind]} ${e.id}, but the world does not draw it.${why}`, e.file))
    } else if (n > 1) {
      out.push(finding(e.kind, e.id, `The ${WORDS[e.kind]} ${e.id} is in the 3D world twice`, `The world draws the ${WORDS[e.kind]} ${e.id} ${n} times; ${e.file} names it once.`, e.file))
    }
  }
  const merges = scene.filter((o) => o.kind === 'merge').length
  if (merges === 0) out.push(finding('merge', 'merge', 'Merge is missing from the 3D world', 'The scene has no Merge.'))
  if (merges > 1) out.push(finding('merge', 'merge', 'Merge is in the 3D world twice', `The scene has ${merges} Merges.`))
  return out
}
