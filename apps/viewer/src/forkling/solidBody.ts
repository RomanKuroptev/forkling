import type * as THREE from 'three'

const materialsOf = (root: THREE.Object3D): THREE.Material[] => {
  const out: THREE.Material[] = []
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (m) out.push(...[m].flat())
  })
  return out
}

/** True when every material of the body draws solid: not blended, fully opaque and writing depth. */
export function isOpaque(root: THREE.Object3D): boolean {
  return materialsOf(root).every((m) => !m.transparent && m.opacity === 1 && m.depthWrite)
}

/**
 * Makes a forkling's body opaque, whatever its species pack's model ships with (issue 455: the body read as see-through up close,
 * with the legs behind it showing). The body is a solid thing; glass and glow belong to the world, not to it. Changes the
 * materials in place and returns the root.
 */
export function solidBody<T extends THREE.Object3D>(root: T): T {
  for (const m of materialsOf(root)) {
    if (m.transparent || m.opacity !== 1 || !m.depthWrite) {
      m.transparent = false
      m.opacity = 1
      m.depthWrite = true
      m.needsUpdate = true
    }
  }
  return root
}
