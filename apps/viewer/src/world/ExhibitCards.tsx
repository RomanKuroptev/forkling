import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { CARD, WIREFRAME } from './theme.ts'
import { CARD_CELL, MAX_CARDS, cardAtlas, cardLayout, type CardFace, type CardLayout } from './exhibitCards.ts'

const BODY_FONT = (px: number) => `${px}px VT323, monospace`
const BAR_FONT = '12px "Press Start 2P", monospace'

/** Writes one line, squeezed across if the browser's real width is wider than the room the layout gave it. */
function line(g: CanvasRenderingContext2D, text: string, x: number, y: number, room: number, align: CanvasTextAlign) {
  const width = g.measureText(text).width
  g.save()
  g.textAlign = align
  g.translate(x, y)
  g.scale(width > room ? room / width : 1, 1)
  g.fillText(text, 0, 0)
  g.restore()
}

/** One card in its cell: the window or plaque or screen, then its words. A picture is drawn later, when it has loaded. */
function paintCard(g: CanvasRenderingContext2D, face: CardFace, l: CardLayout) {
  const { style } = face.content
  const pad = 12
  if (face.content.wire) {
    // In a place being built (issue 426): no face, only the words in the wire's glowing cyan; the card's outline is the wire's own.
    g.clearRect(0, 0, l.w, l.h)
    g.fillStyle = WIREFRAME.pole
    if (l.title) {
      g.font = BAR_FONT
      g.textBaseline = 'middle'
      line(g, l.title, l.w / 2, 5 + (l.bar - 7) / 2 + 1, l.w - 24, 'center')
    }
    g.font = BODY_FONT(l.px)
    g.textBaseline = 'alphabetic'
    l.lines.forEach((text, i) => line(g, text, l.w / 2, l.top + i * l.lineHeight, l.w - 2 * pad, 'center'))
    return
  }
  if (style === 'paper') {
    g.fillStyle = CARD.ink
    g.fillRect(0, 0, l.w, l.h)
    g.fillStyle = CARD.body
    g.fillRect(3, 3, l.w - 6, l.h - 6)
    const bar = g.createLinearGradient(0, 0, l.w, 0)
    bar.addColorStop(0, CARD.barFrom)
    bar.addColorStop(1, CARD.barTo)
    g.fillStyle = bar
    g.fillRect(5, 5, l.w - 10, l.bar - 7)
    g.fillStyle = CARD.barText
    g.font = BAR_FONT
    g.textBaseline = 'middle'
    line(g, l.title, 12, 5 + (l.bar - 7) / 2 + 1, l.w - 24, 'left')
    g.fillStyle = CARD.ink
  } else if (style === 'brass') {
    g.fillStyle = CARD.brassEdge
    g.fillRect(0, 0, l.w, l.h)
    g.fillStyle = CARD.brass
    g.fillRect(5, 5, l.w - 10, l.h - 10)
    g.fillStyle = CARD.ink
  } else {
    g.fillStyle = CARD.screen
    g.fillRect(0, 0, l.w, l.h)
    g.fillStyle = CARD.green
  }
  if (l.picture) {
    g.fillStyle = CARD.picture
    g.fillRect(l.picture.x, l.picture.y, l.picture.w, l.picture.h)
    g.fillStyle = style === 'terminal' ? CARD.green : CARD.ink
  }
  g.font = BODY_FONT(l.px)
  g.textBaseline = 'alphabetic'
  const centred = style !== 'terminal'
  l.lines.forEach((text, i) => line(g, text, centred ? l.w / 2 : pad, l.top + i * l.lineHeight, l.w - 2 * pad, centred ? 'center' : 'left'))
}

function paintAtlas(canvas: HTMLCanvasElement, faces: readonly CardFace[]) {
  const atlas = cardAtlas(faces.length)
  canvas.width = atlas.width
  canvas.height = atlas.height
  const g = canvas.getContext('2d')!
  faces.forEach((face, i) => {
    const cell = atlas.cell(i)
    g.save()
    g.translate(cell.x, cell.y)
    paintCard(g, face, cardLayout(face.content, face.aspect))
    g.restore()
  })
}

