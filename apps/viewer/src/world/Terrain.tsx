import { heightAt } from '@forkling/sim'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { useMemo } from 'react'
import * as THREE from 'three'
import { island } from '../island.ts'

const SAND = new THREE.Color('#e3cf9a')
const GRASS = new THREE.Color('#7cb356')
const DARK_GRASS = new THREE.Color('#5a9443')
const ROCK = new THREE.Color('#8f8a80')
const SEABED = new THREE.Color('#c9b98a')

function colorFor(height: number, slope: number, out: THREE.Color) {
  const w = island.waterLevel
  if (height < w + 0.1) return out.copy(SEABED)
  if (height < w + 0.9) return out.copy(SAND)
  if (slope > 0.55 || height > island.maxHeight * 0.8) return out.copy(ROCK)
  return out.copy(GRASS).lerp(DARK_GRASS, Math.min(1, (height - w) / island.maxHeight))
}

/** Flat-shaded low-poly terrain plus a trimesh collider built from the exact same vertices. */
export function Terrain() {
  const { geometry, vertices, indices } = useMemo(() => {
    const indexed = new THREE.PlaneGeometry(island.size, island.size, island.resolution, island.resolution)
    indexed.rotateX(-Math.PI / 2)
    const pos = indexed.attributes.position!
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heightAt(pos.getX(i), pos.getZ(i), island))
    }
    const vertices = new Float32Array(pos.array)
    const indices = new Uint32Array(indexed.index!.array)

    // Non-indexed copy so every triangle gets its own flat normal and colour.
    const geometry = indexed.toNonIndexed()
    geometry.computeVertexNormals()
    const p = geometry.attributes.position!
    const n = geometry.attributes.normal!
    const colors = new Float32Array(p.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i += 3) {
      const h = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3
      colorFor(h, 1 - n.getY(i), c)
      for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    indexed.dispose()
    return { geometry, vertices, indices }
  }, [])

  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={[vertices, indices]} />
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} />
      </mesh>
    </RigidBody>
  )
}
