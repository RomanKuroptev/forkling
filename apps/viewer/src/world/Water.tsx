import { shoreline } from '@forkling/sim'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useRef } from 'react'
import type * as THREE from 'three'
import { island } from '../island.ts'

/** Invisible wall along the line where the sea gets this deep, so visitors can paddle but not dive. */
const WALL_DEPTH = 0.6
const WALL_SEGMENTS = 96

const wall = shoreline(island, WALL_SEGMENTS, WALL_DEPTH).map((a, i, ring) => {
  const b = ring[(i + 1) % ring.length]!
  const dx = b.x - a.x
  const dz = b.z - a.z
  return {
    position: [(a.x + b.x) / 2, island.waterLevel, (a.z + b.z) / 2] as [number, number, number],
    rotationY: Math.atan2(dx, dz),
    halfLength: Math.hypot(dx, dz) / 2 + 0.2,
  }
})

export function Water() {
  const water = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (water.current) water.current.position.y = island.waterLevel - 0.15 + Math.sin(clock.elapsedTime * 0.6) * 0.05
  })

  return (
    <>
      <mesh ref={water} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[400, 64]} />
        <meshStandardMaterial color="#3f9fb8" transparent opacity={0.78} roughness={0.15} metalness={0.1} />
      </mesh>
      {/* Sea floor beyond the terrain so the water never looks bottomless. */}
      <mesh rotation-x={-Math.PI / 2} position-y={island.waterLevel - 4.05}>
        <circleGeometry args={[400, 32]} />
        <meshStandardMaterial color="#b9a978" />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        {wall.map((w, i) => (
          <CuboidCollider key={i} args={[0.3, 10, w.halfLength]} position={w.position} rotation={[0, w.rotationY, 0]} />
        ))}
      </RigidBody>
    </>
  )
}
