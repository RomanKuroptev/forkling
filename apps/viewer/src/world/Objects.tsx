import type { WorldObject } from '@forkling/schema'
import { heightAt } from '@forkling/sim'
import { useGLTF } from '@react-three/drei'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import { island } from '../island.ts'
import { assetHeight, assetUrl } from './assets.ts'
import { bakePropModel } from './propModels.ts'
import { useWorld } from './WorldContext.tsx'

/** The world repo's own objects, standing on the terrain, solid to the visitor. */
export function Objects() {
  const { world } = useWorld()
  return (
    <>
      {world.objects.map((o) => ('asset' in o.model ? <RepoObject key={o.id} object={o} asset={o.model.asset} /> : null))}
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
