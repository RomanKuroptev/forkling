/**
 * 4 by 4 transforms as 16 numbers in the order three.js keeps them (column by column), so a list of them can be handed to an
 * instanced mesh as it is. Plain arrays, no three.js, so the shapes of a world can be worked out and tested without a renderer.
 */
export type Mat4 = number[]

/** Translation, then rotation (Euler angles in radians, three.js's XYZ order), then scale, like three.js's `compose`. */
export function compose(position: readonly [number, number, number], euler: readonly [number, number, number], scale: readonly [number, number, number]): Mat4 {
  const [x, y, z] = euler
  const a = Math.cos(x)
  const b = Math.sin(x)
  const c = Math.cos(y)
  const d = Math.sin(y)
  const e = Math.cos(z)
  const f = Math.sin(z)
  const ae = a * e
  const af = a * f
  const be = b * e
  const bf = b * f
  const [sx, sy, sz] = scale
  return [
    c * e * sx, (af + be * d) * sx, (bf - ae * d) * sx, 0,
    -c * f * sy, (ae - bf * d) * sy, (be + af * d) * sy, 0,
    d * sz, -b * c * sz, a * c * sz, 0,
    position[0], position[1], position[2], 1,
  ]
}

/** `a` times `b`: the transform that does `b` first and then `a`. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!
      out[col * 4 + row] = sum
    }
  }
  return out
}
