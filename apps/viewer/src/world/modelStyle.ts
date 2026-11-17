import * as THREE from 'three'
import { COLORS, MODEL } from './theme.ts'

/**
 * The look's palette by authored material name (`MODEL` in the theme). The Kenney GLBs ship with fully metallic, off-palette
 * colours that render black without an environment map, so every material is restyled to this.
 */
export function restyleMaterial(source: THREE.Material): THREE.MeshStandardMaterial {
  const base = source as THREE.MeshStandardMaterial
  const material = new THREE.MeshStandardMaterial({
    color: MODEL[source.name] ?? base.color ?? COLORS.white,
    metalness: 0.05,
    roughness: 0.5,
    flatShading: true,
  })
  material.name = source.name
  return material
}
