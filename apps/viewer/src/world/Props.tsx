import type { PropPlacement } from '@forkling/sim'
import { useGLTF } from '@react-three/drei'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { props } from '../island.ts'
import { bakePropModel, PROP_MODELS, type PropModel, type PropPart } from './propModels.ts'

const MODEL_DIR = `${import.meta.env.BASE_URL}models/nature/`
const SOURCES = Object.entries(PROP_MODELS).flatMap(([kind, variants]) =>
  variants.map((source, variant) => ({ kind, variant, url: MODEL_DIR + source.file, height: source.height })),
)
/** Trees only block at the trunk, so the visitor can walk under the canopy edge. */
const TRUNK_RADIUS = 0.3

function matrixFor(p: PropPlacement, out: THREE.Matrix4) {
  return out.compose(
    new THREE.Vector3(...p.position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotationY),
    new THREE.Vector3(p.scale, p.scale, p.scale),
  )
}

function PartInstances({ part, placements }: { part: PropPart; placements: PropPlacement[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    placements.forEach((p, i) => mesh.current!.setMatrixAt(i, matrixFor(p, m)))
    mesh.current!.instanceMatrix.needsUpdate = true
    mesh.current!.computeBoundingSphere()
  }, [placements])

  return (
    <instancedMesh
      ref={mesh}
      args={[part.geometry, part.material, placements.length]}
      castShadow
      receiveShadow
    />
  )
}

export function Props() {
  const gltfs = useGLTF(SOURCES.map((s) => s.url))

  const variants = useMemo(
    () =>
      SOURCES.map((s, i) => ({
        ...s,
        model: bakePropModel(gltfs[i]!.scene, s.height),
        placements: props.filter((p) => p.kind === s.kind && p.variant === s.variant),
      })),
    [gltfs],
  )

  const modelFor = (p: PropPlacement): PropModel =>
    variants.find((v) => v.kind === p.kind && v.variant === p.variant)!.model

  return (
    <>
      {variants.flatMap((v) =>
        v.placements.length === 0
          ? []
          : v.model.parts.map((part, i) => (
              <PartInstances key={`${v.kind}-${v.variant}-${i}`} part={part} placements={v.placements} />
            )),
      )}
      <RigidBody type="fixed" colliders={false}>
        {props.map((p, i) => {
          const model = modelFor(p)
          const halfHeight = (model.height * p.scale) / 2
          const radius = (p.kind === 'tree' ? TRUNK_RADIUS : model.radius * 0.8) * p.scale
          return (
            <CylinderCollider
              key={i}
              args={[halfHeight, radius]}
              position={[p.position[0], p.position[1] + halfHeight, p.position[2]]}
            />
          )
        })}
      </RigidBody>
    </>
  )
}

for (const s of SOURCES) useGLTF.preload(s.url)
