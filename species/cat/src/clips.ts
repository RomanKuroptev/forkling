import * as THREE from 'three'
import { REST, type BoneName } from './skeleton.ts'

/**
 * Keyframed cat animation, generated in code. Rotations are Euler XYZ offsets from the rest pose, in radians.
 * Conventions for this skeleton: a positive x rotation pitches the head or a limb *down and back*, so a
 * negative x swings a leg forward or lifts the head; for the tail, positive x raises it.
 */
type Euler3 = [number, number, number]
type Pose = Partial<Record<BoneName, Euler3>>
type Vec = [number, number, number]

interface Frame {
  pose: Pose
  /** Offsets from the rest position, in meters. */
  root?: Vec
  hips?: Vec
}

const TAU = Math.PI * 2
const sin = Math.sin
const cos = Math.cos
const pos = (v: number) => Math.max(0, v)

/** Merge poses, later ones adding onto earlier ones per bone. */
function add(...poses: Pose[]): Pose {
  const out: Pose = {}
  for (const pose of poses) {
    for (const [bone, e] of Object.entries(pose) as [BoneName, Euler3][]) {
      const cur = out[bone] ?? [0, 0, 0]
      out[bone] = [cur[0] + e[0], cur[1] + e[1], cur[2] + e[2]]
    }
  }
  return out
}

/** Tail resting up and back in a gentle curve, swaying. */
const tailSway = (phase: number, amount = 1, lift = 0.5): Pose => ({
  tail1: [lift, 0.15 * amount * sin(phase), 0],
  tail2: [lift * 0.5, 0.2 * amount * sin(phase - 0.6), 0],
  tail3: [lift * 0.2, 0.25 * amount * sin(phase - 1.2), 0],
  tail4: [0, 0.3 * amount * sin(phase - 1.8), 0],
})

/** A leg swing: `a` is the swing phase. Positive upper rotation sends the foot back. */
function leg(upper: 'legFL1' | 'legFR1' | 'legBL1' | 'legBR1', a: number, amplitude: number, lift: number): Pose {
  const lower = upper.replace('1', '2') as BoneName
  return { [upper]: [amplitude * sin(a), 0, 0], [lower]: [lift * pos(-cos(a)), 0, 0] }
}

/** A sitting cat on its haunches, torso upright. */
const sitBase = (): Frame => ({
  root: [0, 0, 0],
  hips: [0, -0.11, -0.02],
  pose: {
    hips: [-0.85, 0, 0],
    chest: [0.8, 0, 0],
    neck: [-0.1, 0, 0],
    legBL1: [-0.8, 0, 0],
    legBL2: [1.9, 0, 0],
    legBR1: [-0.8, 0, 0],
    legBR2: [1.9, 0, 0],
    tail1: [0.1, 0.5, 0],
    tail2: [0.1, 0.5, 0],
    tail3: [0, 0.4, 0],
    tail4: [0, 0.3, 0],
  },
})

function withBase(base: Frame, extra: Pose, hips?: Vec): Frame {
  return { root: base.root, hips: hips ?? base.hips, pose: add(base.pose, extra) }
}

/** Sample a periodic function of phase (0 to 1) into a looping clip. */
function cycle(name: string, duration: number, samples: number, frame: (phase: number) => Frame): THREE.AnimationClip {
  const keys = Array.from({ length: samples + 1 }, (_, i) => ({ t: (i / samples) * duration, frame: frame((i % samples) / samples) }))
  return clipFrom(name, keys)
}

function clipFrom(name: string, keys: { t: number; frame: Frame }[]): THREE.AnimationClip {
  const times = keys.map((k) => k.t)
  const bones = new Set<BoneName>()
  for (const k of keys) for (const b of Object.keys(k.frame.pose) as BoneName[]) bones.add(b)

  const tracks: THREE.KeyframeTrack[] = []
  const q = new THREE.Quaternion()
  for (const bone of bones) {
    const values: number[] = []
    for (const k of keys) {
      const e = k.frame.pose[bone] ?? [0, 0, 0]
      q.setFromEuler(new THREE.Euler(e[0], e[1], e[2]))
      values.push(q.x, q.y, q.z, q.w)
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values))
  }
  for (const bone of ['root', 'hips'] as const) {
    if (!keys.some((k) => k.frame[bone])) continue
    const values: number[] = []
    for (const k of keys) {
      const o = k.frame[bone] ?? [0, 0, 0]
      values.push(REST[bone][0] + o[0], REST[bone][1] + o[1], REST[bone][2] + o[2])
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, values))
  }
  return new THREE.AnimationClip(name, keys[keys.length - 1]!.t, tracks)
}

