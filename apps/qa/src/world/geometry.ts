import type { Place, WorkMeta } from '@forkling/schema'
import { boardHiddenShare, boxGap, footprintOverlap, inView, signLine, signLineProblem, volumeOverlap, type Box, type Vec3 } from '@forkling/sim'
import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

/**
 * The geometric checks on one opened world (audit spec 7.2), from `__qa.scene()`, the ground under it and the world's files.
 * Pure: the browser part (`collectGeometry`) gathers the input.
 */
export interface GeometryInput {
  fixture: string
  /** The world's clock, Unix ms. */
  now: number
  places: readonly Place[]
  works: readonly Pick<WorkMeta, 'id' | 'status' | 'installedIn'>[]
  scene: SceneObject[]
  /** The ground height at a point and what its chunk is. */
  ground: (x: number, z: number) => { y: number; chunk: string }
  /** The visitor's eyes when the world opened, and the picture's width over height. */
  start: { eye: Vec3; yaw: number; pitch: number; aspect: number }
}

/** The viewer's field of view (apps/viewer/src/App.tsx). */
const FOV_Y = 70
/** Something standing on the ground may sit up to this far off it (meters). */
const ON_GROUND = 0.05
/** A sign's board hangs about 0.9 m up on its posts (`SIGN_BOTTOM`); outside this range it floats or is sunk. */
const SIGN_BOTTOM = [0.5, 1.5] as const
/** Merge drawn at its scale is between these heights (meters). */
const MERGE_HEIGHT = [0.15, 2.5] as const
/** Merge's box comes from its skinned mesh, whose bounds are not exact to the paw: on day-0 it reads 0.11 m under the ground while the picture shows it standing on the floor. */
const MERGE_SUNK = -0.25

const squash = (s: string) => s.trim().replace(/\s+/g, ' ')
const centre = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
const m = (n: number) => `${n.toFixed(2)} m`

