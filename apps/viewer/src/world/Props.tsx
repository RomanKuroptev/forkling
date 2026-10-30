import type { PropPlacement } from '@forkling/sim'
import { BallCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { props } from '../island.ts'

interface Part {
  geometry: THREE.BufferGeometry
  color: string
}

function part(geometry: THREE.BufferGeometry, color: string, y: number, scale: [number, number, number] = [1, 1, 1]): Part {
  geometry.scale(...scale)
  geometry.translate(0, y, 0)
  return { geometry, color }
}

const TRUNK = '#7a5636'
const PINE = '#3f7d4a'
const LEAVES = '#6fa94a'
const STONE = '#9a958b'

/** Low-poly models per kind and variant, built from primitives. Each part becomes one instanced draw call. */
const MODELS: Record<string, Part[][]> = {
  tree: [
    [
      part(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), TRUNK, 0.6),
      part(new THREE.ConeGeometry(1.0, 2.2, 7), PINE, 2.0),
      part(new THREE.ConeGeometry(0.72, 1.6, 7), PINE, 2.9),
    ],
    [
      part(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6), TRUNK, 0.8),
      part(new THREE.IcosahedronGeometry(1.25, 0), LEAVES, 2.5),
    ],
    [
      part(new THREE.CylinderGeometry(0.12, 0.16, 1.6, 6), TRUNK, 0.8),
      part(new THREE.ConeGeometry(0.9, 2.4, 6), PINE, 2.4),
      part(new THREE.ConeGeometry(0.6, 1.8, 6), PINE, 3.5),
    ],
  ],
  rock: [
    [part(new THREE.DodecahedronGeometry(0.7, 0), STONE, 0.15, [1, 0.6, 0.9])],
    [part(new THREE.IcosahedronGeometry(0.5, 0), STONE, 0.2)],
    [part(new THREE.DodecahedronGeometry(1.1, 0), STONE, 0.2, [1.3, 0.7, 1])],
  ],
}

function matrixFor(p: PropPlacement, out: THREE.Matrix4) {
  return out.compose(
    new THREE.Vector3(...p.position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotationY),
    new THREE.Vector3(p.scale, p.scale, p.scale),
  )
}

function PartInstances({ part, placements }: { part: Part; placements: PropPlacement[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    placements.forEach((p, i) => mesh.current!.setMatrixAt(i, matrixFor(p, m)))
    mesh.current!.instanceMatrix.needsUpdate = true
    mesh.current!.computeBoundingSphere()
  }, [placements])

  return (
    <instancedMesh ref={mesh} args={[part.geometry, undefined, placements.length]} castShadow receiveShadow>
      <meshStandardMaterial color={part.color} flatShading roughness={0.9} />
    </instancedMesh>
  )
}

export function Props() {
  const groups = useMemo(() => {
    const out: { key: string; part: Part; placements: PropPlacement[] }[] = []
    for (const [kind, variants] of Object.entries(MODELS)) {
      variants.forEach((parts, variant) => {
        const placements = props.filter((p) => p.kind === kind && p.variant === variant)
        if (placements.length === 0) return
        parts.forEach((part, i) => out.push({ key: `${kind}-${variant}-${i}`, part, placements }))
      })
    }
    return out
  }, [])

  return (
    <>
      {groups.map((g) => (
        <PartInstances key={g.key} part={g.part} placements={g.placements} />
      ))}
      <RigidBody type="fixed" colliders={false}>
        {props.map((p, i) =>
          p.kind === 'tree' ? (
            <CylinderCollider
              key={i}
              args={[1.5 * p.scale, 0.3 * p.scale]}
              position={[p.position[0], p.position[1] + 1.5 * p.scale, p.position[2]]}
            />
          ) : (
            <BallCollider key={i} args={[0.55 * p.scale * (p.variant === 2 ? 1.5 : 1)]} position={p.position} />
          ),
        )}
      </RigidBody>
    </>
  )
}
