import type { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildingModel } from './building.ts'
import { COLORS } from './theme.ts'

const PX_PER_M = 96

/** The place's name painted on its building's title bar, white with an ink shadow, in the desktop's pixel type. */
function titleTexture(text: string, width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * PX_PER_M)
  canvas.height = Math.round(height * PX_PER_M)
  const g = canvas.getContext('2d')!
  const px = Math.round(canvas.height * 0.62)
  g.font = `${px}px "Press Start 2P", monospace`
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  // A name too long for the bar is squeezed in, never cut off.
  const room = canvas.width - 8
  const measured = g.measureText(text).width
  const squeeze = measured > room ? room / measured : 1
  g.save()
  g.translate(4, canvas.height / 2 + 2)
  g.scale(squeeze, 1)
  g.fillStyle = COLORS.ink
  g.fillText(text, 3, 3)
  g.fillStyle = COLORS.white
  g.fillText(text, 0, 0)
  g.restore()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** The names on the title bars of every building drawn by the building model, one small quad each. */
export function TitleBars({ places, baseOf }: { places: readonly Place[]; baseOf: (place: Place) => number }) {
  const bars = useMemo(() => {
    const out: { key: string; position: [number, number, number]; width: number; height: number; texture: THREE.CanvasTexture }[] = []
    for (const place of places) {
      const bar = buildingModel(place, kit, baseOf(place))?.titleBar
      if (bar) out.push({ key: place.id, position: bar.position, width: bar.width, height: bar.height, texture: titleTexture(bar.text, bar.width, bar.height) })
    }
    return out
  }, [places, baseOf])
  useEffect(() => () => bars.forEach((b) => b.texture.dispose()), [bars])
  return (
    <>
      {bars.map((b) => (
        <mesh key={b.key} position={b.position} raycast={() => null}>
          <planeGeometry args={[b.width, b.height]} />
          <meshBasicMaterial map={b.texture} transparent toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </>
  )
}
