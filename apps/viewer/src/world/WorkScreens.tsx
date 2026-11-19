import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { qaMode } from '../qa/params.ts'
import { qaRegistry } from '../qa/registry.ts'
import { paintTitle } from './paintTitle.ts'
import type { ScreenFace } from './screenFaces.ts'

const PLANE = new THREE.PlaneGeometry(1, 1)
/** The title card's canvas, in pixels: the screen's own shape (0.76 by 0.46 m). */
const CARD = { w: 512, h: 310, pad: 28 } as const

/** A work's title in terminal green on near black, as Merge's own screen shows words, wrapped to at most four lines. */
function titleCard(title: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = CARD.w
  canvas.height = CARD.h
  paintTitle(canvas.getContext('2d')!, title, { x: 0, y: 0, w: CARD.w, h: CARD.h }, { pad: CARD.pad, maxPx: 44, minPx: 22 })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/**
 * One screen: its work's title at once, then its thumbnail once that has loaded (a picture that does not load leaves the title).
 * Unlit, so the screen carries its own light at night as look.md asks. Tells the audit harness what it shows (`qaRegistry.screens`).
 */
function Face({ face, url }: { face: ScreenFace; url: string | null }) {
  const card = useMemo(() => titleCard(face.title), [face.title])
  const [picture, setPicture] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (qaMode) qaRegistry.screens.set(face.key, 'title')
    let gone = false
    let loaded: THREE.Texture | null = null
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    if (url) loader.load(
      url,
      (texture) => {
        if (gone) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 4
        loaded = texture
        setPicture(texture)
        if (qaMode) qaRegistry.screens.set(face.key, 'picture')
      },
      undefined,
      () => console.warn(`the picture of ${face.key} did not load, so its screen shows the title`),
    )
    return () => {
      gone = true
      loaded?.dispose()
      setPicture(null)
      if (qaMode) qaRegistry.screens.delete(face.key)
    }
  }, [face.key, url])
  useEffect(() => () => card.dispose(), [card])
  return (
    <mesh geometry={PLANE} position={face.position} rotation={[0, face.rotY, 0]} scale={[face.size[0], face.size[1], 1]}>
      <meshBasicMaterial map={picture ?? card} toneMapped={false} />
    </mesh>
  )
}

/** Every screen face in the places whose insides are drawn. `urlOf` turns a repo path into the address to load it from. */
export function WorkScreens({ faces, urlOf }: { faces: readonly ScreenFace[]; urlOf: (path: string) => string | null }) {
  return (
    <>
      {faces.map((f) => (
        <Face key={f.key} face={f} url={f.picture ? urlOf(f.picture) : null} />
      ))}
    </>
  )
}
