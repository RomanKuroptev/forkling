import type { Artifact } from '@forkling/schema'
import { heightAt } from '@forkling/sim'
import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, DoubleSide, SRGBColorSpace } from 'three'
import { island } from '../island.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { pickDrawings, svgDataUrl } from './gallery.ts'

/** How many of its latest drawings stand by the house. */
const FRAMES = 3
const SIZE = 512

/** A drawing as a texture: the cleaned SVG, painted onto a canvas on a paper-coloured ground. Null until it has loaded. */
function useDrawingTexture(svg: string): CanvasTexture | null {
  const [texture, setTexture] = useState<CanvasTexture | null>(null)
  useEffect(() => {
    const url = svgDataUrl(svg)
    if (!url) return
    let cancelled = false
    let made: CanvasTexture | null = null
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#f4efe6'
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.drawImage(img, 0, 0, SIZE, SIZE)
      made = new CanvasTexture(canvas)
      made.colorSpace = SRGBColorSpace
      setTexture(made)
    }
    img.src = url
    return () => {
      cancelled = true
      made?.dispose()
    }
  }, [svg])
  return texture
}

function Frame({ drawing, x, z }: { drawing: Extract<Artifact, { kind: 'drawing' }>; x: number; z: number }) {
  const texture = useDrawingTexture(drawing.content.svg)
  const y = heightAt(x, z, island)
  return (
    <group position={[x, y, z]} name={`drawing-${drawing.id}`}>
      <mesh position={[-0.55, 0.6, 0]} castShadow>
        <boxGeometry args={[0.08, 1.2, 0.08]} />
        <meshStandardMaterial color="#7a5a3a" />
      </mesh>
      <mesh position={[0.55, 0.6, 0]} castShadow>
        <boxGeometry args={[0.08, 1.2, 0.08]} />
        <meshStandardMaterial color="#7a5a3a" />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <boxGeometry args={[1.5, 1.5, 0.06]} />
        <meshStandardMaterial color="#8c6a45" />
      </mesh>
      <mesh position={[0, 1.45, 0.04]}>
        <planeGeometry args={[1.3, 1.3]} />
        {/* A material built without a map has to be rebuilt to gain one, so it is keyed on having it. */}
        <meshBasicMaterial key={texture ? 'drawn' : 'blank'} map={texture} color={texture ? '#ffffff' : '#f4efe6'} side={DoubleSide} />
      </mesh>
    </group>
  )
}

/**
 * Its latest drawings, framed on posts beside the house, so a visitor sees what it has been making. Nothing is
 * solid: they are for looking at.
 */
export function GalleryWall() {
  const { world } = useWorld()
  const drawings = useMemo(() => pickDrawings(world.art, FRAMES), [world.art])
  if (drawings.length === 0) return null
  const home = world.objects.find((o) => o.id === 'house')?.position ?? world.forkling.position
  return (
    <>
      {drawings.map((d, i) => (
        <Frame key={d.id} drawing={d} x={home[0] + 5} z={home[2] - 2 + i * 1.9} />
      ))}
    </>
  )
}
