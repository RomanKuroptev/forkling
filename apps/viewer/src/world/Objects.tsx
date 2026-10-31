import type { ModelPart, WorldObject } from '@forkling/schema'
import { heightAt, objectStatusAt } from '@forkling/sim'
import { useGLTF } from '@react-three/drei'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { useEffect, useMemo } from 'react'
import { island } from '../island.ts'
import { assetHeight, assetUrl } from './assets.ts'
import { Contraption } from './Contraption.tsx'
import { bakePropModel } from './propModels.ts'
import { disposeParts, partsGroup } from './primitives.ts'
import { useWorld } from './WorldContext.tsx'

/** Things smaller than this are not solid: a visitor walks over a pebble. */
const SOLID_FROM_SIZE = 0.3

/** How big a plant is at each stage of growing. */
const STAGE_SCALE = { none: 1, seed: 0.45, growing: 0.75, ripe: 1 } as const

/** The world repo's own objects, standing on the terrain, solid to the visitor. Anything in the forkling's paws is not on the ground. */
export function Objects() {
  const { world } = useWorld()
  return (
    <>
      {world.objects.map((o) => {
        if (o.state.held) return null
        if (o.contraption && 'parts' in o.model) return <Contraption key={o.id} object={o} />
        return 'asset' in o.model ? <RepoObject key={o.id} object={o} asset={o.model.asset} /> : <PartsObject key={o.id} object={o} parts={o.model.parts} />
      })}
    </>
  )
}

function RepoObject({ object, asset }: { object: WorldObject; asset: string }) {
  const gltf = useGLTF(assetUrl(asset))
  const model = useMemo(() => bakePropModel(gltf.scene, assetHeight(asset)), [gltf, asset])
  const [x, , z] = object.position
  const y = heightAt(x, z, island)
  const halfHeight = (model.height * object.scale) / 2
  const radius = model.radius * 0.8 * object.scale

  return (
    <group position={[x, y, z]} rotation={object.rotation} scale={object.scale} name={object.id}>
      {model.parts.map((part, i) => (
        <mesh key={i} geometry={part.geometry} material={part.material} castShadow receiveShadow />
      ))}
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[halfHeight / object.scale, radius / object.scale]} position={[0, halfHeight / object.scale, 0]} />
      </RigidBody>
    </group>
  )
}

/** A thing the forkling composed from primitives: a shelf, a cairn, a dish, a plant. How grown, wet or spoiled it is comes from its dates. */
function PartsObject({ object, parts }: { object: WorldObject; parts: ModelPart[] }) {
  const { clock } = useWorld()
  const status = objectStatusAt(object, clock.now())
  const group = useMemo(() => partsGroup(parts, { dim: status.spoiled ? 0.45 : 1, glossy: status.wet }), [parts, status.spoiled, status.wet])
  useEffect(() => () => disposeParts(group), [group])

  const [x, , z] = object.position
  const y = heightAt(x, z, island)
  const size = object.properties.size
  const scale = object.scale * STAGE_SCALE[status.stage]

  return (
    <group position={[x, y, z]} rotation={object.rotation} scale={scale} name={object.id}>
      <primitive object={group} />
      {size >= SOLID_FROM_SIZE && (
        <RigidBody type="fixed" colliders={false}>
          <CylinderCollider args={[size / 2, Math.max(0.15, size * 0.4)]} position={[0, size / 2, 0]} />
        </RigidBody>
      )}
    </group>
  )
}
