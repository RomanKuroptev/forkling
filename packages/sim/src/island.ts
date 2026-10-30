import type { IslandConfig, Vec3 } from '@forkling/schema'
import { fbm2 } from './noise.ts'
import { createPrng } from './prng.ts'

/** How far below the water the sea floor sits, in meters. */
const SEA_DEPTH = 4
/** Feature size of the hills, in meters. */
const NOISE_SCALE = 22

/**
 * Terrain height in meters at world position (x, z). The island is centered on the origin:
 * noise hills shaped by a radial falloff, so the coast is irregular and the edges are underwater.
 */
export function heightAt(x: number, z: number, cfg: IslandConfig): number {
  const half = cfg.size / 2
  const r = Math.hypot(x, z) / half
  // Wobble the coastline so the island isn't a perfect circle.
  const wobble = (fbm2(x / 30, z / 30, cfg.seed + 77, 2) - 0.5) * 0.35
  const island = 1 - smoothstep(0.35, 0.85, r + wobble)
  const hills = fbm2(x / NOISE_SCALE, z / NOISE_SCALE, cfg.seed)
  const land = island * (0.35 + 0.65 * hills)
  const h = cfg.waterLevel - SEA_DEPTH + land * (cfg.maxHeight - cfg.waterLevel + SEA_DEPTH)
  return Math.min(h, cfg.maxHeight)
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export interface Heightfield {
  /** Samples per side, `resolution + 1`. */
  samples: number
  /** Distance between samples in meters. */
  step: number
  /** Row-major heights: `heights[row * samples + col]` at x = -size/2 + col*step, z = -size/2 + row*step. */
  heights: Float32Array
}

export function generateHeightfield(cfg: IslandConfig): Heightfield {
  const samples = cfg.resolution + 1
  const step = cfg.size / cfg.resolution
  const half = cfg.size / 2
  const heights = new Float32Array(samples * samples)
  for (let row = 0; row < samples; row++) {
    for (let col = 0; col < samples; col++) {
      heights[row * samples + col] = heightAt(-half + col * step, -half + row * step, cfg)
    }
  }
  return { samples, step, heights }
}

export interface PropRule {
  kind: string
  variants: number
  count: number
  /** Minimum distance in meters to any other prop. */
  minSpacing: number
  minHeight: number
  maxHeight: number
}

export interface PropPlacement {
  kind: string
  variant: number
  position: Vec3
  rotationY: number
  scale: number
}

export interface ScatterOptions {
  /** Circles kept free of props, e.g. around the spawn point. */
  clear?: { x: number; z: number; radius: number }[]
}

/** Deterministically scatter props over the island using rejection sampling. */
export function scatterProps(cfg: IslandConfig, rules: PropRule[], opts: ScatterOptions = {}): PropPlacement[] {
  const rng = createPrng(cfg.seed ^ 0x5eed)
  const placed: { p: PropPlacement; spacing: number }[] = []
  const half = cfg.size / 2

  for (const rule of rules) {
    let made = 0
    for (let attempt = 0; attempt < rule.count * 40 && made < rule.count; attempt++) {
      const x = rng.range(-half, half)
      const z = rng.range(-half, half)
      const y = heightAt(x, z, cfg)
      if (y < rule.minHeight || y > rule.maxHeight) continue
      if (opts.clear?.some((c) => Math.hypot(x - c.x, z - c.z) < c.radius)) continue
      const tooClose = placed.some(
        ({ p, spacing }) => Math.hypot(x - p.position[0], z - p.position[2]) < Math.max(spacing, rule.minSpacing),
      )
      if (tooClose) continue
      placed.push({
        spacing: rule.minSpacing,
        p: {
          kind: rule.kind,
          variant: rng.int(rule.variants),
          position: [x, y, z],
          rotationY: rng.range(0, Math.PI * 2),
          scale: rng.range(0.8, 1.25),
        },
      })
      made++
    }
  }
  return placed.map(({ p }) => p)
}
