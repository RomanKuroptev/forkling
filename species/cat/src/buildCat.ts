import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildClips } from './clips.ts'
import { BONES, PARENT, REST, type BoneName } from './skeleton.ts'

const FUR = new THREE.Color('#e08f3c')
const BELLY = new THREE.Color('#f4e2c0')
const STRIPE = new THREE.Color('#9a561c')
const PINK = new THREE.Color('#e8a0a0')
const EYE = new THREE.Color('#7cc24a')
const DARK = new THREE.Color('#2a1d14')

/** Rest position of each bone in the cat's space, from the local offsets in `skeleton.ts`. */
const ABS = {} as Record<BoneName, THREE.Vector3>
for (const name of BONES) {
  const parent = PARENT[name]
  const offset = new THREE.Vector3(...REST[name])
  ABS[name] = parent ? ABS[parent].clone().add(offset) : offset
}

type Binding = BoneName | { from: BoneName; to: BoneName; z0: number; z1: number }
type ColorFn = (normal: THREE.Vector3, position: THREE.Vector3) => THREE.Color

/** Positions a primitive: scale, then rotate about x and z, then translate. */
function place(x: number, y: number, z: number, scale: [number, number, number] = [1, 1, 1], rx = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)),
    new THREE.Vector3(...scale),
  )
  return m
}

/** One flat-shaded, vertex-coloured, rigidly (or z-blended) skinned piece of the cat. */
function part(source: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color | ColorFn, bind: Binding): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone()
  geometry.deleteAttribute('uv')
  geometry.applyMatrix4(matrix)
  geometry.computeVertexNormals()

  const pos = geometry.attributes.position!
  const normal = geometry.attributes.normal!
  const colors = new Float32Array(pos.count * 3)
  const skinIndex = new Uint16Array(pos.count * 4)
  const skinWeight = new Float32Array(pos.count * 4)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(normal, i)
    const c = typeof color === 'function' ? color(n, p) : color
    c.toArray(colors, i * 3)
    if (typeof bind === 'string') {
      skinIndex[i * 4] = BONES.indexOf(bind)
      skinWeight[i * 4] = 1
    } else {
      const t = THREE.MathUtils.clamp((p.z - bind.z0) / (bind.z1 - bind.z0), 0, 1)
      skinIndex[i * 4] = BONES.indexOf(bind.from)
      skinIndex[i * 4 + 1] = BONES.indexOf(bind.to)
      skinWeight[i * 4] = 1 - t
      skinWeight[i * 4 + 1] = t
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
  return geometry
}

const sphere = (detail = 1) => new THREE.IcosahedronGeometry(1, detail)
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const cylinder = (rTop: number, rBottom: number, length: number, sides = 6) => new THREE.CylinderGeometry(rTop, rBottom, length, sides)

/** Lighter belly and chest, fur everywhere else. */
const bodyColor: ColorFn = (n, p) => (n.y < -0.35 || (n.z > 0.55 && p.y < 0.26) ? BELLY : FUR)

const BODY_BLEND = { from: 'hips', to: 'chest', z0: -0.04, z1: 0.1 } as const

