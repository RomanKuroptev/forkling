export interface TouchInput {
  /** The page address's query string. */
  search: string
  /** `matchMedia('(pointer: coarse)')`: the main pointer is a finger. */
  coarse: boolean
  /** `navigator.maxTouchPoints`. */
  touchPoints: number
}

/**
 * Whether to show the touch controls. A finger as the main pointer on a device that has touch points; `?touch=1` and
 * `?touch=0` decide for themselves, for testing on a desktop and for laptops that are both.
 */
export function detectTouch({ search, coarse, touchPoints }: TouchInput): boolean {
  const asked = new URLSearchParams(search).get('touch')
  if (asked === '1') return true
  if (asked === '0') return false
  return coarse && touchPoints > 0
}

/** How far the stick's knob travels, in pixels. Its far edge runs. */
export const JOYSTICK_RADIUS = 50

/** Decided once, when the page loads. Safe to import where there is no browser (tests). */
export const touchUi: boolean =
  typeof window === 'undefined'
    ? false
    : detectTouch({
        search: window.location.search,
        coarse: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
        touchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
      })
