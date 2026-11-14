import { allPaths, createLand, placeCentre, routePath, toLandPlace } from '@forkling/sim'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { pathRibbon, type IndexedMesh } from './landGeometry.ts'
import { nightFactor } from './night.ts'
import { useWorld } from './WorldContext.tsx'
import { stakedChunks } from './worldLand.ts'

/** How brightly a path glows at night, as the share of its own colour it adds. */
const PATH_NIGHT_GLOW = 0.55

/**
 * The paths between places (spec 4.3): founding paths and the ones an expand made, worked out from the places themselves, as 3 meter
 * tracks along the ground. Each runs from the door of one place to the door of the other and goes round every building (`routePath`).
 */
export function Paths() {
  const { world, clock } = useWorld()
  const material = useRef<THREE.MeshStandardMaterial>(null)
  // At night the track glows a little in its own colour, so it can be seen and followed in the dark (the moon alone leaves it grey on dark green).
  useFrame(() => {
    if (material.current) material.current.emissiveIntensity = PATH_NIGHT_GLOW * nightFactor(clock.hour())
  })
  const geometry = useMemo(() => {
    const places = world.places.map(toLandPlace)
    const land = createLand(world.forkling.seed, places, stakedChunks(world.requests))
    const inside = (x: number, z: number) =>
      places.some((p) => {
        const [px, pz] = placeCentre(p)
        return Math.abs(x - px) <= p.footprint[0] / 2 && Math.abs(z - pz) <= p.footprint[1] / 2
      })
    const meshes: IndexedMesh[] = allPaths(places).map((path) => pathRibbon(routePath(path, places), (x, z) => land.heightAt(x, z), { skip: inside }))
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
      <meshStandardMaterial ref={material} color="#c9b588" emissive="#c9b588" emissiveIntensity={0} roughness={1} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  )
}
