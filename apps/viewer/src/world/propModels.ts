import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface PropModelSource {
  /** GLB file under `public/models/nature/`, from the Kenney Nature Kit (CC0). */
  file: string
  /** Height in meters at prop scale 1. */
  height: number
}

/** Models per kind, indexed by the variant that `scatterProps` picks. */
export const PROP_MODELS: Record<string, PropModelSource[]> = {
  tree: [
    { file: 'tree_pineDefaultA.glb', height: 4.2 },
    { file: 'tree_default.glb', height: 3.8 },
    { file: 'tree_pineTallA.glb', height: 5.2 },
  ],
  rock: [
    { file: 'rock_smallA.glb', height: 0.6 },
    { file: 'rock_largeA.glb', height: 1.0 },
    { file: 'rock_tallA.glb', height: 1.6 },
  ],
}

/**
 * Island palette by authored material name. The Kenney GLBs ship with fully metallic, off-palette
 * colours that render black without an environment map, so every material is restyled to this.
 */
const PALETTE: Record<string, string> = {
  woodBark: '#7a5636',
  woodBarkDark: '#6a4a2f',
  leafsGreen: '#6fa94a',
  leafsDark: '#3f7d4a',
  dirt: '#9a958b',
  grass: '#8aa37a',
  _defaultMat: '#8a867d',
}

/** A matte copy of a loaded material in the island palette. The loaded material is left untouched. */
export function restyleMaterial(source: THREE.Material): THREE.MeshStandardMaterial {
  const base = source as THREE.MeshStandardMaterial
  const material = new THREE.MeshStandardMaterial({
    color: PALETTE[source.name] ?? base.color ?? '#ffffff',
    metalness: 0,
    roughness: 0.9,
    flatShading: true,
  })
  material.name = source.name
  return material
}

export interface PropPart {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

export interface PropModel {
  /** One part per material, each drawn as a single instanced mesh. */
  parts: PropPart[]
  height: number
  /** Furthest horizontal distance from the pivot, in meters. */
  radius: number
}

/**
 * Flatten a loaded scene into one geometry per material, with all transforms baked in,
 * scaled to `height` meters and resting on y = 0. The pivot in x/z is kept as authored.
 */
export function bakePropModel(scene: THREE.Object3D, height: number): PropModel {
  scene.updateWorldMatrix(true, true)
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const restyled = new Map<THREE.Material, THREE.Material>()
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const geometry = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld)
    const material = restyled.get(o.material as THREE.Material) ?? restyleMaterial(o.material as THREE.Material)
    restyled.set(o.material as THREE.Material, material)
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), geometry])
  })

  const parts = [...byMaterial].map(([material, geometries]) => ({
    material,
    geometry: geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries)!,
  }))

  const bounds = new THREE.Box3()
  for (const p of parts) {
    p.geometry.computeBoundingBox()
    bounds.union(p.geometry.boundingBox!)
  }
  const s = height / (bounds.max.y - bounds.min.y)
  let radius = 0
  for (const p of parts) {
    p.geometry.translate(0, -bounds.min.y, 0).scale(s, s, s)
    p.geometry.computeBoundingBox()
    p.geometry.computeBoundingSphere()
    const pos = p.geometry.attributes.position!
    for (let i = 0; i < pos.count; i++) radius = Math.max(radius, Math.hypot(pos.getX(i), pos.getZ(i)))
  }
  return { parts, height, radius }
}
