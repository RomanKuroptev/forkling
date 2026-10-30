import { existsSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { rules } from '../src/island.ts'
import { bakePropModel, PROP_MODELS, restyleMaterial } from '../src/world/propModels.ts'

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), material)
  mesh.position.set(x, y, z)
  return mesh
}

function bounds(model: ReturnType<typeof bakePropModel>) {
  const b = new THREE.Box3()
  for (const p of model.parts) {
    p.geometry.computeBoundingBox()
    b.union(p.geometry.boundingBox!)
  }
  return b
}

describe('bakePropModel', () => {
  const bark = new THREE.MeshStandardMaterial()
  const leaves = new THREE.MeshStandardMaterial()

  it('scales the model to the target height with its base at y = 0', () => {
    const scene = new THREE.Group().add(box(1, 2, 1, bark, 0, 0.5, 0))
    const model = bakePropModel(scene, 4)
    const b = bounds(model)
    expect(b.min.y).toBeCloseTo(0)
    expect(b.max.y).toBeCloseTo(4)
    expect(model.height).toBeCloseTo(4)
  })

  it('bakes nested transforms into the geometry', () => {
    const inner = new THREE.Group().add(box(1, 1, 1, bark))
    inner.position.set(2, 0, 0)
    const scene = new THREE.Group().add(inner)
    const b = bounds(bakePropModel(scene, 1))
    expect(b.min.x).toBeCloseTo(1.5)
    expect(b.max.x).toBeCloseTo(2.5)
  })

  it('merges meshes that share a material into one part', () => {
    const scene = new THREE.Group().add(box(1, 1, 1, bark), box(0.5, 2, 0.5, bark), box(2, 1, 2, leaves, 0, 2, 0))
    const model = bakePropModel(scene, 3)
    expect(model.parts).toHaveLength(2)
    // One restyled copy per source material, never the loaded material itself.
    const materials = model.parts.map((p) => p.material)
    expect(new Set(materials).size).toBe(2)
    expect(materials).not.toContain(bark)
    expect(materials).not.toContain(leaves)
  })

  it('reports the footprint radius around the pivot', () => {
    const scene = new THREE.Group().add(box(2, 1, 2, bark), box(1, 1, 1, bark, 3, 0, 0))
    const model = bakePropModel(scene, 1)
    // Furthest corner of the offset box.
    expect(model.radius).toBeCloseTo(Math.hypot(3.5, 0.5))
  })

  it('leaves the source geometry untouched', () => {
    const mesh = box(1, 1, 1, bark)
    const before = Array.from(mesh.geometry.attributes.position!.array)
    bakePropModel(new THREE.Group().add(mesh), 5)
    expect(Array.from(mesh.geometry.attributes.position!.array)).toEqual(before)
  })
})

describe('PROP_MODELS', () => {
  it('has one model per variant for every scattered kind', () => {
    for (const rule of rules) {
      expect(PROP_MODELS[rule.kind], rule.kind).toHaveLength(rule.variants)
    }
  })

  it('points at model files that ship with the viewer', () => {
    for (const source of Object.values(PROP_MODELS).flat()) {
      expect(existsSync(new URL(`../public/models/nature/${source.file}`, import.meta.url)), source.file).toBe(true)
    }
  })
})

describe('restyleMaterial', () => {
  const authored = new THREE.MeshStandardMaterial({ color: '#2cd8b8', metalness: 1, roughness: 1 })
  authored.name = 'leafsDark'

  it('is matte and non-metallic, so it is lit without an environment map', () => {
    const m = restyleMaterial(authored)
    expect(m.metalness).toBe(0)
    expect(m.roughness).toBeGreaterThan(0.7)
  })

  it('replaces the authored colour with the island palette, by material name', () => {
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
