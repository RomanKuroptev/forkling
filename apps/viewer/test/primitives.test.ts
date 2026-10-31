import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { ModelPart } from '@forkling/schema'
import { partsGroup } from '../src/world/primitives.ts'

const parts: ModelPart[] = [
  { shape: 'box', size: [0.4, 0.2, 0.4], at: [0, 0.1, 0], color: '#a67c52' },
  { shape: 'sphere', size: [0.3, 0.3, 0.3], at: [0.1, 0.35, 0], rotation: [0.1, 0.2, 0.3], color: '#8a8d91' },
  { shape: 'cylinder', size: [0.1, 0.5, 0.1], at: [-0.2, 0.25, 0], color: '#5cb85c' },
  { shape: 'cone', size: [0.2, 0.3, 0.2], at: [0, 0.6, 0], color: '#e86fa0' },
]

describe('partsGroup', () => {
  it('makes one mesh per part, sized and placed as the file says', () => {
    const group = partsGroup(parts)
    expect(group.children).toHaveLength(4)
    const [box, sphere] = group.children as THREE.Mesh[]
    expect(box!.scale.toArray()).toEqual([0.4, 0.2, 0.4])
    expect(box!.position.toArray()).toEqual([0, 0.1, 0])
    expect(sphere!.rotation.x).toBeCloseTo(0.1)
    expect(sphere!.position.y).toBeCloseTo(0.35)
  })

  it('colours each part', () => {
    const [box] = partsGroup(parts).children as THREE.Mesh[]
    expect((box!.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('a67c52')
  })

  it('darkens everything for food that has gone off, and shines wet paint', () => {
    const [plain] = partsGroup(parts).children as THREE.Mesh[]
    const [off] = partsGroup(parts, { dim: 0.45 }).children as THREE.Mesh[]
    const [wet] = partsGroup(parts, { glossy: true }).children as THREE.Mesh[]
    const m = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial
    expect(m(off!).color.r).toBeLessThan(m(plain!).color.r)
    expect(m(wet!).roughness).toBeLessThan(m(plain!).roughness)
  })

  it('shares geometry between parts of a shape, so many things stay cheap', () => {
    const [a] = partsGroup([parts[0]!]).children as THREE.Mesh[]
    const [b] = partsGroup([parts[0]!]).children as THREE.Mesh[]
    expect(a!.geometry).toBe(b!.geometry)
  })
})
