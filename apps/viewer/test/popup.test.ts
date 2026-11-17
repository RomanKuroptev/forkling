import { describe, expect, it } from 'vitest'
import { POPUP_CHARS, clampPopup, fitPopup } from '../src/forkling/popup.ts'

describe('the merge.exe pop-up lines', () => {
  const long = 'x'.repeat(200)
  it('cuts what is too long with three dots, about 30 characters a line, 4 lines in all', () => {
    const lines = fitPopup([
      { kind: 'goal', text: long },
      { kind: 'step', text: long },
      { kind: 'reason', text: long },
    ])
    expect(lines[0]!.text.length).toBeLessThanOrEqual(POPUP_CHARS)
    expect(lines[1]!.text.length).toBeLessThanOrEqual(POPUP_CHARS * 2)
    expect(lines[2]!.text.length).toBeLessThanOrEqual(POPUP_CHARS)
    for (const l of lines) expect(l.text.endsWith('...')).toBe(true)
    // 1 + 2 + 1 lines.
    expect(Math.ceil(lines[0]!.text.length / POPUP_CHARS) + Math.ceil(lines[1]!.text.length / POPUP_CHARS) + Math.ceil(lines[2]!.text.length / POPUP_CHARS)).toBeLessThanOrEqual(4)
  })

  it('leaves short text alone and gives the room of a missing line to the others', () => {
    expect(fitPopup([{ kind: 'reason', text: 'I am reading.' }])).toEqual([{ kind: 'reason', text: 'I am reading.' }])
    const withoutGoal = fitPopup([
      { kind: 'step', text: long },
      { kind: 'reason', text: long },
    ])
    expect(withoutGoal[0]!.text.length).toBeLessThanOrEqual(POPUP_CHARS * 3)
    expect(withoutGoal[0]!.text.length).toBeGreaterThan(POPUP_CHARS * 2)
  })

  it('shows zzz asleep', () => {
    expect(fitPopup([{ kind: 'sleep', text: 'whatever' }])).toEqual([{ kind: 'sleep', text: 'zzz' }])
  })
})

describe('keeping the pop-up on the screen', () => {
  const popup = { width: 200, height: 100 }
  const viewport = { width: 390, height: 844 }
  it('leaves a pop-up that already fits where it is', () => {
    expect(clampPopup(195, 400, popup, viewport)).toEqual([195, 400])
  })
  it('pulls it in from the left, right and top edges', () => {
    expect(clampPopup(10, 400, popup, viewport)[0]).toBe(108)
    expect(clampPopup(900, 400, popup, viewport)[0]).toBe(282)
    expect(clampPopup(195, 20, popup, viewport)[1]).toBe(108)
  })
  it('keeps clear of the taskbar and copes with a viewport smaller than the pop-up', () => {
    expect(clampPopup(195, 900, popup, viewport)[1]).toBe(844 - 40 - 8)
    const [x, y] = clampPopup(0, 0, { width: 500, height: 500 }, { width: 300, height: 300 })
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
  })
})
