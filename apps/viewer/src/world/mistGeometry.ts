import { createPrng, hashString, type Land } from '@forkling/sim'
import { FOG_LAYERS, FOG_LAYER_GAP, fogWalls } from './landGeometry.ts'

/**
 * The mist at the edge of the world (spec 4.1: terrain fading into fog), as plain data so it can be tested without a renderer. It
 * is made of soft, overlapping puffs (camera-facing quads with a blurred edge) scattered along the same sides `fogWalls` finds,
 * so no straight edge shows anywhere: a bank of cloud and not a panel. Nothing is random, so every visitor sees the same bank.
 */
export interface MistPuff {
  x: number
  y: number
  z: number
  /** The width of the puff, in meters. */
  size: number
  /** How opaque it is at its middle, before the fade near the camera. */
  alpha: number
  /** Which side (the index in `fogWalls`) it belongs to. */
  wall: number
}

/** How far apart the puffs on a side are, on average, along it. */
const SPACING = 6

/** The puffs of a land: a few along every fog side in every layer, thicker towards the edge, each a little off the line. */
export function mistPuffs(land: Land): MistPuff[] {
  const out: MistPuff[] = []
  fogWalls(land).forEach((wall, index) => {
    const prng = createPrng(hashString(`mist:${wall.x},${wall.z},${wall.inset},${wall.rotY}`))
    const n = Math.max(1, Math.round(wall.length / SPACING))
    const [alongX, alongZ] = wall.rotY === 0 ? [1, 0] : [0, 1]
    // Thickest on the chunk edge, about half as thick at the innermost layer.
    const depth = 1 - wall.inset / (FOG_LAYERS * FOG_LAYER_GAP)
    for (let k = 0; k < n; k++) {
      const along = -wall.length / 2 + ((k + 0.5) * wall.length) / n + prng.range(-2.5, 2.5)
      const across = prng.range(-4, 4)
      const x = wall.x + alongX * along + alongZ * across
      const z = wall.z + alongZ * along + alongX * across
      const size = prng.range(14, 26)
      out.push({ x, y: land.heightAt(x, z) + size * 0.3 + prng.range(0, 9), z, size, alpha: (0.28 + 0.3 * depth) * prng.range(0.85, 1.15), wall: index })
    }
  })
  return out
}

/** A puff is gone at the camera and whole this far from it (meters), so one close by never fills the screen. */
export const MIST_FADE_NEAR = 3
export const MIST_FADE_FAR = 12

/** How much of a puff shows at `distance` from the camera: 0 to 1, a smoothstep (the shader does the same). */
export function mistFade(distance: number): number {
  const t = Math.min(1, Math.max(0, (distance - MIST_FADE_NEAR) / (MIST_FADE_FAR - MIST_FADE_NEAR)))
  return t * t * (3 - 2 * t)
}

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
const mix = (a: string, b: string, t: number) => toHex([0, 1, 2].map((i) => channel(a, i) * (1 - t) + channel(b, i) * t))
const luminance = (hex: string) => {
  const [r, g, b] = [0, 1, 2].map((i) => {
    const c = channel(hex, i) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * The colour of the mist for the scene's fog colour (`#rrggbb`, the sky at the horizon). By day it is the fog a little paler, soft
 * against the sky and plain against the green hills. At night a mist the colour of the fog would vanish into the sky, so it is
 * pulled well towards a pale moonlit blue and shows as a faint pale bank.
 */
export function mistColor(fog: string): string {
  const day = smoothstep(0.05, 0.5, luminance(fog))
  const target = mix('#cfdcf0', '#ffffff', day)
  return mix(fog, target, 0.75 - 0.4 * day)
}
