import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF, WALL, createLand, placeCentre, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { compose, multiply } from '../src/world/matrix.ts'
import { SHAPES, SHAPE_TRIANGLES, exteriorInstances, floorHeight, interiorInstances, interiorsToLoad, partInstances, renderBudget, resolveColor, sceneInstances, wallBoxes } from '../src/world/kitGeometry.ts'

const fixture = makeFixtureWorld(1, 10)
const place = (id: string) => fixture.places.find((p) => p.id === id)!
const palette = kit.palettes.find((p) => p.id === 'harbour')!
const part = (id: string) => kit.parts.find((p) => p.id === id)!
const pos = (m: number[]): [number, number, number] => [m[12]!, m[13]!, m[14]!]
const withStyle = (p: Place, style: string, floors = 1): Place => ({ ...p, exterior: { ...p.exterior, style, floors } })

describe('matrices', () => {
  it('puts a point where translation, rotation about y and scale say (three.js column order)', () => {
    const m = compose([1, 2, 3], [0, Math.PI / 2, 0], [2, 1, 1])
    // The x axis, scaled by 2, turned a quarter about y, points along -z.
    expect(m[0]).toBeCloseTo(0, 6)
    expect(m[2]).toBeCloseTo(-2, 6)
    expect(pos(m)).toEqual([1, 2, 3])
  })
  it('multiplies so the right-hand transform acts first', () => {
    const move = compose([5, 0, 0], [0, 0, 0], [1, 1, 1])
    const turn = compose([0, 0, 0], [0, Math.PI / 2, 0], [1, 1, 1])
    // Turn, then move: the origin of the child lands at the move, not turned.
    expect(pos(multiply(move, turn))).toEqual([5, 0, 0])
    // Move, then turn the whole: the point at x = 5 swings round to z = -5.
    const swung = pos(multiply(turn, move))
    expect(swung[0]).toBeCloseTo(0, 6)
    expect(swung[2]).toBeCloseTo(-5, 6)
  })
})

describe('colours from a palette', () => {
  it('turns a palette slot into that palette\'s hex, and leaves a fixed hex alone', () => {
    expect(resolveColor('wall', palette)).toBe(palette.colors.wall)
    expect(resolveColor('#228833', palette)).toBe('#228833')
  })
  it('gives the same part other colours in another palette', () => {
    const other = kit.palettes.find((p) => p.id === 'coral')!
    expect(resolveColor('roof', palette)).not.toBe(resolveColor('roof', other))
  })
})

describe('a part in the world', () => {
  it('is one instance for each primitive, at the part\'s position plus the primitive\'s own', () => {
    const crate = part('crate')
    const instances = partInstances(crate, [10, 1, 5], 0, palette)
    expect(instances).toHaveLength(crate.primitives.length)
    const first = crate.primitives[0]!
    expect(pos(instances[0]!.matrix)).toEqual([10 + first.at[0], 1 + first.at[1], 5 + first.at[2]].map((n) => expect.closeTo(n, 6)))
    expect(instances[0]!.shape).toBe(first.shape)
    expect(instances[0]!.color).toBe(resolveColor(first.color, palette))
  })
  it('turns about its own origin when rotated', () => {
    const shelf = part('shelf-low')
    const straight = partInstances(shelf, [0, 0, 0], 0, palette)
    const turned = partInstances(shelf, [0, 0, 0], Math.PI / 2, palette)
    const a = pos(straight[0]!.matrix)
    const b = pos(turned[0]!.matrix)
    // (x, z) turned a quarter about y becomes (z, -x).
    expect(b[0]).toBeCloseTo(a[2]!, 5)
    expect(b[2]).toBeCloseTo(-a[0]!, 5)
    expect(b[1]).toBeCloseTo(a[1]!, 6)
  })
  it('is stretched by a scale, for walls and roofs that fit a footprint', () => {
    const wall = part('wall-timber')
    const scaled = partInstances(wall, [0, 0, 0], 0, palette, [2, 1, 1])
    expect(scaled[0]!.matrix[0]).toBeCloseTo(wall.primitives[0]!.size[0] * 2, 6)
  })
})

