import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SIGN_CELL, SIGN_PAD, atlasLayout, type SignBoard } from './signGeometry.ts'

/** Every sign's words painted onto one canvas, a cell for each (`atlasLayout`), as one texture. */
function paintAtlas(boards: readonly SignBoard[]): THREE.CanvasTexture {
  const atlas = atlasLayout(boards.length)
  const canvas = document.createElement('canvas')
  canvas.width = atlas.width
  canvas.height = atlas.height
  const g = canvas.getContext('2d')!
  boards.forEach((board, i) => {
    const cell = atlas.cell(i)
    g.save()
    g.translate(cell.x, cell.y)
    g.scale(atlas.scale, atlas.scale)
    g.fillStyle = board.colors.bg
    g.fillRect(0, 0, SIGN_CELL.w, SIGN_CELL.h)
    g.globalAlpha = 0.55
    g.strokeStyle = board.colors.fg
    g.lineWidth = 6
    g.strokeRect(10, 10, SIGN_CELL.w - 20, SIGN_CELL.h - 20)
    g.globalAlpha = 1
    g.fillStyle = board.colors.fg
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    for (const op of board.layout.ops) {
      g.font = `${op.bold ? 700 : 500} ${op.px}px system-ui, "Segoe UI", Roboto, sans-serif`
      // The layout only estimates how wide a line is; the real width squeezes it in if it is wider than the board has room for.
      const width = g.measureText(op.text).width
      const room = SIGN_CELL.w - 2 * SIGN_PAD
      g.save()
      g.translate(SIGN_CELL.w / 2, op.y)
      g.scale(width > room ? room / width : 1, 1)
      g.fillText(op.text, 0, 0)
      g.restore()
    }
    g.restore()
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** One quad for each board, facing +z, with the texture coordinates of its cell in the atlas. */
function boardGeometry(boards: readonly SignBoard[]): THREE.BufferGeometry {
  const atlas = atlasLayout(boards.length)
  const positions = new Float32Array(boards.length * 12)
  const uvs = new Float32Array(boards.length * 8)
  const normals = new Float32Array(boards.length * 12)
  const indices = new Uint32Array(boards.length * 6)
  boards.forEach((board, i) => {
    const [x, y, z] = board.position
    const [hw, hh] = [board.size[0] / 2, board.size[1] / 2]
    const c = atlas.cell(i)
    positions.set([x - hw, y - hh, z, x + hw, y - hh, z, x + hw, y + hh, z, x - hw, y + hh, z], i * 12)
    uvs.set([c.u0, c.v0, c.u1, c.v0, c.u1, c.v1, c.u0, c.v1], i * 8)
    for (let k = 0; k < 4; k++) normals.set([0, 0, 1], i * 12 + k * 3)
    indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometry
}

/**
 * The signs by the doors (spec 4.6): a board for each place with its name and its sign text on it, all in one draw call. The board
 * glows a little (the emissive map is its own picture), so at night the words can still be read from the path.
 */
export function Signs({ boards }: { boards: readonly SignBoard[] }) {
  const { geometry, material } = useMemo(() => {
    const map = paintAtlas(boards)
    return {
      geometry: boardGeometry(boards),
      material: new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.5, roughness: 0.9 }),
    }
  }, [boards])
  useEffect(
    () => () => {
      geometry.dispose()
      material.map?.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  if (boards.length === 0) return null
  // The invisible targets in `Places` take the clicks and the hover; the board itself is only to look at.
  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
