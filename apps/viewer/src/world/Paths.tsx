import { PATH } from './theme.ts'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { qaMode } from '../qa/params.ts'
import { qaRegistry } from '../qa/registry.ts'
import { drawnPaths } from './pathGeometry.ts'
import { nightFactor } from './night.ts'
import { useWorld } from './WorldContext.tsx'
import { worldLand } from './worldLand.ts'

/** How brightly a path glows at night, as the share of its own colour it adds. */
const PATH_NIGHT_GLOW = 0.55

/**
 * The paths between places (spec 4.3): founding paths, the ones an expand made, and the yard paths between places that share a
 * chunk, worked out from the places themselves, as 3 meter tracks laid on the ground as it is drawn (`pathGeometry.ts`). Each runs
 * from the door of one place to the door of the other and goes round every building (`routePath`).
 */
export function Paths() {
  const { world, clock } = useWorld()
  const material = useRef<THREE.MeshStandardMaterial>(null)
  // At night the track glows a little in its own colour, so it can be seen and followed in the dark (the moon alone leaves it grey on dark green).
  useFrame(() => {
    if (material.current) material.current.emissiveIntensity = PATH_NIGHT_GLOW * nightFactor(clock.hour())
  })
  const geometry = useMemo(() => {
    const paths = drawnPaths(world.places, worldLand(world))
    if (qaMode) qaRegistry.paths = paths
    const meshes = paths.map((p) => p.mesh)
    const positions = new Float32Array(meshes.reduce((n, m) => n + m.positions.length, 0))
    const indices = new Uint32Array(meshes.reduce((n, m) => n + m.indices.length, 0))
    let v = 0
    let i = 0
    for (const m of meshes) {
      const offset = v / 3
      positions.set(m.positions, v)
      for (let k = 0; k < m.indices.length; k++) indices[i + k] = m.indices[k]! + offset
      v += m.positions.length
      i += m.indices.length
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.computeVertexNormals()
    return geometry
  }, [world])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial ref={material} color={PATH.color} emissive={PATH.glow} emissiveIntensity={0} roughness={1} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  )
}
