import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { restyleMaterial } from '../src/world/modelStyle.ts'

describe('restyleMaterial', () => {
  const authored = new THREE.MeshStandardMaterial({ color: '#2cd8b8', metalness: 1, roughness: 1 })
  authored.name = 'leafsDark'

  it('is matte and non-metallic, so it is lit without an environment map', () => {
    const m = restyleMaterial(authored)
    expect(m.metalness).toBe(0)
    expect(m.roughness).toBeGreaterThan(0.7)
  })

  it('replaces the authored colour with the palette, by material name', () => {
    const leaves = restyleMaterial(authored).color
    const bark = restyleMaterial(Object.assign(authored.clone(), { name: 'woodBarkDark' })).color
    expect(leaves.getHex()).not.toBe(authored.color.getHex())
    expect(leaves.g).toBeGreaterThan(leaves.r)
    expect(bark.r).toBeGreaterThan(bark.b)
  })

  it('does not mutate the loaded material and keeps unknown names as authored', () => {
    restyleMaterial(authored)
    expect(authored.metalness).toBe(1)
    const unknown = Object.assign(authored.clone(), { name: 'mystery' })
    expect(restyleMaterial(unknown).color.getHex()).toBe(authored.color.getHex())
  })
})
