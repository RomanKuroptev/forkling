import type { ModelPart } from '@forkling/schema'
import * as THREE from 'three'

/** One geometry per shape, scaled per part, so a world full of made things stays cheap. */
const GEOMETRY: Record<ModelPart['shape'], THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.IcosahedronGeometry(0.5, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
}

export interface PartsOptions {
  /** Multiplies every colour: food that has gone off is dim. */
  dim?: number
  /** Freshly painted things catch the light. */
  glossy?: boolean
}

/** A composed model (what a forkling makes) as flat-shaded meshes. The group owns its materials; the geometry is shared. */
export function partsGroup(parts: readonly ModelPart[], { dim = 1, glossy = false }: PartsOptions = {}): THREE.Group {
  const group = new THREE.Group()
  for (const part of parts) {
    const color = new THREE.Color(part.color).multiplyScalar(dim)
    const mesh = new THREE.Mesh(GEOMETRY[part.shape], new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: glossy ? 0.35 : 0.9, metalness: 0 }))
    mesh.scale.set(...part.size)
    mesh.position.set(...part.at)
    if (part.rotation) mesh.rotation.set(...part.rotation)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  return group
}

/** Frees the materials of a group from `partsGroup`. The shared geometry stays. */
export function disposeParts(group: THREE.Group): void {
  for (const child of group.children) ((child as THREE.Mesh).material as THREE.Material).dispose()
}
