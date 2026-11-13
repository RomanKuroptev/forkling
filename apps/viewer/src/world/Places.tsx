import { kit } from '@forkling/schema/kit'
import { createLand, placeCentre, toLandPlace } from '@forkling/sim'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { visitor } from '../visitor.ts'
import { ROUND_SEGMENTS, SPHERE_SEGMENTS, interiorsToLoad, sceneInstances, wallBoxes, type Shape, type ShapeInstances } from './kitGeometry.ts'
import { useWorld } from './WorldContext.tsx'

/** The unit shapes every part is made of; an instance scales them to its primitive's size. */
const GEOMETRIES: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, SPHERE_SEGMENTS[0], SPHERE_SEGMENTS[1]),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, ROUND_SEGMENTS),
  cone: new THREE.ConeGeometry(0.5, 1, ROUND_SEGMENTS),
}

/** One draw call for all the instances of a shape, each with its own matrix and colour. */
function Shapes({ shape, data }: { shape: Shape; data: ShapeInstances }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    m.instanceMatrix = new THREE.InstancedBufferAttribute(data.matrices, 16)
    m.instanceColor = new THREE.InstancedBufferAttribute(data.colors, 3)
    m.count = data.count
  }, [data])
  if (data.count === 0) return null
  // The capacity is fixed when the mesh is made, so a different number of instances is a new mesh.
  return (
    <instancedMesh key={data.count} ref={mesh} args={[GEOMETRIES[shape], undefined, data.count]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial flatShading roughness={0.9} />
    </instancedMesh>
  )
}

/**
 * Every place: its outside always, its inside only for the place the visitor is in and the ones around it (spec 4.6), all drawn as one
 * instanced mesh per shape. The walls have colliders with the same door gap as the cat's own world has.
 */
export function Places() {
  const { world } = useWorld()
  const land = useMemo(() => createLand(world.forkling.seed, world.places.map(toLandPlace)), [world])
  const [interiors, setInteriors] = useState<ReadonlySet<string>>(() => interiorsToLoad(world.places, visitor.position))
  const key = useRef('')
  useFrame(() => {
    const next = interiorsToLoad(world.places, visitor.position)
    const id = [...next].sort().join(',')
    if (id !== key.current) {
      key.current = id
      setInteriors(next)
    }
  })

  const scene = useMemo(() => sceneInstances(world.places, kit, { heightAt: (x, z) => land.heightAt(x, z), interiors }), [world, land, interiors])
  const walls = useMemo(
    () =>
      world.places.flatMap((place) => {
        const [px, pz] = placeCentre(toLandPlace(place))
        const base = land.heightAt(px, pz)
        return wallBoxes(place).map((b) => ({
          position: [(b.x0 + b.x1) / 2, base + b.height / 2, (b.z0 + b.z1) / 2] as [number, number, number],
          half: [(b.x1 - b.x0) / 2, b.height / 2, (b.z1 - b.z0) / 2] as [number, number, number],
        }))
      }),
    [world, land],
  )

  return (
    <>
      <Shapes shape="box" data={scene.box} />
      <Shapes shape="sphere" data={scene.sphere} />
      <Shapes shape="cylinder" data={scene.cylinder} />
      <Shapes shape="cone" data={scene.cone} />
      <RigidBody type="fixed" colliders={false}>
        {walls.map((w, i) => (
          <CuboidCollider key={i} args={w.half} position={w.position} />
        ))}
      </RigidBody>
    </>
  )
}
