import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claimFindings, claimsFromSite } from '../../src/world/claims.ts'
import type { SceneObject } from '../../src/world/open.ts'

const site = (pages: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-claims-'))
  for (const [rel, html] of Object.entries(pages)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), html)
  }
  return dir
}
const entry = (id: string, kind: SceneObject['kind'], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, box: null, visible: true, material: 'solid', ...extra })

const pages = {
  'places/index.html': '<a href="home/">Home</a><a href="workshop/">Workshop</a><a href="../journal/">Diary</a>',
  'places/workshop/index.html': '<section class="exhibit"><p><em>Every work I have made &amp; more.</em></p></section><section class="exhibit"><p><em>A lamp that dims</em></p><div class="work-frame"></div></section>',
  'places/home/index.html': '<p class="quiet">Nothing on show yet.</p>',
}

describe('what the site says is in the world, against the world (audit spec 7.4)', () => {
  it('reads the places and what each place page says is on show', () => {
    expect(claimsFromSite(site(pages))).toEqual({
      places: ['home', 'workshop'],
      exhibits: [
        { place: 'workshop', label: 'Every work I have made & more.' },
        { place: 'workshop', label: 'A lamp that dims' },
      ],
    })
  })

  it('finds nothing when the world has it all', () => {
    const scene = [entry('home', 'place'), entry('workshop', 'place'), entry('workshop/gallery', 'exhibit', { place: 'workshop', name: 'Every work I have made & more.' }), entry('workshop/lamp', 'work', { place: 'workshop', name: 'A lamp that dims' })]
    expect(claimFindings(claimsFromSite(site(pages)), scene, 'day-7')).toEqual([])
  })

  it('planted: a work the site says is in the Workshop is not there, and a place the site lists is missing', () => {
    const scene = [entry('workshop', 'place'), entry('workshop/gallery', 'exhibit', { place: 'workshop', name: 'Every work I have made & more.' })]
    const found = claimFindings(claimsFromSite(site(pages)), scene, 'day-7')
    expect(found.map((f) => f.fingerprint).sort()).toEqual(['world.claim-not-in-world|day-7|home', 'world.claim-not-in-world|day-7|workshop/A lamp that dims'])
    expect(found.every((f) => f.severity === 'major')).toBe(true)
  })
})
