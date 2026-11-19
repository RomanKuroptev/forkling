import type { Place } from '@forkling/schema'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { qaMode } from '../qa/params.ts'
import { qaRegistry } from '../qa/registry.ts'
import type { WorldClock } from '../clock.ts'
import { pageAt, tileAt, tilesOn, wallFaceLayout, type GalleryWall, type GalleryWork, type PixelRect } from './galleryWall.ts'
import { hoverStore, opens } from './hoverStore.ts'
import { nightFactor } from './night.ts'
import { paintTitle } from './paintTitle.ts'
import { SCREEN } from './theme.ts'

const PLANE = new THREE.PlaneGeometry(1, 1)
/** The face's canvas, in pixels a meter: a tile's picture is then about 370 px wide, as sharp as a screen's. */
const PER_METER = 512
/** The dim green of the frames round a title tile, the dates and the page strip. */
const DIM = '#1f9a55'
const FONT = '"Press Start 2P", ui-monospace, monospace'

type Picture = HTMLImageElement | 'loading' | 'failed'

/** A picture drawn to fill its rectangle, cut at the sides or the top and bottom rather than squashed. */
function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, r: PixelRect): void {
  const scale = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight)
  const sw = r.w / scale
  const sh = r.h / scale
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, r.x, r.y, r.w, r.h)
}

/** One line of small words, shrunk to fit its width. */
function line(g: CanvasRenderingContext2D, text: string, r: PixelRect, color: string, align: 'left' | 'center' | 'right' = 'center'): void {
  const px = Math.max(8, Math.round(r.h * 0.42))
  g.font = `700 ${px}px ${FONT}`
  g.fillStyle = color
  g.textAlign = align
  g.textBaseline = 'middle'
  const width = g.measureText(text).width
  const x = align === 'left' ? r.x : align === 'right' ? r.x + r.w : r.x + r.w / 2
  g.save()
  g.translate(x, r.y + r.h / 2)
  if (width > r.w) g.scale(r.w / width, 1)
  g.fillText(text, 0, 0)
  g.restore()
}

/**
 * Paints one page of the wall: each tile's thumbnail with its title under it, or, with no picture (or while it loads), its title
 * big in terminal green in a dim frame with the day it was made under it; and a strip that says which works are up.
 */
function paintPage(canvas: HTMLCanvasElement, wall: GalleryWall, page: number, pictures: ReadonlyMap<string, Picture>): void {
  const face = wallFaceLayout(wall, PER_METER)
  if (canvas.width !== face.width) canvas.width = face.width
  if (canvas.height !== face.height) canvas.height = face.height
  const g = canvas.getContext('2d')!
  g.fillStyle = SCREEN.off
  g.fillRect(0, 0, face.width, face.height)
  const tiles = tilesOn(wall, page)
  tiles.forEach(({ work }, k) => {
    const { picture: r, caption } = face.tiles[k]!
    const img = pictures.get(work.id)
    if (img instanceof HTMLImageElement) {
      cover(g, img, r)
      line(g, work.title, caption, SCREEN.on)
    } else {
      paintTitle(g, work.title, r, { maxPx: Math.round(r.h / 6), minPx: 10 })
      g.strokeStyle = DIM
      g.lineWidth = 4
      g.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4)
      line(g, `made ${work.made.slice(0, 10)}`, caption, DIM)
    }
  })
  const per = wall.slots.length
  const first = page * per + 1
  const last = page * per + tiles.length
  const n = wall.works.length
  line(g, n === 1 ? '1 WORK' : `WORKS ${first}-${last} OF ${n}`, { ...face.strip, w: face.strip.w * 0.62 }, SCREEN.on, 'left')
  if (wall.pages > 1) line(g, `PAGE ${page + 1}/${wall.pages}`, { ...face.strip, x: face.strip.x + face.strip.w * 0.64, w: face.strip.w * 0.36 }, DIM, 'right')
}

/** The address of a work's thumbnail, or null when it has none or the world has no files to read it from. */
type UrlOf = (path: string) => string | null

