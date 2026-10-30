/**
 * The cat's skeleton. Shared by the model generator and the behaviors, so a behavior can only name bones
 * that exist. +z is forward, +y up, +x the cat's left. Rest offsets are in meters, relative to the parent.
 */
export const BONES = [
  'root',
  'hips',
  'chest',
  'neck',
  'head',
  'earL',
  'earR',
  'tail1',
  'tail2',
  'tail3',
  'tail4',
  'legFL1',
  'legFL2',
  'legFR1',
  'legFR2',
  'legBL1',
  'legBL2',
  'legBR1',
  'legBR2',
] as const

export type BoneName = (typeof BONES)[number]

export const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  hips: 'root',
  chest: 'hips',
  neck: 'chest',
  head: 'neck',
  earL: 'head',
  earR: 'head',
  tail1: 'hips',
  tail2: 'tail1',
  tail3: 'tail2',
  tail4: 'tail3',
  legFL1: 'chest',
  legFL2: 'legFL1',
  legFR1: 'chest',
  legFR2: 'legFR1',
  legBL1: 'hips',
  legBL2: 'legBL1',
  legBR1: 'hips',
  legBR2: 'legBR1',
}

export const REST: Record<BoneName, [number, number, number]> = {
  root: [0, 0, 0],
  hips: [0, 0.2, -0.1],
  chest: [0, 0.03, 0.22],
  neck: [0, 0.05, 0.13],
  head: [0, 0.04, 0.06],
  earL: [0.045, 0.06, 0],
  earR: [-0.045, 0.06, 0],
  tail1: [0, 0.03, -0.1],
  tail2: [0, 0, -0.1],
  tail3: [0, 0, -0.1],
  tail4: [0, 0, -0.08],
  legFL1: [0.07, -0.04, 0.04],
  legFL2: [0, -0.1, 0],
  legFR1: [-0.07, -0.04, 0.04],
  legFR2: [0, -0.1, 0],
  legBL1: [0.07, -0.03, -0.04],
  legBL2: [0, -0.09, 0],
  legBR1: [-0.07, -0.03, -0.04],
  legBR2: [0, -0.09, 0],
}
