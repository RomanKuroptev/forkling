import type { Kit, Place } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { buildingModel } from '../world/building.ts'
import { SIGN_W, signSpot } from '../world/exhibitGeometry.ts'
import type { QaPose } from './registry.ts'

/** How far in front of a place's front the front camera stands at the least, in meters (the desktop picture). */
const NEAR = 7
/** Room kept at each side of what must be in the picture, in meters. */
const MARGIN = 0.8
const EYE = 1.6
const AIM = 2
const CORNERS = [-0.5, 0.5].flatMap((a) => [-0.5, 0.5].flatMap((b) => [-0.5, 0.5].map((c) => [a, b, c] as const)))

/**
 * The named camera `front:<place>` (audit spec 7.1): at eye height in front of the door, looking at the place. It stands 7 m in front
 * of the front, or further back when the picture is narrow (a phone held upright, issue 332), so the whole front, the title bar on it
 * and the sign beside the door are all in the picture. `aspect` is the picture's width over height, `fovY` its vertical field of view.
 */
export function frontPose(place: Place, kit: Kit, baseY: number, aspect: number, fovY: number): QaPose {
  const [x, z] = placeCentre(toLandPlace(place))
  const front = z + place.exterior.footprint[1] / 2
  const model = buildingModel(place, kit, baseY)
  const sign = signSpot(place, baseY).position
  // Every point that must be in the picture: the corners of the model's pieces (walls, eaves, the title bar) and of the sign.
  const points: [number, number, number][] = [
    [sign[0] - SIGN_W / 2, baseY + 2.1, sign[2]],
    [sign[0] + SIGN_W / 2, baseY + 2.1, sign[2]],
  ]
  for (const piece of model ? [...model.slots.body, ...model.slots.front, ...model.slots.crown] : []) {
    const m = piece.matrix
    for (const [a, b, c] of CORNERS) points.push([m[0]! * a + m[4]! * b + m[8]! * c + m[12]!, m[1]! * a + m[5]! * b + m[9]! * c + m[13]!, m[2]! * a + m[6]! * b + m[10]! * c + m[14]!])
  }
  if (!model) for (const sx of [-1, 1]) points.push([x + (sx * place.exterior.footprint[0]) / 2, baseY + 3, front])
  const tanY = Math.tan(((fovY / 2) * Math.PI) / 180)
  const tanX = tanY * aspect
  // How far in front of the front the camera must stand for each point to be inside the picture, with room to spare.
  let d = NEAR
  for (const [px, , pz] of points) {
    const ahead = pz - front
    d = Math.max(d, ahead + (Math.abs(px - x) + MARGIN) / tanX)
  }
  // Up to the top of the title bar with the place's name (what is above it, a roof's point, may leave the picture).
  const bar = model?.titleBar
  if (bar) d = Math.max(d, bar.position[2] - front + (bar.position[1] + bar.height / 2 - (baseY + EYE) + 0.3) / tanY)
  return { position: [x, baseY + EYE, front + d], target: [x, baseY + AIM, z] }
}
