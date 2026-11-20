import type { Place, WorkMeta } from '@forkling/schema'
import { boardHiddenShare, boxGap, buildingWords, footprintOverlap, inView, signLine, signLineProblem, volumeOverlap, type Box, type Vec3 } from '@forkling/sim'
import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'
import { hsv } from './picture.ts'

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

/**
 * The least colour (saturation) an outside wall is drawn with. Home's near-white mint wall (saturation 0.16) read as plain grey
 * under its porch (look.md rule 2: shade stays coloured); the cool pastel walls of the other palettes have 0.2 and more.
 */
export const OUTSIDE_WALL_COLOUR = 0.2
/** The cream, beige and khaki hues look.md rule 3 keeps off walls (degrees). */
const WARM_WALL = [15, 75] as const

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

  // Outside walls in a colour that stays coloured in shade (look.md rules 2 and 3).
  for (const p of places) {
    if (!p.outsideWall) continue
    const n = Number.parseInt(p.outsideWall.slice(1), 16)
    const [h, s] = hsv((n >> 16) & 255, (n >> 8) & 255, n & 255)
    const warm = h >= WARM_WALL[0] && h <= WARM_WALL[1] && s > 0.03
    if (s < OUTSIDE_WALL_COLOUR || warm) add('world.outside-wall-grey', p.id, 'major', `The outside walls of ${p.id} turn grey or brown in shade`, `They are drawn in ${p.outsideWall}: ${warm ? `a warm hue (${Math.round(h)} deg), cream or beige` : `saturation ${s.toFixed(2)}, under ${OUTSIDE_WALL_COLOUR}`}.`, 'In shade (under a porch, facing away from the sun) the wall reads as plain grey or brown, not as a pastel (look.md rules 2 and 3).', 'look', 'apps/viewer/src/world/theme.ts')
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
  // Its insides too (issue 329): a finished, furnished room standing in a wire shell reads as a room whose walls did not load.
  for (const r of rooms) {
    const file = files.get(r.place ?? '')
    if (!file) continue
    const building = file.state.construction !== null && Date.parse(file.state.construction.finishesAt) > input.now
    if (building && r.material !== 'wireframe') add('world.wireframe-state', r.id, 'major', `A room of ${file.id} is finished and furnished inside the place being built`, `${r.id} is drawn ${r.material} while ${file.id} is being built until ${file.state.construction!.finishesAt}; being built is the finished model in cyan wireframe, inside and out.`, 'It does not read as a project in progress: it looks like a finished room whose walls failed to load.', 'code', `places/${file.id}.json`)
  }

  // A place being built has a sign that names it and says it is being built (issue 331).
  for (const [id, file] of files) {
    const words = buildingWords(file.state.construction, input.now)
    if (!words || file.state.closed) continue
    const sign = of('sign').find((s) => s.place === id)
    const shown = squash(sign?.text ?? '')
    if (!sign || !shown.includes(squash(file.name)) || !shown.includes('Building')) add('world.site-sign', id, 'major', `The build site of ${id} does not say what is being built`, sign ? `Its sign shows "${shown}"; it should name ${file.name} and say it is being built (${words}).` : `${file.name} is being built, and it has no sign.`, 'A visitor cannot tell that Merge is working on something right now, or what.', 'code', `places/${id}.json`)
  }

  // Words on signs and title bars are the words in the files.
  for (const s of of('sign')) {
    const file = files.get(s.place ?? '')
    if (!file) continue
    // The line under the name is the sign text Merge wrote, or what the place is for when that only repeats a name (`signLine`).
    // A place being built (and not closed) says so instead, and how long is left (issue 331).
    const building = file.state.closed ? null : buildingWords(file.state.construction, input.now)
    const expected = squash(`${file.name} ${building ?? signLine(file, input.places)}`)
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
    // The scene lists a body with any blended or faded material as glass (issue 455: the body read as see-through up close).
    if (merge.material === 'glass') add('world.merge-see-through', 'merge', 'major', "Merge's body is drawn see-through", 'Some of the materials Merge is drawn with are blended or faded (not opaque), so what is behind the body shows through it.', 'Merge looks ghostly or half-drawn up close.', 'code', 'apps/viewer/src/forkling/solidBody.ts')
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
