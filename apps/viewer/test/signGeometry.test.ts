import { describe, expect, it } from 'vitest'
import type { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF, createLand, placeCentre, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { SIGN_H, SIGN_W, signSpot } from '../src/world/exhibitGeometry.ts'
import { SIGN_CELL, atlasLayout, contrast, signBoards, signColors, signLayout, textWidth } from '../src/world/signGeometry.ts'

const PAD = 24
const norm = (s: string) => s.trim().replace(/\s+/g, ' ')
const withText = (p: Place, name: string, sign: string): Place => ({ ...p, name, exterior: { ...p.exterior, sign } })

const worlds = [makeFixtureWorld(1, 10), makeFixtureWorld(3, 64)]

describe.each(worlds.map((w) => ({ count: w.places.length, places: w.places })))('the sign of each of $count places renders its name and its sign text', ({ places }) => {
  it('shows the whole name, in the large type, on one or two lines', () => {
    for (const p of places) {
      const { name } = signLayout(p)
      expect(name.length, p.id).toBeGreaterThanOrEqual(1)
      expect(name.length, p.id).toBeLessThanOrEqual(2)
      expect(name.join(' '), p.id).toBe(norm(p.name))
    }
  })

  it('shows the whole sign text, the one a tend can rewrite, on one or two lines, whenever there is one', () => {
    for (const p of places) {
      const { text } = signLayout(p)
      if (norm(p.exterior.sign) === '') expect(text, p.id).toEqual([])
      else {
        expect(text.length, p.id).toBeLessThanOrEqual(2)
        expect(text.join(' '), p.id).toBe(norm(p.exterior.sign))
      }
    }
  })

  it('draws every line inside the board, big enough to read from the path', () => {
    for (const p of places) {
      const { ops } = signLayout(p)
      expect(ops.length, p.id).toBeGreaterThan(0)
      for (const op of ops) {
        expect(textWidth(op.text, op.px), `${p.id} "${op.text}" is wider than the board`).toBeLessThanOrEqual(SIGN_CELL.w - 2 * PAD)
        expect(op.y - op.px, `${p.id} "${op.text}" starts above the board`).toBeGreaterThanOrEqual(0)
        expect(op.y, `${p.id} "${op.text}" runs off the bottom`).toBeLessThanOrEqual(SIGN_CELL.h)
        expect(op.px, `${p.id} "${op.text}" is too small`).toBeGreaterThanOrEqual(op.role === 'name' ? 36 : 28)
      }
    }
  })

  it('draws no line over another', () => {
    for (const p of places) {
      const { ops } = signLayout(p)
      for (let i = 1; i < ops.length; i++) expect(ops[i]!.y - ops[i]!.px, `${p.id} line ${i}`).toBeGreaterThanOrEqual(ops[i - 1]!.y - 1e-6)
    }
  })
})

describe('what a sign says in the awkward cases', () => {
  const home = makeFixtureWorld(1, 10).places.find((p) => p.id === 'home')!

  it('writes the name large and the sign text smaller', () => {
    const { ops } = signLayout(withText(home, 'House of Moss', 'Open on Sundays'))
    const name = ops.filter((o) => o.role === 'name')
    const text = ops.filter((o) => o.role === 'text')
    expect(Math.min(...name.map((o) => o.px))).toBeGreaterThan(Math.max(...text.map((o) => o.px)))
  })

  it('fits the longest name (40 characters) and the longest sign text (24)', () => {
    const long = 'The Observatory of Patient Little Birds!'
    expect(long.length).toBe(40)
    const layout = signLayout(withText(home, long, 'Mind the third step!!!!!!'.slice(0, 24)))
    expect(layout.name.join(' ')).toBe(long)
    for (const op of layout.ops) expect(textWidth(op.text, op.px)).toBeLessThanOrEqual(SIGN_CELL.w - 2 * PAD)
  })

  it('breaks a word that is longer than a line rather than running off the board', () => {
    const word = 'Supercalifragilisticexpialidocious'
    const layout = signLayout(withText(home, word, ''))
    expect(layout.name.length).toBeLessThanOrEqual(2)
    expect(layout.name.join('')).toBe(word)
    for (const op of layout.ops) expect(textWidth(op.text, op.px)).toBeLessThanOrEqual(SIGN_CELL.w - 2 * PAD)
  })

  it('shows only the name when there is no sign text, and never an empty board', () => {
    const layout = signLayout(withText(home, 'Home', ''))
    expect(layout.text).toEqual([])
    expect(layout.ops.length).toBe(1)
  })

  it('does not draw markup: text goes on the board as the characters it is', () => {
    const layout = signLayout(withText(home, '<b>Home</b>', '<img src=x>'))
    expect(layout.name.join(' ')).toBe('<b>Home</b>')
    expect(layout.text.join(' ')).toBe('<img src=x>')
  })
})

describe('the colours of a sign', () => {
  it('can be read in every palette of the kit, light on dark or dark on light (contrast at least 4.5)', () => {
    for (const palette of kit.palettes) {
      const { bg, fg } = signColors(palette.colors.wood)
      expect(contrast(bg, fg), palette.id).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('measures contrast the way WCAG does: black on white is 21', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })
})

describe('the board', () => {
  const fixture = makeFixtureWorld(1, 10)
  const land = createLand(1, fixture.places.map(toLandPlace))
  const baseOf = (p: Place) => {
    const [x, z] = placeCentre(toLandPlace(p))
    return land.heightAt(x, z)
  }

  it('is one board for each place, facing the path, in front of the building and beside the door, never across it', () => {
    const boards = signBoards(fixture.places, baseOf, kit)
    expect(boards.map((b) => b.id)).toEqual(fixture.places.map((p) => p.id))
    for (const [i, board] of boards.entries()) {
      const p = fixture.places[i]!
      const [px, pz] = placeCentre(toLandPlace(p))
      expect(board.position[2], p.id).toBeGreaterThan(pz + p.exterior.footprint[1] / 2)
      expect(board.position[0] - SIGN_W / 2, `${p.id}: clear of the door`).toBeGreaterThan(px + DOOR_HALF)
      expect(board.size).toEqual([SIGN_W, SIGN_H])
      expect(board.position[1], `${p.id}: above the ground`).toBeGreaterThan(baseOf(p) + 0.5)
      expect(board.position[1] + SIGN_H / 2, `${p.id}: not above the roof of a low building`).toBeLessThan(baseOf(p) + 3)
    }
  })

  it('stands where the sign has always stood (the place the click and hover target is)', () => {
    for (const p of fixture.places) {
      const spot = signSpot(p, baseOf(p)).position
      const board = signBoards([p], baseOf, kit)[0]!
      expect(board.position[0]).toBeCloseTo(spot[0], 6)
      expect(board.position[2]).toBeGreaterThanOrEqual(spot[2])
    }
  })

  it('carries the name and the sign text of its place, and a colour from its palette', () => {
    const p = fixture.places[1]!
    const board = signBoards([p], baseOf, kit)[0]!
    expect(board.layout).toEqual(signLayout(p))
    const palette = kit.palettes.find((q) => q.id === p.exterior.palette)!
    expect(board.colors).toEqual(signColors(palette.colors.wood))
  })

  it('is drawn on a post and board made of the kit\'s plain shapes, as wide as the text board', () => {
    const post = kit.parts.find((q) => q.id === 'sign-post')!
    const widest = Math.max(...post.primitives.map((q) => q.size[0]))
    expect(widest).toBeGreaterThanOrEqual(SIGN_W)
    expect(post.size[0]).toBeGreaterThanOrEqual(SIGN_W)
  })
})

describe('the atlas every sign is painted on (one texture, so one draw call)', () => {
  it('has room for 64 signs inside a 2048 texture, with no two cells overlapping and all of them inside it', () => {
    const atlas = atlasLayout(64)
    expect(atlas.width).toBeLessThanOrEqual(2048)
    expect(atlas.height).toBeLessThanOrEqual(2048)
    const seen = new Set<string>()
    for (let i = 0; i < 64; i++) {
      const c = atlas.cell(i)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + atlas.cellW).toBeLessThanOrEqual(atlas.width)
      expect(c.y + atlas.cellH).toBeLessThanOrEqual(atlas.height)
      expect(c.u1).toBeLessThanOrEqual(1)
      expect(c.v1).toBeLessThanOrEqual(1)
      seen.add(`${c.x},${c.y}`)
    }
    expect(seen.size).toBe(64)
  })

  it('scales the design cell onto its own cell, with the same shape', () => {
    const atlas = atlasLayout(10)
    expect(atlas.cellW / atlas.cellH).toBeCloseTo(SIGN_CELL.w / SIGN_CELL.h, 1)
    expect(atlas.scale).toBeCloseTo(atlas.cellW / SIGN_CELL.w, 6)
  })

  it('is small for few signs and empty for none', () => {
    expect(atlasLayout(1).width).toBeLessThan(atlasLayout(64).width + 1)
    expect(atlasLayout(0).width).toBeGreaterThan(0)
  })
})
