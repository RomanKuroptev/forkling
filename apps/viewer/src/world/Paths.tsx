import { createLand, derivePaths, pathPolyline, placeCentre, toLandPlace } from '@forkling/sim'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { pathRibbon, type IndexedMesh } from './landGeometry.ts'
import { useWorld } from './WorldContext.tsx'

/** The paths between places (spec 4.3), worked out from the places themselves, as 3 meter tracks along the ground. */
export function Paths() {
  const { world } = useWorld()
  const geometry = useMemo(() => {
    const places = world.places.map(toLandPlace)
    const land = createLand(world.forkling.seed, places)
    const inside = (x: number, z: number) =>
      places.some((p) => {
        const [px, pz] = placeCentre(p)
        return Math.abs(x - px) <= p.footprint[0] / 2 && Math.abs(z - pz) <= p.footprint[1] / 2
      })
    const meshes: IndexedMesh[] = derivePaths(world.places.map(toLandPlace)).map((path) => pathRibbon(pathPolyline(path.chunks), (x, z) => land.heightAt(x, z), { skip: inside }))
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
      <meshStandardMaterial color="#c9b588" roughness={1} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  )
}
