import * as THREE from 'three'

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