export function geometryFindings(input: GeometryInput): CheckResult[] {
  const { fixture } = input
  const out: CheckResult[] = []
  const add = (id: string, key: string, severity: CheckResult['severity'], title: string, what: string, causes: string, fixKind: CheckResult['fixKind'] = 'code', where?: string) =>
    out.push({ id, fingerprint: `${id}|${fixture}|${key}`, severity, title, what, causes, evidence: [], fixKind, fixture, ...(where ? { where } : {}) })
  const boxed = input.scene.filter((o): o is SceneObject & { box: Box } => o.box !== null)
  const of = (kind: SceneObject['kind']) => boxed.filter((o) => o.kind === kind)
  const files = new Map(input.places.map((p) => [p.id, p]))

  // Places through places; rooms through rooms of the same place.
  const places = of('place')
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const a = places[i]!
      const b = places[j]!
      const area = footprintOverlap(a.box, b.box)
      if (area > 0.5) add('world.places-overlap', `${a.id}+${b.id}`, 'major', `${a.id} and ${b.id} stand inside each other`, `Their footprints share ${area.toFixed(1)} square meters: walls go through walls.`, 'A visitor sees two buildings melted into one, and doors that open into another building.', 'code', `places/${a.id}.json`)
    }
  }
  const rooms = of('room')
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]!
      const b = rooms[j]!
      if (a.place !== b.place) continue
      const vol = volumeOverlap(a.box, b.box)
      if (vol > 0.05) add('world.rooms-overlap', `${a.id}+${b.id}`, 'major', `Two rooms of ${a.place} are inside each other`, `${a.id} and ${b.id} share ${vol.toFixed(1)} cubic meters.`, 'Furniture and walls of two rooms are drawn through each other.', 'code', `places/${a.place}.json`)
    }
  }

  // On the ground, inside the land.
  for (const p of places) {
    const [x, , z] = centre(p.box)
    const g = input.ground(x, z)
    const off = p.box.min[1] - g.y
    if (Math.abs(off) > ON_GROUND) add('world.not-on-ground', p.id, 'major', `${p.id} ${off > 0 ? 'floats above' : 'is sunk into'} the ground`, `Its base is ${m(off)} from the ground under its middle.`, off > 0 ? 'A visitor sees a gap under the building.' : 'Its floor and door sit below the ground.', 'code', `places/${p.id}.json`)
    const corners: [number, number][] = [[p.box.min[0], p.box.min[2]], [p.box.max[0], p.box.min[2]], [p.box.min[0], p.box.max[2]], [p.box.max[0], p.box.max[2]]]
    const fog = corners.filter(([cx, cz]) => input.ground(cx, cz).chunk === 'fog')
    if (fog.length) add('world.outside-land', p.id, 'major', `${p.id} stands partly outside the land`, `${fog.length} of its corners are in the fog, not on land.`, 'Part of the building hangs over nothing.', 'code', `places/${p.id}.json`)
  }
  for (const s of of('sign')) {
    const [x, , z] = centre(s.box)
    const up = s.box.min[1] - input.ground(x, z).y
    if (up < SIGN_BOTTOM[0] || up > SIGN_BOTTOM[1]) add('world.floating', s.id, 'major', `The sign ${s.id} ${up > SIGN_BOTTOM[1] ? 'floats in the air' : 'is sunk into the ground'}`, `Its board's lower edge is ${m(up)} above the ground; it hangs ${SIGN_BOTTOM[0]} to ${SIGN_BOTTOM[1]} m up on its posts.`, 'A visitor sees a sign with nothing holding it, or cannot read it.', 'look')
  }

  // Being built is wireframe; finished is not (look.md).
  for (const p of places) {
    const file = files.get(p.id)
    if (!file) continue
    const building = file.state.construction !== null && Date.parse(file.state.construction.finishesAt) > input.now
    if (building !== (p.material === 'wireframe')) add('world.wireframe-state', p.id, 'major', building ? `${p.id} is being built but is drawn finished` : `${p.id} is finished but is drawn as a wireframe`, `Its file says ${building ? `it is being built until ${file.state.construction!.finishesAt}` : 'it is finished'}; the world draws it ${p.material}.`, 'A visitor is told the wrong thing about what Merge is building.', 'code', `places/${p.id}.json`)
  }

  // Words on signs and title bars are the words in the files.
  for (const s of of('sign')) {
    const file = files.get(s.place ?? '')
    if (!file) continue
    // The line under the name is the sign text Merge wrote, or what the place is for when that only repeats a name (`signLine`).
    const expected = squash(`${file.name} ${signLine(file, input.places)}`)
    const shown = squash(s.text ?? '')
    // Under the name, a sign says something about the place: never the name again, never another place (issues 359, 363).
    const name = squash(file.name)
    const line = shown.toLowerCase().startsWith(name.toLowerCase()) ? shown.slice(name.length).trim() : shown
    const problem = signLineProblem(line, file, input.places)
    if (problem === 'repeats-name') add('world.sign-repeats-name', s.id, 'major', `The sign of ${file.id} only says its name again`, `It shows "${shown}": the line under the name is the name again.`, 'With the title bar above the door a visitor reads one word three times and nothing about what the place is for.', 'code', `places/${file.id}.json`)
    else if (problem) add('world.sign-names-other', s.id, 'major', `The sign of ${file.id} names another place`, `It shows "${shown}", which names ${problem.names}.`, 'A visitor at the door reads the name of another place and cannot tell which building they are at.', 'code', `places/${file.id}.json`)
    if (shown.includes('…')) add('world.label-cut', s.id, 'minor', `The sign ${s.id} is cut short`, `It shows "${shown}"; the file says "${expected}".`, 'A visitor reads half a sentence.', 'look', `places/${file.id}.json`)
    else if (shown.replace(/ /g, '') !== expected.replace(/ /g, '')) add('world.label-text', s.id, 'major', `The sign ${s.id} does not say what its file says`, `It shows "${shown}"; the file says "${expected}".`, 'A visitor reads words Merge did not write.', 'code', `places/${file.id}.json`)
  }
  for (const l of of('label')) {
    const file = files.get(l.place ?? '')
    if (file && file.name.trim().length > (l.text ?? '').length && file.name.trim().toUpperCase() !== (l.text ?? '')) add('world.label-cut', l.id, 'minor', `The title bar of ${file.id} cuts its name`, `It shows "${l.text}"; the name is "${file.name}".`, 'A visitor reads half a name.', 'look', `places/${file.id}.json`)
  }

  // Merge: there, the right size, on something, and in sight when the world opens.
  for (const merge of of('merge')) {
    const h = merge.box.max[1] - merge.box.min[1]
    if (h < MERGE_HEIGHT[0] || h > MERGE_HEIGHT[1]) add('world.merge-size', 'merge', 'major', 'Merge is drawn the wrong size', `Merge is ${m(h)} tall; it should be ${MERGE_HEIGHT[0]} to ${MERGE_HEIGHT[1]} m.`, 'Merge looks like a toy or a giant.', 'look')
    const [x, , z] = centre(merge.box)
    const up = merge.box.min[1] - input.ground(x, z).y
    if (up < MERGE_SUNK) add('world.not-on-ground', 'merge', 'major', 'Merge is sunk into the ground', `Merge's lowest point is ${m(-up)} below the ground.`, 'A visitor sees half a cat.', 'code')
    if (up > 1.5) add('world.floating', 'merge', 'major', 'Merge floats in the air', `Merge's lowest point is ${m(up)} above the ground.`, 'A visitor sees a flying cat.', 'code')
    const { eye, yaw, pitch, aspect } = input.start
    if (!inView(eye, yaw, pitch, FOV_Y, aspect, centre(merge.box))) add('world.merge-in-view', 'merge', 'major', 'Merge is not in sight when the world opens', `From the start (${eye.map((n) => n.toFixed(1)).join(', ')}) Merge at ${centre(merge.box).map((n) => n.toFixed(1)).join(', ')} is outside the view.`, 'A visitor arrives and sees no one.', 'code')
  }

  // Works: where their files say they are, and shown somewhere in the world.
  const works = of('work')
  const shownRefs = new Set(works.map((w) => w.ref))
  for (const w of input.works) {
    if (w.status !== 'shelf' || !w.installedIn) continue
    const place = w.installedIn.split('/')[0]
    // At the slot its file names (`at`, `<place>/<room>/<part>/<slot>`), not just anywhere with its ref: a tile on the gallery wall
    // shows every finished work, so it never counts as the work being installed. A viewer that gives no `at` is matched by place.
    if (!works.some((s) => s.ref === `works/${w.id}` && s.place === place && s.slot !== 'gallery-wall' && (s.at === undefined || s.at === w.installedIn))) add('world.work-not-installed', w.id, 'major', `The work ${w.id} is not where its file says`, `Its meta.json says it is installed in ${w.installedIn}, but ${place} shows no such work.`, 'The site and the diary send visitors to a work that is not there.', 'code', `works/${w.id}/meta.json`)
  }
  const finished = input.works.filter((w) => w.status === 'shelf')
  const unseen = finished.filter((w) => !shownRefs.has(`works/${w.id}`))
  if (unseen.length) add('world.work-shown', '', 'major', 'Finished works are shown nowhere in the 3D world', `${unseen.length} of ${finished.length} finished works hang on no screen, frame or shelf (only on the site or in a gallery list): ${unseen.slice(0, 10).map((w) => w.id).join(', ')}${unseen.length > 10 ? ', ...' : ''}.`, 'A visitor walking the world never sees most of what Merge made.', 'code')
  // The fingerprint of the count finding has no key part.
  for (const f of out) if (f.fingerprint.endsWith('|')) f.fingerprint = f.fingerprint.slice(0, -1)

  // Nothing of a building stands between the path and its sign (issues 356, 366): seen from 6 m straight in front at eye height,
  // no porch column, arch or screen hides any of the board.
  const columns = of('column')
  for (const s of of('sign')) {
    const [x, , z] = centre(s.box)
    const share = boardHiddenShare(s.box, input.ground(x, z).y, columns.map((c) => c.box))
    if (share > 0) add('world.sign-hidden', s.id, 'major', `Columns hide the sign ${s.id}`, `From 6 m straight in front of it, ${Math.round(share * 100)}% of the board is behind a column or other piece of its building.`, 'A visitor cannot read the name of the place from its front.', 'look', s.place ? `places/${s.place}.json` : undefined)
  }

  // Small parts that touch nothing (a sign far from its place).
  for (const s of of('sign')) {
    const home = places.find((p) => p.id === s.place)
    if (home && boxGap(s.box, home.box) > 6) add('world.detached', s.id, 'major', `The sign ${s.id} stands far from its place`, `It is ${m(boxGap(s.box, home.box))} from ${home.id}.`, 'A visitor cannot tell which building the sign belongs to.', 'look')
  }
  return out
}