/** Draws a loaded picture into its card, covering its area and keeping its shape (cut at the sides or the top and bottom). */
function paintPicture(canvas: HTMLCanvasElement, count: number, index: number, face: CardFace, img: HTMLImageElement) {
  const l = cardLayout(face.content, face.aspect)
  if (!l.picture || img.naturalWidth === 0) return
  const cell = cardAtlas(count).cell(index)
  const g = canvas.getContext('2d')!
  const p = l.picture
  const scale = Math.max(p.w / img.naturalWidth, p.h / img.naturalHeight)
  const sw = p.w / scale
  const sh = p.h / scale
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, cell.x + p.x, cell.y + p.y, p.w, p.h)
}

/** One quad for each card, with the texture coordinates of its part of its cell. */
function cardGeometry(faces: readonly CardFace[]): THREE.BufferGeometry {
  const atlas = cardAtlas(faces.length)
  const positions = new Float32Array(faces.length * 12)
  const uvs = new Float32Array(faces.length * 8)
  const normals = new Float32Array(faces.length * 12)
  const indices = new Uint32Array(faces.length * 6)
  faces.forEach((face, i) => {
    const cell = atlas.cell(i)
    const h = Math.min(CARD_CELL.h, Math.round(CARD_CELL.w * face.aspect))
    const [u0, u1] = [cell.x / atlas.width, (cell.x + CARD_CELL.w) / atlas.width]
    const [vTop, vBottom] = [1 - cell.y / atlas.height, 1 - (cell.y + h) / atlas.height]
    positions.set(face.corners.flat(), i * 12)
    uvs.set([u0, vBottom, u1, vBottom, u1, vTop, u0, vTop], i * 8)
    for (let k = 0; k < 4; k++) normals.set(face.normal, i * 12 + k * 3)
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
 * The cards on every exhibit in the insides that are drawn (issues 347, 355): what each holds, painted on one texture and drawn
 * as one mesh, so a room full of souvenirs costs one draw call. An image souvenir's picture is loaded by the browser from its https
 * address, without a referrer; one that does not load leaves its card with the credit and the label. A framed picture's label plate
 * (`platePose`, `plateText`) is one more face in the same texture, painted in the brass style.
 */
export function ExhibitCards({ faces: all }: { faces: readonly CardFace[] }) {
  const faces = useMemo(() => all.slice(0, MAX_CARDS), [all])
  const [fontsReady, setFontsReady] = useState(() => typeof document === 'undefined' || document.fonts.check(BODY_FONT(22)))
  useEffect(() => {
    if (fontsReady) return
    let alive = true
    void Promise.all([document.fonts.load(BODY_FONT(22)), document.fonts.load(BAR_FONT)]).finally(() => alive && setFontsReady(true))
    return () => {
      alive = false
    }
  }, [fontsReady])
  const { geometry, material, canvas, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    paintAtlas(canvas, faces)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    // Lit by the room, and glowing a little of their own, so the words can be read in a room whose lamps are off.
    // A wire card (a place being built) is only its words: the clear rest of its cell is cut away (`alphaTest`).
    const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: new THREE.Color(CARD.barText), emissiveIntensity: 0.35, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, alphaTest: 0.4 })
    return { geometry: cardGeometry(faces), material, canvas, texture }
    // `fontsReady` repaints once the fonts are there.
  }, [faces, fontsReady])
  useEffect(() => {
    let alive = true
    const images: HTMLImageElement[] = []
    faces.forEach((face, i) => {
      const pic = face.content.picture
      if (!pic) return
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'no-referrer'
      img.decoding = 'async'
      img.onload = () => {
        if (!alive) return
        paintPicture(canvas, faces.length, i, face, img)
        texture.needsUpdate = true
      }
      img.src = pic.url
      images.push(img)
    })
    return () => {
      alive = false
      for (const img of images) img.onload = null
    }
  }, [faces, canvas, texture])
  useEffect(
    () => () => {
      geometry.dispose()
      texture.dispose()
      material.dispose()
    },
    [geometry, material, texture],
  )
  if (faces.length === 0) return null
  // The invisible targets in `Places` take the clicks and the hover; the cards are only to look at.
  return <mesh name="exhibit-cards" geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
