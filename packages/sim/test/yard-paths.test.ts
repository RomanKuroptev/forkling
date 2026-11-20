import { describe, expect, it } from 'vitest'
import type { LandPlace } from '../src/land.ts'
import { allPaths, yardPaths } from '../src/paths.ts'

const place = (id: string, chunk: [number, number], founded: string, paths?: { to: string; at: string }[]): LandPlace & { founded: string; paths?: { to: string; at: string }[] } => ({ id, chunk, footprint: [10, 10], tags: [id], related: [], founded, ...(paths ? { paths } : {}) })

describe('yard paths: a short walk between places that share a chunk and no path (issue 434)', () => {
  const home = place('home', [0, 0], '2026-11-01')
  const workshop = place('workshop', [0, 0], '2026-11-01')

  it('joins the Workshop to Home, which share a chunk and have no founding path between them', () => {
    const places = [home, workshop]
    expect(yardPaths(places, allPaths(places))).toEqual([{ from: 'workshop', to: 'home', chunks: [[0, 0]], kind: 'yard' }])
  })

  it('adds nothing when the place already has a path of its own', () => {
    const places = [home, place('workshop', [0, 0], '2026-11-01', [{ to: 'home', at: '2026-11-05' }])]
    expect(yardPaths(places, allPaths(places))).toEqual([])
  })

  it('adds nothing for places alone in their chunk, or a world of one place', () => {
    const far = place('far', [1, 0], '2026-11-03')
    expect(yardPaths([home, far], allPaths([home, far]))).toEqual([])
    expect(yardPaths([home], [])).toEqual([])
  })

  it('takes places in founding order, Home and the Workshop first, so the same world gives the same yard', () => {
    const shed = place('shed', [0, 0], '2026-11-04')
    const places = [shed, workshop, home]
    expect(yardPaths(places, allPaths(places)).map((p) => `${p.from}>${p.to}`)).toEqual(['workshop>home', 'shed>home'])
  })
})