describe('the outside of a building (spec 5.3: a style is a set of wall, window and roof parts)', () => {
  const home = place('home')
  const at = (p: Place) => placeCentre(toLandPlace(p))

  it('is built from the style\'s own parts and the palette\'s colours', () => {
    const colors = new Set(exteriorInstances(home, kit, 0).map((i) => i.color))
    expect(colors.has(resolveColor('wall', kit.palettes.find((p) => p.id === home.exterior.palette)!))).toBe(true)
  })

  it('has a roof above the walls, and walls all round, inside the footprint plus a little overhang', () => {
    const [px, pz] = at(home)
    const [fw, fd] = home.exterior.footprint
    const height = floorHeight(home) * home.exterior.floors
    const instances = exteriorInstances(home, kit, 0)
    expect(instances.length).toBeGreaterThan(20)
    for (const i of instances) {
      const [x, y, z] = pos(i.matrix)
      expect(Math.abs(x - px), 'x').toBeLessThanOrEqual(fw / 2 + 1.5)
      expect(Math.abs(z - pz), 'z').toBeLessThanOrEqual(fd / 2 + 1.5)
      expect(y).toBeGreaterThanOrEqual(-0.01)
      expect(y).toBeLessThanOrEqual(height + 3.5)
    }
    expect(Math.max(...instances.map((i) => pos(i.matrix)[1]!))).toBeGreaterThan(height)
  })

  it('looks different for each of the five styles', () => {
    const counts = kit.styles.map((s) => exteriorInstances(withStyle(home, s.id), kit, 0).length)
    expect(new Set(counts).size).toBeGreaterThan(2)
  })

  it('has more of it for a taller building', () => {
    expect(exteriorInstances(withStyle(home, 'timber', 2), kit, 0).length).toBeGreaterThan(exteriorInstances(withStyle(home, 'timber', 1), kit, 0).length)
  })

  it('stands on the ground it is given', () => {
    const low = Math.min(...exteriorInstances(home, kit, 7).map((i) => pos(i.matrix)[1]!))
    expect(low).toBeGreaterThanOrEqual(7 - 0.01)
  })

  it('has a door, in the middle of the front wall (the +z side)', () => {
    const [px, pz] = at(home)
    const [, fd] = home.exterior.footprint
    const door = kit.parts.find((p) => p.id === 'door-wood')!
    const doorColors = new Set(door.primitives.map((p) => resolveColor(p.color, kit.palettes.find((x) => x.id === home.exterior.palette)!)))
    const near = exteriorInstances(home, kit, 0).filter((i) => Math.abs(pos(i.matrix)[0]! - px) <= 1.3 && Math.abs(pos(i.matrix)[2]! - (pz + fd / 2)) <= 1 && pos(i.matrix)[1]! < 2.3)
    expect(near.some((i) => doorColors.has(i.color))).toBe(true)
  })
})

describe('the walls you cannot walk through (the same walls the cat\'s world has)', () => {
  const home = place('home')
  const boxes = wallBoxes(home)
  const [px, pz] = placeCentre(toLandPlace(home))
  const [fw, fd] = home.exterior.footprint

  it('is five boxes: back, left, right, and the front in two pieces either side of the door', () => {
    expect(boxes).toHaveLength(5)
  })
  it('is as thick as the cat\'s walls, along the edge of the footprint', () => {
    const back = boxes.find((b) => Math.abs(b.z0 - (pz - fd / 2)) < 1e-6 && Math.abs(b.x1 - b.x0 - fw) < 1e-6)!
    expect(back.z1 - back.z0).toBeCloseTo(WALL, 6)
  })
  it('leaves the door open: nothing stands in the gap, and the gap is as wide as the cat\'s', () => {
    const front = boxes.filter((b) => Math.abs(b.z1 - (pz + fd / 2)) < 1e-6 && Math.abs(b.z1 - b.z0 - WALL) < 1e-6 && b.x1 - b.x0 < fw)
    expect(front).toHaveLength(2)
    const [left, right] = front.sort((a, b) => a.x0 - b.x0)
    expect(left!.x1).toBeCloseTo(px - DOOR_HALF, 6)
    expect(right!.x0).toBeCloseTo(px + DOOR_HALF, 6)
  })
  it('stays inside the footprint and as tall as the building', () => {
    for (const b of boxes) {
      expect(b.x0).toBeGreaterThanOrEqual(px - fw / 2 - 1e-6)
      expect(b.x1).toBeLessThanOrEqual(px + fw / 2 + 1e-6)
      expect(b.z0).toBeGreaterThanOrEqual(pz - fd / 2 - 1e-6)
      expect(b.z1).toBeLessThanOrEqual(pz + fd / 2 + 1e-6)
      expect(b.height).toBeCloseTo(floorHeight(home) * home.exterior.floors, 6)
    }
  })
})

