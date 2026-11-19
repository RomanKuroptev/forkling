import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { materialize } from './fixtures.ts'

/**
 * day-7 with the four planted flaws of audit QW.7 together, for the agents' acceptance runs (the world explorer and the look
 * reviewer must report them; `docs/spec/audit/lanes/qw.md`). The browser tests plant them one at a time.
 *
 * 1. A work its file says is installed in the Workshop, but the Workshop does not show it (files).
 * 2. The hillside place pushed through the Workshop (files).
 * 3. Home's sign floating 3 m up (qa.json plant).
 * 4. The signs drawn with a texture that never loaded (qa.json plant).
 */
export const PLANTED = [
  { flaw: 'work-not-in-workshop', where: 'works/stand-still/meta.json says installedIn workshop/bench/0/0' },
  { flaw: 'place-through-place', where: 'places/hillside-room-five-lamps.json moved onto the Workshop' },
  { flaw: 'floating-sign', where: "Home's sign, 3 m up" },
  { flaw: 'missing-texture', where: 'every sign board' },
] as const

const edit = (world: string, rel: string, change: (data: Record<string, unknown>) => void) => {
  const data = JSON.parse(readFileSync(join(world, rel), 'utf8')) as Record<string, unknown>
  change(data)
  writeFileSync(join(world, rel), `${JSON.stringify(data, null, 2)}\n`)
}

export function makePlantedWorld(out: string): string {
  const world = materialize('day-7', out)
  edit(world, 'works/stand-still/meta.json', (m) => (m.installedIn = 'workshop/bench/0/0'))
  edit(world, 'places/hillside-room-five-lamps.json', (p) => {
    p.chunk = [0, 0]
    p.offset = [12, 0]
  })
  edit(world, 'qa.json', (q) => {
    q.plant = { raise: [{ id: 'home/sign', dy: 3 }], missingTexture: ['signs'] }
    q.about = `day-7 with the four planted flaws of audit QW.7: ${PLANTED.map((p) => p.flaw).join(', ')}.`
  })
  return world
}
