import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildClips } from './clips.ts'
import { BONES, PARENT, REST, type BoneName } from './skeleton.ts'

// Mockup D (docs/spec/v4/look/merge-options.png): a smooth pastel blue body, darker blue legs and ears, a peach monitor for a head.
const FUR = new THREE.Color('#6fb0ff')
const BELLY = new THREE.Color('#b8dcff')
const LEG = new THREE.Color('#3a5cff')
const TAIL_TIP = new THREE.Color('#e6f3ff')
/** The monitor that is Merge's head: a peach bezel and a dark screen with the face drawn on it by the viewer. */
const BEZEL = new THREE.Color('#ffc9a8')
const SCREEN = new THREE.Color('#04140b')
/** The monitor: width, height, depth, where its middle is, and how far the screen is tilted up (radians), in the cat's space. */
export const MONITOR = { size: [0.23, 0.2, 0.09], at: [0, 0.385, 0.32], tilt: -(15 * Math.PI) / 180, screen: 0.85 } as const

/** A point `k` meters out of the monitor's front, along its tilted front direction. */
const outFront = (k: number): [number, number, number] => [MONITOR.at[0], MONITOR.at[1] - k * Math.sin(MONITOR.tilt), MONITOR.at[2] + k * Math.cos(MONITOR.tilt)]

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
    // A colour function is asked once per triangle, at its first corner, so a face never fades from one colour to another.
    if (i % 3 === 0) (typeof color === 'function' ? color(n, p) : color).toArray(colors, i * 3)
    else colors.copyWithin(i * 3, (i - (i % 3)) * 3, (i - (i % 3)) * 3 + 3)
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


const BODY_BLEND = { from: 'hips', to: 'chest', z0: -0.04, z1: 0.1 } as const

function buildParts(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []

  // Torso.
  // One solid blue, as in the look's picture (merge-options.png, D). A pale belly read like the room behind it, as if the body were
  // see-through (issue 455).
  parts.push(part(sphere(), place(0, 0.225, 0, [0.095, 0.09, 0.2]), FUR, BODY_BLEND))
  parts.push(part(sphere(), place(0, 0.225, 0.15, [0.085, 0.085, 0.085]), FUR, 'chest'))

  // Neck and head: an old monitor, tilted up a little, with ears on top. The face is a separate quad (`Face`, see `buildCat`) the viewer paints.
  parts.push(part(cylinder(0.04, 0.046, 0.09), place(0, 0.285, 0.255), FUR, 'neck'))
  parts.push(part(box(...MONITOR.size), place(...MONITOR.at, [1, 1, 1], MONITOR.tilt), BEZEL, 'head'))
  parts.push(part(box(MONITOR.size[0] * MONITOR.screen, MONITOR.size[1] * MONITOR.screen, 0.012), place(...outFront(MONITOR.size[2] / 2 + 0.001), [1, 1, 1], MONITOR.tilt), SCREEN, 'head'))
  for (const side of [1, -1]) {
    const ear: BoneName = side === 1 ? 'earL' : 'earR'
    parts.push(part(new THREE.ConeGeometry(0.04, 0.085, 4), place(side * 0.07, 0.52, 0.31, [1, 1, 0.8], 0, -side * 0.15), LEG, ear))
  }

  // Tail: four ringed segments running back from the hips.
  const tail: [BoneName, number, number, THREE.Color][] = [
    ['tail1', 0.1, 0.024, FUR],
    ['tail2', 0.1, 0.021, FUR],
    ['tail3', 0.1, 0.019, TAIL_TIP],
    ['tail4', 0.08, 0.017, TAIL_TIP],
  ]
  for (const [bone, length, radius, color] of tail) {
    const at = ABS[bone]
    parts.push(part(cylinder(radius * 0.9, radius, length), place(at.x, at.y, at.z - length / 2, [1, 1, 1], Math.PI / 2), color, bone))
  }
  parts.push(part(sphere(0), place(ABS.tail4.x, ABS.tail4.y, ABS.tail4.z - 0.08, [0.017, 0.017, 0.017]), TAIL_TIP, 'tail4'))

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
    parts.push(part(cylinder(0.026, hind ? 0.03 : 0.028, top.y - knee.y), place(top.x, (top.y + knee.y) / 2, top.z), LEG, upper))
    if (hind) parts.push(part(sphere(), place(top.x + side * 0.005, top.y + 0.01, top.z - 0.01, [0.045, 0.07, 0.075]), LEG, upper))
    const ankle = 0.035
    parts.push(part(cylinder(0.022, 0.024, knee.y - ankle), place(knee.x, (knee.y + ankle) / 2, knee.z), LEG, lower))
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

  // The face: a quad on the screen, a child of the head bone so it moves with the head. The viewer paints it from what the body is doing.
  const head = ABS.head
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(MONITOR.size[0] * MONITOR.screen * 0.96, MONITOR.size[1] * MONITOR.screen * 0.96),
    new THREE.MeshBasicMaterial({ name: 'face', color: '#39ff88' }),
  )
  face.name = 'Face'
  const front = outFront(MONITOR.size[2] / 2 + 0.009)
  face.position.set(front[0] - head.x, front[1] - head.y, front[2] - head.z)
  face.rotation.x = MONITOR.tilt
  bones[BONES.indexOf('head')]!.add(face)

  return { scene, clips: buildClips() }
}
