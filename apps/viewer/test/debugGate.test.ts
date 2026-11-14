import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { debugEnabled } from '../src/debugEnabled.ts'
import { desktopHint } from '../src/ui/hint.ts'

const src = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')

describe('debugEnabled', () => {
  it('is on only when the address has ?debug', () => {
    expect(debugEnabled('?debug')).toBe(true)
    expect(debugEnabled('?world=local&debug&time=12:00')).toBe(true)
    expect(debugEnabled('?debug=physics')).toBe(true)
  })

  it('is off for an ordinary visit', () => {
    expect(debugEnabled('')).toBe(false)
    expect(debugEnabled('?time=12:00')).toBe(false)
    expect(debugEnabled('?debugger=1')).toBe(false)
  })
})

describe('the desktop key hint', () => {
  it('never mentions a contraption', () => {
    expect(desktopHint('Merge', true)).not.toMatch(/contraption/i)
    expect(desktopHint('Merge', false)).not.toMatch(/contraption/i)
  })

  it('names F3 only for ?debug', () => {
    expect(desktopHint('Merge', false)).not.toMatch(/F3/)
    expect(desktopHint('Merge', true)).toMatch(/F3 for Merge’s mind/)
  })

  it('keeps the walking hints for everyone', () => {
    expect(desktopHint('Merge', false)).toMatch(/WASD/)
    expect(desktopHint('Merge', false)).toMatch(/B hides the thought bubble/)
  })
})

describe('what ?debug gates', () => {
  it('F3 does nothing without it', () => {
    expect(src('forkling/DebugOverlay.tsx')).toMatch(/if \(!debugEnabled\(location\.search\) \|\| e\.key !== 'F3'\) return/)
  })

  it('the touch Mind button is drawn only with it', () => {
    expect(src('ui/TouchControls.tsx')).toMatch(/\{debugEnabled\(location\.search\) && \(\s*<button[^>]*\s+type="button"\s+className="touch-mind"/)
  })

  it('the overlay starts closed and opens only for ?debug', () => {
    expect(src('forkling/debugOpen.ts')).toMatch(/createFlag\(typeof location !== 'undefined' && debugEnabled\(location\.search\)\)/)
  })
})