export function buildClips(): THREE.AnimationClip[] {
  const idle = cycle('Idle', 3, 12, (p) => {
    const a = p * TAU
    return {
      hips: [0, 0.004 * sin(a), 0],
      pose: add(
        { chest: [0.02 * sin(a), 0, 0], neck: [-0.05, 0, 0], head: [0, 0.25 * sin(a), 0], earL: [0, 0, 0.05 * sin(a * 2)] },
        tailSway(a),
      ),
    }
  })

  const walk = cycle('Walk', 0.9, 12, (p) => {
    const a = p * TAU
    return {
      hips: [0, 0.008 * sin(2 * a), 0],
      pose: add(
        { chest: [0, 0.05 * sin(a), 0], head: [0, -0.06 * sin(a), 0], neck: [0.04, 0, 0] },
        leg('legFL1', a, 0.45, 0.7),
        leg('legBR1', a, 0.4, 0.5),
        leg('legFR1', a + Math.PI, 0.45, 0.7),
        leg('legBL1', a + Math.PI, 0.4, 0.5),
        tailSway(a, 0.6, 0.45),
      ),
    }
  })

  const run = cycle('Run', 0.5, 8, (p) => {
    const a = p * TAU
    return {
      root: [0, 0.035 * Math.abs(sin(a)), 0],
      pose: add(
        { hips: [0.15 * sin(a), 0, 0], chest: [-0.15 * sin(a), 0, 0], neck: [0.15, 0, 0], head: [-0.05, 0, 0] },
        leg('legFL1', a, 0.85, 1.0),
        leg('legFR1', a + 0.25, 0.85, 1.0),
        leg('legBL1', a + Math.PI * 0.9, 0.8, 0.8),
        leg('legBR1', a + Math.PI * 0.9 + 0.25, 0.8, 0.8),
        { tail1: [0.1, 0, 0], tail2: [0.05, 0.1 * sin(a), 0], tail3: [0, 0.15 * sin(a), 0], tail4: [0, 0.2 * sin(a), 0] },
      ),
    }
  })

  const sit = cycle('Sit', 2.4, 8, (p) => {
    const a = p * TAU
    const base = sitBase()
    return withBase(base, { chest: [0.015 * sin(a), 0, 0], head: [0, 0.2 * sin(a), 0], tail4: [0, 0.1 * sin(a), 0] })
  })

  const sleep = cycle('Sleep', 4, 8, (p) => {
    const a = p * TAU
    return {
      hips: [0, -0.125 + 0.004 * sin(a), 0],
      pose: {
        chest: [0.1, 0, 0],
        neck: [0.5, 0, 0],
        head: [0.35, 0.3, 0],
        earL: [0, 0, -0.35],
        earR: [0, 0, 0.35],
        legFL1: [-1.1, 0, 0],
        legFL2: [1.7, 0, 0],
        legFR1: [-1.1, 0, 0],
        legFR2: [1.7, 0, 0],
        legBL1: [-1.2, 0, 0],
        legBL2: [1.8, 0, 0],
        legBR1: [-1.2, 0, 0],
        legBR2: [1.8, 0, 0],
        tail1: [-0.2, 0.9, 0],
        tail2: [-0.1, 0.8, 0],
        tail3: [0, 0.7, 0],
        tail4: [0, 0.6, 0],
      },
    }
  })

  const crouch: Frame = {
    hips: [0, -0.07, 0],
    pose: {
      hips: [-0.15, 0, 0],
      chest: [0.25, 0, 0],
      legFL1: [-0.5, 0, 0],
      legFL2: [0.9, 0, 0],
      legFR1: [-0.5, 0, 0],
      legFR2: [0.9, 0, 0],
      legBL1: [-0.9, 0, 0],
      legBL2: [1.2, 0, 0],
      legBR1: [-0.9, 0, 0],
      legBR2: [1.2, 0, 0],
      tail1: [0.4, 0, 0],
    },
  }
  const airborne: Frame = {
    root: [0, 0.22, 0],
    pose: {
      hips: [-0.2, 0, 0],
      chest: [-0.15, 0, 0],
      neck: [-0.2, 0, 0],
      legFL1: [-1.0, 0, 0],
      legFL2: [0.3, 0, 0],
      legFR1: [-1.0, 0, 0],
      legFR2: [0.3, 0, 0],
      legBL1: [0.9, 0, 0],
      legBL2: [0.4, 0, 0],
      legBR1: [0.9, 0, 0],
      legBR2: [0.4, 0, 0],
      tail1: [0.1, 0, 0],
      tail2: [0, 0, 0],
    },
  }
  const jump = clipFrom('Jump', [
    { t: 0, frame: { pose: {} } },
    { t: 0.2, frame: crouch },
    { t: 0.4, frame: airborne },
    { t: 0.65, frame: { ...airborne, root: [0, 0.08, 0], pose: { ...airborne.pose, legFL1: [-0.4, 0, 0], legFR1: [-0.4, 0, 0] } } },
    { t: 0.8, frame: crouch },
    { t: 1.0, frame: { pose: {} } },
  ])

  const happy = cycle('Happy', 1.2, 12, (p) => {
    const a = p * TAU
    return {
      hips: [0, 0.008 + 0.012 * Math.abs(sin(2 * a)), 0],
      pose: add(
        { head: [0.1 * sin(2 * a), 0.2 * sin(a), 0], neck: [-0.1, 0, 0], earL: [0, 0, 0.1], earR: [0, 0, -0.1] },
        { tail1: [1.25, 0, 0], tail2: [0.15, 0.35 * sin(2 * a), 0], tail3: [0.05, 0.45 * sin(2 * a - 0.5), 0], tail4: [0, 0.5 * sin(2 * a - 1), 0] },
      ),
    }
  })

  const eat = cycle('Eat', 1.6, 8, (p) => {
    const a = p * TAU
    return {
      hips: [0, 0, 0],
      pose: add(
        { chest: [0.12, 0, 0], neck: [0.85, 0, 0], head: [0.4 + 0.08 * sin(3 * a), 0, 0], legFL1: [-0.2, 0, 0], legFR1: [-0.2, 0, 0] },
        tailSway(a, 0.8, 0.35),
      ),
    }
  })

  const groom = cycle('Groom', 2.4, 12, (p) => {
    const a = p * TAU
    return withBase(sitBase(), {
      neck: [0.55, 0, 0],
      head: [0.45 + 0.12 * sin(5 * a), 0.35, 0],
      legFL1: [-1.25, 0, 0],
      legFL2: [0.5, 0, 0],
    })
  })

  const stretch = clipFrom('Stretch', [
    { t: 0, frame: { pose: {} } },
    { t: 0.7, frame: stretchPose() },
    { t: 1.8, frame: stretchPose(0.04) },
    { t: 2.5, frame: { pose: {} } },
  ])

  const knead = cycle('Knead', 1.2, 12, (p) => {
    const a = p * TAU
    return {
      hips: [0, -0.07, 0],
      pose: add(
        {
          hips: [-0.1, 0, 0],
          chest: [0.2, 0, 0],
          neck: [0.3, 0, 0],
          legBL1: [-0.8, 0, 0],
          legBL2: [1.1, 0, 0],
          legBR1: [-0.8, 0, 0],
          legBR2: [1.1, 0, 0],
          legFL1: [-0.9 * pos(sin(a)), 0, 0],
          legFL2: [0.7 * pos(sin(a)), 0, 0],
          legFR1: [-0.9 * pos(-sin(a)), 0, 0],
          legFR2: [0.7 * pos(-sin(a)), 0, 0],
        },
        tailSway(a, 0.4, 0.5),
      ),
    }
  })

  return [idle, walk, run, sit, sleep, jump, happy, eat, groom, stretch, knead]
}

/** The play-bow stretch: chest low, front legs reaching, rear up. */
function stretchPose(wobble = 0): Frame {
  return {
    hips: [0, 0.02 + wobble, 0],
    pose: {
      hips: [0.4, 0, 0],
      chest: [0.35, 0, 0],
      neck: [0.2, 0, 0],
      head: [0.3, 0, 0],
      legFL1: [-0.9, 0, 0],
      legFL2: [0.2, 0, 0],
      legFR1: [-0.9, 0, 0],
      legFR2: [0.2, 0, 0],
      legBL1: [-0.1, 0, 0],
      legBR1: [-0.1, 0, 0],
      tail1: [0.7, 0, 0],
      tail2: [0.2, 0, 0],
    },
  }
}
