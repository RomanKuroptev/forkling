import { worldLand } from './worldLand.ts'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { landMesh, visibleChunks } from './landGeometry.ts'
import { useWorld } from './WorldContext.tsx'

const GRASS = new THREE.Color('#86b95c')
const DARK_GRASS = new THREE.Color('#5f9a46')
const MEADOW = new THREE.Color('#a3c46a')
/** Squares of 2 meters: gentle terrain, and few enough triangles for a world of 64 places. */
const SEGMENTS = 16

/** The ground of every owned and edge chunk, flat-shaded low-poly like the island was, with one collider built from the same vertices. */
export function Land() {
  const { world } = useWorld()
  const { geometry, vertices, indices } = useMemo(() => {
    const land = worldLand(world)
    const mesh = landMesh(land, SEGMENTS)
    const indexed = new THREE.BufferGeometry()
    indexed.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    indexed.setIndex(new THREE.BufferAttribute(mesh.indices, 1))

    // A copy where every triangle has its own flat normal and colour.
    const geometry = indexed.toNonIndexed()
    geometry.computeVertexNormals()
    const p = geometry.attributes.position!
    const colors = new Float32Array(p.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i += 3) {
      const h = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3
      const t = Math.min(1, Math.max(0, (h + 5) / 10))
      // A little variety from place to place on the ground, from where the triangle is.
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3
      const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3
      c.copy(GRASS).lerp(DARK_GRASS, t).lerp(MEADOW, 0.25 + 0.25 * Math.sin(x * 0.11) * Math.cos(z * 0.13))
      for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    indexed.dispose()
    return { geometry, vertices: mesh.positions, indices: mesh.indices }
  }, [world])

  // `?debug` lets a browser test know how far the land reaches, to go and look at its edge.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return
    const chunks = visibleChunks(worldLand(world))
    Object.assign(window, {
      __forklingLand: () => ({
        minX: Math.min(...chunks.map((c) => c.chunk[0])) * 32,
        maxX: (Math.max(...chunks.map((c) => c.chunk[0])) + 1) * 32,
        minZ: Math.min(...chunks.map((c) => c.chunk[1])) * 32,
        maxZ: (Math.max(...chunks.map((c) => c.chunk[1])) + 1) * 32,
        chunks: chunks.map((c) => [c.chunk[0], c.chunk[1], c.owned]),
      }),
    })
  }, [world])

  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={[vertices, indices]} />
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} />
      </mesh>
    </RigidBody>
  )
}