/**
 * One gallery wall's painted face: one canvas texture, so the whole board is one draw call however many works there are. It turns
 * to the page of the world's clock (`pageAt`), loads the thumbnails of the page up and the next, and is unlit, so it carries its
 * own light, a little brighter at night (look.md: things that glow glow by day too, and stronger at night). Pointing at a tile
 * names its work; a tap opens it.
 */
function WallFace({ wall, place, clock, urlOf, open }: { wall: GalleryWall; place: Place; clock: WorldClock; urlOf: UrlOf; open: (place: Place, wall: GalleryWall, work: GalleryWork) => void }) {
  const canvas = useMemo(() => document.createElement('canvas'), [])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [canvas])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), [texture])
  useEffect(
    () => () => {
      texture.dispose()
      material.dispose()
    },
    [texture, material],
  )
  const [page, setPage] = useState(() => pageAt(wall, clock.now()))
  const pageRef = useRef(page)
  const pictures = useRef(new Map<string, Picture>())
  const [loaded, setLoaded] = useState(0)

  useFrame(() => {
    const next = pageAt(wall, clock.now())
    if (next !== pageRef.current) {
      pageRef.current = next
      setPage(next)
    }
    material.color.setScalar(1 + 0.35 * nightFactor(clock.hour()))
  })

  // Every work on the wall shows at least its title when its page is up; the harness is told which show their picture.
  const keyOf = (work: GalleryWork) => `${place.id}/${wall.exhibit.id}/${work.id}`
  useEffect(() => {
    if (!qaMode) return
    for (const w of wall.works) qaRegistry.gallery.set(keyOf(w), pictures.current.get(w.id) instanceof HTMLImageElement ? 'picture' : 'title')
    return () => {
      for (const w of wall.works) qaRegistry.gallery.delete(keyOf(w))
    }
  }, [wall, place.id])

  // The thumbnails of the page up and the next one, each loaded once.
  useEffect(() => {
    let gone = false
    for (const p of [page, (page + 1) % wall.pages]) {
      for (const { work } of tilesOn(wall, p)) {
        if (!work.thumb || pictures.current.has(work.id)) continue
        const url = urlOf(`works/${work.id}/thumb.png`)
        if (!url) continue
        pictures.current.set(work.id, 'loading')
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          pictures.current.set(work.id, img)
          if (qaMode) qaRegistry.gallery.set(keyOf(work), 'picture')
          if (!gone) setLoaded((n) => n + 1)
        }
        img.onerror = () => {
          pictures.current.set(work.id, 'failed')
          console.warn(`the picture of ${work.id} did not load, so its tile on the gallery wall shows the title`)
        }
        img.src = url
      }
    }
    return () => {
      gone = true
    }
  }, [wall, page, urlOf])

  useEffect(() => {
    paintPage(canvas, wall, page, pictures.current)
    texture.needsUpdate = true
  }, [canvas, texture, wall, page, loaded])

  const workAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => tileAt(wall, pageRef.current, [e.point.x, e.point.y, e.point.z])
  const hover = (e: ThreeEvent<PointerEvent>) => {
    const work = workAt(e)
    hoverStore.set(work ? { title: work.title, text: work.about } : null)
  }
  return (
    <mesh
      geometry={PLANE}
      material={material}
      position={wall.face.position}
      rotation={[0, wall.rotY, 0]}
      scale={[wall.face.size[0], wall.face.size[1], 1]}
      onClick={(e) => {
        const work = workAt(e)
        if (work) opens(() => open(place, wall, work))(e)
      }}
      onPointerOver={hover}
      onPointerMove={hover}
      onPointerOut={() => hoverStore.set(null)}
    />
  )
}

/** Every gallery wall in the places whose insides are drawn. */
export function GalleryWalls({ walls, clock, urlOf, open }: { walls: readonly { key: string; wall: GalleryWall; place: Place }[]; clock: WorldClock; urlOf: UrlOf; open: (place: Place, wall: GalleryWall, work: GalleryWork) => void }) {
  return (
    <>
      {walls.map(({ key, wall, place }) => (
        <WallFace key={key} wall={wall} place={place} clock={clock} urlOf={urlOf} open={open} />
      ))}
    </>
  )
}
