import { describe, expect, it } from 'vitest'
import { createFlag } from '../src/ui/flag.ts'
import { detectTouch } from '../src/touch.ts'
import { DEAD_ZONE, mergeMovement, RUN_THRESHOLD } from '../src/player/touchInput.ts'
import { createPress, createReach } from '../src/world/interact.ts'

describe('detectTouch', () => {
  it('is touch for a coarse pointer on a device with touch points', () => {
    expect(detectTouch({ search: '', coarse: true, touchPoints: 5 })).toBe(true)
  })

  it('is not touch for a mouse, or for a coarse pointer with no touch points', () => {
    expect(detectTouch({ search: '', coarse: false, touchPoints: 0 })).toBe(false)
    expect(detectTouch({ search: '', coarse: false, touchPoints: 10 })).toBe(false)
    expect(detectTouch({ search: '', coarse: true, touchPoints: 0 })).toBe(false)
  })

  it('lets ?touch=1 and ?touch=0 decide, whatever the device says', () => {
    expect(detectTouch({ search: '?touch=1', coarse: false, touchPoints: 0 })).toBe(true)
    expect(detectTouch({ search: '?debug&touch=1', coarse: false, touchPoints: 0 })).toBe(true)
    expect(detectTouch({ search: '?touch=0', coarse: true, touchPoints: 5 })).toBe(false)
  })

  it('ignores a ?touch value it does not know', () => {
    expect(detectTouch({ search: '?touch=maybe', coarse: true, touchPoints: 5 })).toBe(true)
    expect(detectTouch({ search: '?touch=maybe', coarse: false, touchPoints: 0 })).toBe(false)
  })
})

describe('mergeMovement', () => {
  const idle = { x: 0, y: 0, active: false }

  it('leaves the keyboard exactly as it was when nothing is touched', () => {
    const keys = { forward: true, backward: false, leftward: false, rightward: false, jump: false, run: true }
    expect(mergeMovement(keys, undefined, {})).toEqual(keys)
  })

  it('does not invent keys the keyboard did not have', () => {
    expect(mergeMovement({}, undefined, {})).toEqual({})
  })

  it('walks the way the stick points, with the stick passed through', () => {
    const out = mergeMovement({}, { x: 0.3, y: 0.4, active: true }, {})
    expect(out.joystick).toEqual({ x: 0.3, y: 0.4 })
    expect(out.run).toBeFalsy()
  })

  it('runs from the edge of the stick and walks short of it', () => {
    expect(mergeMovement({}, { x: 0, y: RUN_THRESHOLD - 0.01, active: true }, {}).run).toBeFalsy()
    expect(mergeMovement({}, { x: 0, y: RUN_THRESHOLD, active: true }, {}).run).toBe(true)
    expect(mergeMovement({}, { x: 0.8, y: 0.8, active: true }, {}).run).toBe(true)
  })

  it('treats a tiny touch as no touch, so a resting thumb does not creep', () => {
    const out = mergeMovement({ forward: true }, { x: DEAD_ZONE / 2, y: DEAD_ZONE / 2, active: true }, {})
    expect(out).toEqual({ forward: true, joystick: { x: 0, y: 0 } })
  })

  it('says outright that the stick is at rest, because the character remembers the last push it was given', () => {
    // ecctrl only applies the fields it is sent. Leave the stick out after a release and it keeps walking the same way.
    expect(mergeMovement({}, idle, {})).toEqual({ joystick: { x: 0, y: 0 } })
    expect(mergeMovement({ forward: false }, { x: 0.4, y: 0.9, active: false }, {}).joystick).toEqual({ x: 0, y: 0 })
  })

  it('forgets the stick as soon as it is let go, then listens to the keyboard again', () => {
    const pushed = mergeMovement({}, { x: 0, y: 1, active: true }, {})
    expect(pushed.joystick).toEqual({ x: 0, y: 1 })
    const released = mergeMovement({ forward: true }, idle, {})
    expect(released).toEqual({ forward: true, joystick: { x: 0, y: 0 } })
  })

  it('jumps from the button as well as from the key', () => {
    expect(mergeMovement({}, undefined, { jump: true }).jump).toBe(true)
    expect(mergeMovement({ jump: true }, idle, { jump: false }).jump).toBe(true)
    expect(mergeMovement({ jump: false }, idle, {}).jump).toBe(false)
  })

  it('keeps running if shift is held while the stick is short of the edge', () => {
    expect(mergeMovement({ run: true }, { x: 0, y: 0.3, active: true }, {}).run).toBe(true)
  })

  it('keeps the keyboard working while the stick is in use', () => {
    const out = mergeMovement({ leftward: true }, { x: 0, y: 0.5, active: true }, {})
    expect(out.leftward).toBe(true)
    expect(out.joystick).toEqual({ x: 0, y: 0.5 })
  })
})

describe('createFlag', () => {
  it('holds a value and tells subscribers only when it changes', () => {
    const flag = createFlag(false)
    const seen: boolean[] = []
    const off = flag.subscribe(() => seen.push(flag.get()))
    flag.set(true)
    flag.set(true)
    flag.toggle()
    off()
    flag.set(true)
    expect(seen).toEqual([true, false])
    expect(flag.get()).toBe(true)
  })

  it('starts from what it is given', () => {
    expect(createFlag(true).get()).toBe(true)
  })
})

describe('createPress', () => {
  it('counts presses, so every reader can tell whether there was one since it last looked', () => {
    const press = createPress()
    const seen = press.count()
    expect(press.count()).toBe(seen)
    press.press()
    press.press()
    expect(press.count()).toBe(seen + 2)
  })
})

describe('createReach', () => {
  it('is near while any contraption is in reach, and not once the last one is out', () => {
    const flag = createFlag(false)
    const reach = createReach(flag)
    reach.report('a', true)
    reach.report('b', true)
    expect(flag.get()).toBe(true)
    reach.report('a', false)
    expect(flag.get()).toBe(true)
    reach.report('b', false)
    expect(flag.get()).toBe(false)
  })

  it('forgets a contraption that is gone', () => {
    const flag = createFlag(false)
    const reach = createReach(flag)
    reach.report('a', true)
    reach.forget('a')
    expect(flag.get()).toBe(false)
  })
})
