import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { rules } from '../src/island.ts'
import { bakePropModel, PROP_MODELS } from '../src/world/propModels.ts'

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
    expect(model.parts.map((p) => p.material)).toEqual([bark, leaves])
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
})
