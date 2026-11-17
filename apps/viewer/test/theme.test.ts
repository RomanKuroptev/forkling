import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { kit } from '@forkling/schema/kit'
import { describe, expect, it } from 'vitest'
import { COLORS, KIT_REPAINT, SKY } from '../src/world/theme.ts'

const src = join(__dirname, '..', 'src')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : []
  })

describe('the theme file', () => {
  it('is the only place in the viewer where a hex colour is typed', () => {
    const found: string[] = []
    for (const f of files(src)) {
      if (f.replace(/\\/g, '/').endsWith('/world/theme.ts')) continue
      const hits = readFileSync(f, 'utf8').match(/['"`]#[0-9a-fA-F]{3,8}['"`]/g)
      if (hits) found.push(`${f}: ${hits.join(' ')}`)
    }
    expect(found).toEqual([])
  })

  it('repaints every fixed hex colour in the kit', () => {
    const hexes = new Set<string>()
    for (const part of kit.parts) for (const p of part.primitives) if (p.color.startsWith('#')) hexes.add(p.color.toLowerCase())
    const missing = [...hexes].filter((h) => !(h in KIT_REPAINT))
    expect(missing).toEqual([])
  })

  it('keeps the sky stops and sun size of look.md', () => {
    expect(SKY.stops).toEqual({ pink: 0.1, purple: 0.26, top: 0.5 })
    expect(SKY.sunSize).toBeCloseTo(0.24, 2)
    expect(SKY.day.horizon).toBe(COLORS.peach)
    expect(SKY.night.top).toBe(COLORS.night)
  })

  it('keeps the palette ids and names of the kit', () => {
    expect(kit.palettes.map((p) => p.id)).toEqual(['harbour', 'meadow', 'ember', 'moss', 'dusk', 'paper', 'slate', 'coral'])
  })
})
