export interface Prng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform float in [min, max). */
  range(min: number, max: number): number
  /** Uniform integer in [0, n). */
  int(n: number): number
}

/** Seeded mulberry32. Use this instead of Math.random() everywhere in sim. */
export function createPrng(seed: number): Prng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (n) => Math.floor(next() * n),
  }
}

/** FNV-1a over the UTF-16 units of a string: a stable 32-bit number for a key. */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The generator for one draw: fixed by the forkling's seed and a key that names the draw (`tinker:<id>`), so a draw can be repeated. */
export function drawPrng(seed: number, key: string): Prng {
  const rng = createPrng((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ hashString(key)) >>> 0)
  rng.next()
  return rng
}