function buildParts(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []

  // Torso.
  parts.push(part(sphere(), place(0, 0.225, 0, [0.095, 0.09, 0.2]), bodyColor, BODY_BLEND))
  parts.push(part(sphere(), place(0, 0.225, 0.15, [0.085, 0.085, 0.085]), bodyColor, 'chest'))
  for (const z of [-0.12, -0.04, 0.04]) {
    parts.push(part(box(0.05, 0.014, 0.03), place(0, 0.307, z), STRIPE, BODY_BLEND))
  }

  // Neck and head.
  parts.push(part(cylinder(0.04, 0.046, 0.09), place(0, 0.285, 0.255), FUR, 'neck'))
  parts.push(part(sphere(), place(0, 0.335, 0.315, [0.075, 0.065, 0.068]), FUR, 'head'))
  parts.push(part(box(0.05, 0.035, 0.035), place(0, 0.318, 0.375), BELLY, 'head'))
  parts.push(part(box(0.016, 0.012, 0.012), place(0, 0.328, 0.395), PINK, 'head'))
  for (const side of [1, -1]) {
    parts.push(part(box(0.014, 0.016, 0.008), place(side * 0.032, 0.345, 0.378), EYE, 'head'))
    parts.push(part(box(0.006, 0.014, 0.004), place(side * 0.032, 0.345, 0.383), DARK, 'head'))
    const ear: BoneName = side === 1 ? 'earL' : 'earR'
    parts.push(part(new THREE.ConeGeometry(0.04, 0.075, 4), place(side * 0.05, 0.405, 0.3, [1, 1, 0.8], 0, -side * 0.15), FUR, ear))
    parts.push(part(new THREE.ConeGeometry(0.022, 0.05, 4), place(side * 0.05, 0.4, 0.31, [1, 1, 0.6], 0, -side * 0.15), PINK, ear))
  }

  // Tail: four ringed segments running back from the hips.
  const tail: [BoneName, number, number, THREE.Color][] = [
    ['tail1', 0.1, 0.024, FUR],
    ['tail2', 0.1, 0.021, STRIPE],
    ['tail3', 0.1, 0.019, FUR],
    ['tail4', 0.08, 0.017, STRIPE],
  ]
  for (const [bone, length, radius, color] of tail) {
    const at = ABS[bone]
    parts.push(part(cylinder(radius * 0.9, radius, length), place(at.x, at.y, at.z - length / 2, [1, 1, 1], Math.PI / 2), color, bone))
  }
  parts.push(part(sphere(0), place(ABS.tail4.x, ABS.tail4.y, ABS.tail4.z - 0.08, [0.017, 0.017, 0.017]), STRIPE, 'tail4'))

  // Legs: upper, lower and a pale paw. Hind legs get a haunch.
  const legs: [BoneName, BoneName, number][] = [
    ['legFL1', 'legFL2', 1],
    ['legFR1', 'legFR2', -1],
    ['legBL1', 'legBL2', 1],
    ['legBR1', 'legBR2', -1],
  ]
  for (const [upper, lower, side] of legs) {
    const hind = upper.startsWith('legB')
    const top = ABS[upper]
    const knee = ABS[lower]
    parts.push(part(cylinder(0.026, hind ? 0.03 : 0.028, top.y - knee.y), place(top.x, (top.y + knee.y) / 2, top.z), FUR, upper))
    if (hind) parts.push(part(sphere(), place(top.x + side * 0.005, top.y + 0.01, top.z - 0.01, [0.045, 0.07, 0.075]), FUR, upper))
    const ankle = 0.035
    parts.push(part(cylinder(0.022, 0.024, knee.y - ankle), place(knee.x, (knee.y + ankle) / 2, knee.z), FUR, lower))
    parts.push(part(box(0.05, 0.035, 0.075), place(knee.x, ankle / 2, knee.z + 0.015), BELLY, lower))
  }
  return parts
}

export function buildCat(): { scene: THREE.Group; clips: THREE.AnimationClip[] } {
  const bones = BONES.map((name) => {
    const bone = new THREE.Bone()
    bone.name = name
    bone.position.set(...REST[name])
    return bone
  })
  for (const bone of bones) {
    const parent = PARENT[bone.name as BoneName]
    if (parent) bones[BONES.indexOf(parent)]!.add(bone)
  }

  const geometry = mergeGeometries(buildParts())
  const material = new THREE.MeshStandardMaterial({ name: 'cat-fur', vertexColors: true, roughness: 0.9, metalness: 0 })
  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.name = 'Cat'

  const scene = new THREE.Group()
  scene.name = 'CatRoot'
  scene.add(bones[0]!)
  scene.add(mesh)
  scene.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(bones))

  return { scene, clips: buildClips() }
}
