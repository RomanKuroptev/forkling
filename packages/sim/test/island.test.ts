import { describe, expect, it } from 'vitest'
import { IslandConfig } from '@forkling/schema'
import { generateHeightfield, heightAt, scatterProps, type PropRule } from '../src/island.ts'

const cfg = IslandConfig.parse({ seed: 1234 })

const rules: PropRule[] = [
  { kind: 'tree', variants: 3, count: 40, minSpacing: 4, minHeight: cfg.waterLevel + 1, maxHeight: cfg.maxHeight * 0.7 },
  { kind: 'rock', variants: 3, count: 25, minSpacing: 3, minHeight: cfg.waterLevel + 0.3, maxHeight: cfg.maxHeight },
]

describe('heightAt', () => {
  it('is deterministic', () => {
    expect(heightAt(3.3, -7.1, cfg)).toBe(heightAt(3.3, -7.1, cfg))
  })

  it('changes with the seed', () => {
    const other = IslandConfig.parse({ seed: 99 })
    expect(heightAt(10, 10, cfg)).not.toBe(heightAt(10, 10, other))
  })

  it('has land above water in the middle', () => {
    expect(heightAt(0, 0, cfg)).toBeGreaterThan(cfg.waterLevel)
  })

  it('sinks below water at the edges', () => {
    const h = cfg.size / 2
    for (const [x, z] of [[h, 0], [-h, 0], [0, h], [0, -h], [h, h]] as const) {
      expect(heightAt(x, z, cfg)).toBeLessThan(cfg.waterLevel)
    }
  })

  it('never exceeds maxHeight', () => {
    for (let x = -50; x <= 50; x += 2.5) {
      for (let z = -50; z <= 50; z += 2.5) {
        expect(heightAt(x, z, cfg)).toBeLessThanOrEqual(cfg.maxHeight)
      }
    }
  })
})

describe('generateHeightfield', () => {
  it('has (resolution+1)^2 samples matching heightAt on the grid', () => {
    const field = generateHeightfield(cfg)
    const n = cfg.resolution + 1
    expect(field.heights.length).toBe(n * n)
    const step = cfg.size / cfg.resolution
    // row-major: index = row * n + col, x = -size/2 + col*step, z = -size/2 + row*step
    const row = 17
    const col = 42
    expect(field.heights[row * n + col]).toBeCloseTo(
      heightAt(-cfg.size / 2 + col * step, -cfg.size / 2 + row * step, cfg),
      6,
    )
  })

  it('makes a reasonably sized island', () => {
    const { heights } = generateHeightfield(cfg)
    const land = heights.filter((h) => h > cfg.waterLevel).length / heights.length
    expect(land).toBeGreaterThan(0.25)
    expect(land).toBeLessThan(0.75)
  })
})

describe('scatterProps', () => {
  const props = scatterProps(cfg, rules)

  it('is deterministic', () => {
    expect(scatterProps(cfg, rules)).toEqual(props)
  })

  it('places props only within their height band', () => {
    for (const p of props) {
      const rule = rules.find((r) => r.kind === p.kind)!
      const h = heightAt(p.position[0], p.position[2], cfg)
      expect(h).toBeGreaterThanOrEqual(rule.minHeight)
      expect(h).toBeLessThanOrEqual(rule.maxHeight)
      expect(p.position[1]).toBeCloseTo(h, 6)
    }
  })

  it('keeps props apart', () => {
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        const a = props[i]!
        const b = props[j]!
        const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])
        const spacing = Math.max(
          rules.find((r) => r.kind === a.kind)!.minSpacing,
          rules.find((r) => r.kind === b.kind)!.minSpacing,
        )
        expect(d).toBeGreaterThanOrEqual(spacing)
      }
    }
  })

  it('keeps a clear spot around the spawn point', () => {
    for (const p of scatterProps(cfg, rules, { clear: [{ x: 0, z: 0, radius: 6 }] })) {
      expect(Math.hypot(p.position[0], p.position[2])).toBeGreaterThanOrEqual(6)
    }
  })

  it('places a decent number of each kind with valid variants', () => {
    for (const rule of rules) {
      const ofKind = props.filter((p) => p.kind === rule.kind)
      expect(ofKind.length).toBeGreaterThan(rule.count / 2)
      expect(ofKind.length).toBeLessThanOrEqual(rule.count)
      for (const p of ofKind) {
        expect(p.variant).toBeGreaterThanOrEqual(0)
        expect(p.variant).toBeLessThan(rule.variants)
      }
    }
  })
})