describe('the inside of a building (spec 4.6: only the place the visitor is in, and its neighbours, are loaded in full)', () => {
  it('is the furniture of each room, on its floor', () => {
    const home = place('home')
    const count = home.rooms.flatMap((r) => r.parts).reduce((n, p) => n + kit.parts.find((k) => k.id === p.part)!.primitives.length, 0)
    expect(interiorInstances(home, kit, 0)).toHaveLength(count + 1) // and the floor
  })
  it('loads the places in the visitor\'s chunk and the chunks around it, and no others', () => {
    const land = createLand(1, fixture.places.map(toLandPlace))
    const [vx, vz] = placeCentre(toLandPlace(place('home')))
    const loaded = interiorsToLoad(fixture.places, { x: vx, z: vz })
    expect(loaded.has('home') && loaded.has('workshop')).toBe(true)
    for (const p of fixture.places) {
      const near = Math.abs(p.chunk[0] - 0) <= 1 && Math.abs(p.chunk[1] - 0) <= 1
      expect(loaded.has(p.id), p.id).toBe(near)
    }
    expect(land.placesIn([0, 0]).length).toBe(2)
  })
  it('loads nothing when nobody is looking', () => {
    expect(interiorsToLoad(fixture.places, null).size).toBe(0)
  })
})

describe('the whole scene as instanced shapes (a draw call per shape, however many places)', () => {
  const land = createLand(1, fixture.places.map(toLandPlace))
  const heightAt = (x: number, z: number) => land.heightAt(x, z)
  const all = new Set(fixture.places.map((p) => p.id))
  const near = interiorsToLoad(fixture.places, { x: 8, z: 16 })

  it('groups every primitive by shape, with a matrix and a colour each', () => {
    const scene = sceneInstances(fixture.places, kit, { heightAt, interiors: near })
    expect([...SHAPES].sort()).toEqual(['box', 'cone', 'cylinder', 'sphere'])
    for (const shape of SHAPES) {
      expect(scene[shape].matrices.length).toBe(scene[shape].count * 16)
      expect(scene[shape].colors.length).toBe(scene[shape].count * 3)
    }
    expect(scene.box.count).toBeGreaterThan(100)
  })

  it('has more of it with every interior loaded than with only the nearby ones', () => {
    const some = sceneInstances(fixture.places, kit, { heightAt, interiors: near })
    const every = sceneInstances(fixture.places, kit, { heightAt, interiors: all })
    expect(every.box.count).toBeGreaterThan(some.box.count)
  })

  it('stands each building on the ground under it', () => {
    const scene = sceneInstances([place('home')], kit, { heightAt, interiors: new Set() })
    const [hx, hz] = placeCentre(toLandPlace(place('home')))
    const ground = heightAt(hx, hz)
    const ys = Array.from({ length: scene.box.count }, (_, i) => scene.box.matrices[i * 16 + 13]!)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(ground - 0.01)
  })

  it('stays within the render budget for the 10-place fixture: at most 4 draw calls and 80,000 triangles for all the buildings', () => {
    const budget = renderBudget(sceneInstances(fixture.places, kit, { heightAt, interiors: near }))
    expect(budget.drawCalls).toBeLessThanOrEqual(4)
    expect(budget.triangles).toBeLessThanOrEqual(80_000)
  })

  it('stays within the budget for a full world of 64 places, because only the interiors near the visitor are loaded', () => {
    const big = makeFixtureWorld(3, 64)
    const bigLand = createLand(3, big.places.map(toLandPlace))
    const budget = renderBudget(sceneInstances(big.places, kit, { heightAt: (x, z) => bigLand.heightAt(x, z), interiors: interiorsToLoad(big.places, { x: 8, z: 16 }) }))
    expect(budget.drawCalls).toBeLessThanOrEqual(4)
    expect(budget.triangles).toBeLessThanOrEqual(300_000)
  })

  it('counts a triangle budget from the shapes\' own triangles', () => {
    expect(SHAPE_TRIANGLES.box).toBe(12)
    const one = renderBudget({ box: { matrices: new Float32Array(16), colors: new Float32Array(3), count: 1 }, sphere: { matrices: new Float32Array(0), colors: new Float32Array(0), count: 0 }, cylinder: { matrices: new Float32Array(0), colors: new Float32Array(0), count: 0 }, cone: { matrices: new Float32Array(0), colors: new Float32Array(0), count: 0 } })
    expect(one).toEqual({ drawCalls: 1, triangles: 12 })
  })
})
