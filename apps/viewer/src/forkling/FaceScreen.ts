import * as THREE from 'three'
import { SCREEN } from '../world/theme.ts'
import { FACE_COLS, FACE_ROWS, faceGrid, type FaceState } from './face.ts'

const CELL = 8

/** The picture on Merge's monitor: a 16 by 12 grid of big pixels on a canvas, repainted only when a pixel changes. */
export function createFaceScreen(mesh: THREE.Mesh) {
  const canvas = document.createElement('canvas')
  canvas.width = FACE_COLS * CELL
  canvas.height = FACE_ROWS * CELL
  const g = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  mesh.material = material
  let last = ''
  return {
    paint(state: FaceState, t: number): void {
      const rows = faceGrid(state, t)
      const key = `${state}|${rows.join('|')}`
      if (key === last) return
      last = key
      g.fillStyle = SCREEN.off
      g.fillRect(0, 0, canvas.width, canvas.height)
      g.fillStyle = SCREEN.on
      rows.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) if (row[c] === '#') g.fillRect(c * CELL, r * CELL, CELL, CELL)
      })
      if (state === 'nosignal') {
        g.font = `${CELL}px "Press Start 2P", monospace`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('NO SIGNAL', canvas.width / 2, 9 * CELL)
      }
      texture.needsUpdate = true
    },
    dispose(): void {
      texture.dispose()
      material.dispose()
    },
  }
}
