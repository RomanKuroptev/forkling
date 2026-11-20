import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { isOpaque, solidBody } from '../src/forkling/solidBody.ts'

// Issue 455: Merge's body looked see-through up close. Whatever a species pack's model ships with, the body is drawn opaque.
const body = () => {
  const root = new THREE.Group()
  const fur = new THREE.MeshStandardMaterial({ name: 'fur', transparent: true, opacity: 0.6, depthWrite: false })
  const eyes = new THREE.MeshBasicMaterial({ name: 'eyes' })
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), fur))
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), [eyes, fur]))
  return root
}

describe('the forkling body is opaque (issue 455)', () => {
  it('planted: a body with a half-transparent material is not opaque', () => {
    expect(isOpaque(body())).toBe(false)
  })

  it('makes every material of the body opaque, writing depth, so nothing behind it shows through', () => {
    const root = solidBody(body())
    expect(isOpaque(root)).toBe(true)
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material
      for (const x of m ? [m].flat() : []) {
        expect(x.transparent).toBe(false)
        expect(x.opacity).toBe(1)
        expect(x.depthWrite).toBe(true)
      }
    })
  })

  it('leaves an opaque body as it is', () => {
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    expect(isOpaque(root)).toBe(true)
    expect(isOpaque(solidBody(root))).toBe(true)
  })
})
