import { kit } from '@forkling/schema/kit'
import { neglectFor, openPlaceRequests, placeCentre, toLandPlace } from '@forkling/sim'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { visitor } from '../visitor.ts'
import { SIGN_W, exhibitSpots, signSpot } from './exhibitGeometry.ts'
import { signHoverText } from './panelContent.ts'
import { hoverStore, opens } from './hoverStore.ts'
import { panelStore } from './panelStore.ts'
import { plotSign } from './plotGeometry.ts'
import { kitModelUrl } from './kitModels.ts'
import { restyleMaterial } from './modelStyle.ts'
import { nightFactor } from './night.ts'
import { INTERIOR, NIGHT_LIGHT } from './theme.ts'
import { Signs } from './Signs.tsx'
import { TitleBars } from './TitleBars.tsx'
import { WorkScreens } from './WorkScreens.tsx'
import { GalleryWalls } from './GalleryWalls.tsx'
import { galleryWalls, type GalleryWall, type GalleryWork } from './galleryWall.ts'
import { screenFaces } from './screenFaces.ts'
import { localFilesBase, worldFileUrl } from './worldData.ts'
import { ExhibitCards } from './ExhibitCards.tsx'
import { cardFaces } from './exhibitCards.ts'
import { useSouvenirs } from './useSouvenirs.ts'
import { signBoards } from './signGeometry.ts'
import { ROUND_SEGMENTS, SPHERE_SEGMENTS, exteriorInstances, interiorsToLoad, modelFiles, type LampSpot, sceneInstances, wallBoxes, type Shape, type ShapeInstances } from './kitGeometry.ts'
import { useWorld } from './WorldContext.tsx'
import { worldLand } from './worldLand.ts'
import { qaMode } from '../qa/params.ts'
import { qaRegistry } from '../qa/registry.ts'
import { plantBoards } from '../qa/plant.ts'

/** The unit shapes every part is made of; an instance scales them to its primitive's size. */
const GEOMETRIES: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, SPHERE_SEGMENTS[0], SPHERE_SEGMENTS[1]),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, ROUND_SEGMENTS),
  cone: new THREE.ConeGeometry(0.5, 1, ROUND_SEGMENTS),
}

/** `?lit` draws every place as cared for with its lamps on, to look at the glow (a debug flag). */
/** `?wire` draws every place as being built, to look at the wireframe (a debug flag). */
const WIRE_ALWAYS = new URLSearchParams(location.search).has('wire')
const LIT_ALWAYS = new URLSearchParams(location.search).has('lit')

/** How night it is, shared by every shape's material: windows and lamps glow in proportion to it. */
const nightUniform = { value: 0 }

const f = (n: number) => n.toFixed(3)

/**
 * A matte standard material that adds a glow to the instances marked to glow (a window's glass, a lamp that is on), stronger at night,
 * a little glow at night to lit trim, and gives the inside of a place less of the sky's light (issues 358, 361; `NIGHT_LIGHT`, `INTERIOR`).
 */
function glowMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.45, metalness: 0.05 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute float aTrim;\nattribute float aInside;\nvarying float vGlow;\nvarying float vTrim;\nvarying float vInside;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;\nvTrim = aTrim;\nvInside = aInside;')
    // What a surface gives off of its own colour: a little everywhere (less at night, or pale colours go khaki in the dark), a lot
    // for a window or lamp (more at night), and some for lit trim at night.
    const self = `mix(${f(NIGHT_LIGHT.selfDay)}, ${f(NIGHT_LIGHT.selfNight)}, uNight)`
    const glow = `mix(${f(NIGHT_LIGHT.glowDay)}, ${f(NIGHT_LIGHT.glowNight)}, uNight)`
    const keep = f(1 - NIGHT_LIGHT.glowLit)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;\nvarying float vTrim;\nvarying float vInside;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * (${self} + vGlow * ${glow} + vTrim * mix(${f(NIGHT_LIGHT.trimDay)}, ${f(NIGHT_LIGHT.trimNight)}, uNight));`)
      // Under a roof, less of the sky's light; a glowing thing takes only part of the light that falls on it, so it keeps its colour.
      .replace(
        '#include <lights_fragment_end>',
        `irradiance *= mix(1.0, ${f(INTERIOR.skyInside)}, vInside);\n#include <lights_fragment_end>\nreflectedLight.directDiffuse *= 1.0 - vGlow * ${keep};\nreflectedLight.indirectDiffuse *= 1.0 - vGlow * ${keep};`,
      )
  }
  return material
}

/** One draw call for all the instances of a shape, each with its own matrix, colour and glow. */
function Shapes({ shape, data, glass = false }: { shape: Shape; data: ShapeInstances; glass?: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  // Its own copy of the unit shape, because the glow of each instance is an attribute of the geometry.
  const geometry = useMemo(() => {
    const g = GEOMETRIES[shape].clone()
    g.setAttribute('aGlow', new THREE.InstancedBufferAttribute(data.glow, 1))
    g.setAttribute('aTrim', new THREE.InstancedBufferAttribute(data.trim, 1))
    g.setAttribute('aInside', new THREE.InstancedBufferAttribute(data.inside, 1))
    return g
  }, [shape, data])
  const material = useMemo(() => {
    const m = glowMaterial()
    if (glass) {
      m.transparent = true
      m.opacity = 0.55
      m.depthWrite = false
    }
    return m
  }, [glass])
  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )
  useEffect(() => () => material.dispose(), [material])
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    m.instanceMatrix = new THREE.InstancedBufferAttribute(data.matrices, 16)
    m.instanceColor = new THREE.InstancedBufferAttribute(data.colors, 3)
    m.count = data.count
  }, [data])
  if (data.count === 0) return null
  // The capacity is fixed when the mesh is made, so a different number of instances is a new mesh.
  return (
    <instancedMesh key={data.count} ref={mesh} args={[geometry, material, data.count]} castShadow={!glass} receiveShadow frustumCulled={false} />
  )
}

/**
 * Warm light from the lamps that are on, in the insides drawn: a few point lights, moved each frame to the lamps nearest the visitor,
 * soft by day and strong at night, so a lived-in room has pools of lamp light (issue 361). The number of lights never changes, so
 * the shaders are made once; a light with no lamp to stand at is off.
 */
function LampLights({ lamps }: { lamps: readonly LampSpot[] }) {
  const { clock } = useWorld()
  const lights = useRef<(THREE.PointLight | null)[]>([])
  useFrame(() => {
    const v = visitor.position
    const near = v ? [...lamps].sort((a, b) => Math.hypot(a.position[0] - v.x, a.position[2] - v.z) - Math.hypot(b.position[0] - v.x, b.position[2] - v.z)).slice(0, INTERIOR.lamps) : []
    const strength = INTERIOR.lampDay + (INTERIOR.lampNight - INTERIOR.lampDay) * nightFactor(clock.hour())
    lights.current.forEach((light, k) => {
      if (!light) return
      const spot = near[k]
      light.intensity = spot ? strength : 0
      // Just under the lamp's glowing part, so it lights the room and not the inside of its own shade.
      if (spot) light.position.set(spot.position[0], spot.position[1] - 0.12, spot.position[2])
    })
  })
  return (
    <>
      {Array.from({ length: INTERIOR.lamps }, (_, k) => (
        <pointLight key={k} ref={(l) => void (lights.current[k] = l)} color={INTERIOR.lampLight} intensity={0} distance={INTERIOR.lampReach} decay={2} />
      ))}
    </>
  )
}

/** A loaded model file: each of its meshes, with the transform that places it in the model. */
interface LoadedModel {
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; matrix: THREE.Matrix4 }[]
}

/** One draw call for each mesh of a model file, for all the places it stands in. */
function ModelShapes({ model, matrices }: { model: LoadedModel; matrices: Float32Array }) {
  const count = matrices.length / 16
  return (
    <>
      {model.parts.map((part, k) => (
        <ModelPart key={`${k}-${count}`} part={part} matrices={matrices} count={count} />
      ))}
    </>
  )
}

function ModelPart({ part, matrices, count }: { part: LoadedModel['parts'][number]; matrices: Float32Array; count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const at = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      at.fromArray(matrices, i * 16).multiply(part.matrix)
      m.setMatrixAt(i, at)
    }
    m.instanceMatrix.needsUpdate = true
  }, [part, matrices, count])
  return <instancedMesh ref={mesh} args={[part.geometry, part.material as THREE.Material, count]} castShadow receiveShadow frustumCulled={false} />
}

/**
 * Every place: its outside always, its inside only for the place the visitor is in and the ones around it (spec 4.6), all drawn as one
 * instanced mesh per shape. The walls have colliders with the same door gap as the cat's own world has.
 */
export function Places() {
  const { world, clock } = useWorld()
  const land = useMemo(() => worldLand(world), [world])
  const plots = useMemo(() => openPlaceRequests(world.requests), [world])
  // The clock decides how neglected each place looks (spec 4.4); a minute is fine-grained enough, days are what matter.
  const [nowMs, setNowMs] = useState(() => clock.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(clock.now()), 60_000)
    return () => clearInterval(id)
  }, [clock])
  // The night comes on with the sun going down.
  useFrame(() => {
    nightUniform.value = nightFactor(clock.hour())
  })
  const [interiors, setInteriors] = useState<ReadonlySet<string>>(() => interiorsToLoad(world.places, visitor.position))
  const key = useRef('')
  useFrame(() => {
    const next = interiorsToLoad(world.places, visitor.position)
    const id = [...next].sort().join(',')
    if (id !== key.current) {
      key.current = id
      setInteriors(next)
    }
  })

  // The kit's model files load in the background. A part with a model is drawn from its primitives until its file has loaded,
  // and for good if it never does (a missing or broken file is never an error, spec 5.3).
  const [loaded, setLoaded] = useState<Record<string, LoadedModel>>({})
  useEffect(() => {
    let cancelled = false
    const loader = new GLTFLoader()
    // The audit harness (`?qa=1`) waits until every model file has loaded or failed before it calls the world ready.
    const settled = () => {
      if (qaMode) qaRegistry.models.settled++
    }
    if (qaMode) qaRegistry.models.total = modelFiles(kit).filter((file) => kitModelUrl(file)).length
    for (const file of modelFiles(kit)) {
      const url = kitModelUrl(file)
      if (!url) continue
      loader.loadAsync(url).then(
        (gltf) => {
          settled()
          if (cancelled) return
          gltf.scene.updateMatrixWorld(true)
          const parts: LoadedModel['parts'] = []
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) parts.push({ geometry: o.geometry, material: restyleMaterial(o.material as THREE.Material), matrix: o.matrixWorld.clone() })
          })
          setLoaded((was) => ({ ...was, [file]: { parts } }))
        },
        (error) => {
          settled()
          console.warn(`kit model ${file} did not load, so its parts stay as primitives:`, error)
        },
      )
    }
    return () => {
      cancelled = true
    }
  }, [])
  const loadedFiles = useMemo(() => new Set(Object.keys(loaded)), [loaded])
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __forklingModels: () => [...loadedFiles].sort() })
  }, [loadedFiles])

  // What each exhibit in a drawn inside holds, on a card in front of it (issues 347, 355): the souvenir files are read as the insides load.
  const insidePlaces = useMemo(() => world.places.filter((p) => interiors.has(p.id)), [world, interiors])
  const souvenirs = useSouvenirs(world, insidePlaces)
  const cards = useMemo(() => {
    const baseOf = (p: (typeof world.places)[number]) => {
      const [x, z] = placeCentre(toLandPlace(p))
      return land.heightAt(x, z)
    }
    return cardFaces(insidePlaces.flatMap((p) => exhibitSpots(p, kit, baseOf(p))), souvenirs, world.workIds.length)
  }, [world, land, insidePlaces, souvenirs])

  // The audit harness (`?qa=1`) lists the places as they are drawn now (`window.__qa.scene()`).
  useEffect(() => {
    if (!qaMode) return
    qaRegistry.places = { places: world.places, kit, heightAt: (x, z) => land.heightAt(x, z), interiors, nowMs, plots, wireAlways: WIRE_ALWAYS, plant: qaRegistry.plant, screens: qaRegistry.screens, souvenirs, workCount: world.workIds.length, shelf: world.shelf, gallery: qaRegistry.gallery }
    qaRegistry.models.drawn = loadedFiles.size
  }, [world, land, interiors, nowMs, plots, loadedFiles, souvenirs])

  const scene = useMemo(() => sceneInstances(world.places, kit, { heightAt: (x, z) => land.heightAt(x, z), interiors, models: loadedFiles, nowMs, plots, litAlways: LIT_ALWAYS, wireAlways: WIRE_ALWAYS, shelf: world.shelf }), [world, land, interiors, loadedFiles, nowMs, plots])
  // The board of each place's sign: its name and its sign text, painted on one texture.
  const baseOfPlace = useCallback((p: (typeof world.places)[number]) => { const [x, z] = placeCentre(toLandPlace(p)); return land.heightAt(x, z) }, [land])
  // What each work screen in a drawn inside shows: the work's thumbnail, or its title (issues 352, 341, 362).
  const faces = useMemo(() => screenFaces(world.places.filter((p) => interiors.has(p.id)), kit, baseOfPlace, new Set(world.workThumbs)), [world, interiors, baseOfPlace])
  const urlOf = useCallback((path: string) => worldFileUrl(world, path, localFilesBase(world, location.origin, import.meta.env.BASE_URL)), [world])
  // Every finished work, a page at a time, on the gallery wall over the gallery terminal (spec 7.2, issues 291, 307).
  const gallery = useMemo(
    () => world.places.filter((p) => interiors.has(p.id)).flatMap((p) => galleryWalls(p, kit, baseOfPlace(p), world.shelf, exteriorInstances(p, kit, baseOfPlace(p))).map((wall) => ({ key: `${p.id}/${wall.exhibit.id}`, wall, place: p }))),
    [world, interiors, baseOfPlace],
  )
  const openWork = useCallback((place: (typeof world.places)[number], wall: GalleryWall, work: GalleryWork) => void panelStore.open({ kind: 'exhibit', place, exhibit: { ...wall.exhibit, kind: 'work', ref: `works/${work.id}`, label: work.title } }, world), [world])
  // Under ?qa=1 a fixture may plant a lifted sign (`qa/plant.ts`); in normal mode the plant is null and the boards are as made.
  const boards = useMemo(() => plantBoards(signBoards(world.places, (p) => { const [x, z] = placeCentre(toLandPlace(p)); return land.heightAt(x, z) }, kit), qaRegistry.plant), [world, land])
  const walls = useMemo(
    () =>
      // Under ?qa=1 a fixture may plant a place whose walls do not stop the visitor (`qa/plant.ts`); null in normal mode.
      world.places.filter((place) => !qaRegistry.plant?.walkThrough.includes(place.id)).flatMap((place) => {
        const [px, pz] = placeCentre(toLandPlace(place))
        const base = land.heightAt(px, pz)
        return wallBoxes(place).map((b) => ({
          position: [(b.x0 + b.x1) / 2, base + b.height / 2, (b.z0 + b.z1) / 2] as [number, number, number],
          half: [(b.x1 - b.x0) / 2, b.height / 2, (b.z1 - b.z0) / 2] as [number, number, number],
        }))
      }),
    [world, land],
  )

  // Invisible targets over each exhibit in the places that are loaded, and over every sign, so the visitor can point at them.
  const targets = useMemo(() => {
    const baseOf = (p: (typeof world.places)[number]) => {
      const [x, z] = placeCentre(toLandPlace(p))
      return land.heightAt(x, z)
    }
    return {
      exhibits: world.places.filter((p) => interiors.has(p.id)).flatMap((p) => exhibitSpots(p, kit, baseOf(p)).map((s) => ({ key: `${p.id}/${s.exhibit.id}`, position: s.position, rotY: s.rotY, title: p.name, text: s.exhibit.label, open: () => void panelStore.open({ kind: 'exhibit', place: p, exhibit: s.exhibit }, world) }))),
      plots: plots.map((r) => ({ key: r.id, position: plotSign(r, (x, z) => land.heightAt(x, z)).position, title: r.name, text: `${r.name}: ${r.status === 'building' ? 'Roman says he is building it' : 'waiting for Roman'}. ${r.purpose}`, open: () => void panelStore.open({ kind: 'plot', request: r }, world) })),
      signs: world.places.map((p) => ({ key: p.id, position: signSpot(p, baseOf(p)).position, title: p.name, text: signHoverText(p), open: () => void panelStore.open({ kind: 'sign', place: p }, world) })),
    }
  }, [world, land, interiors, plots])

  // `?debug` lets a browser test find the staked plots too.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return
    Object.assign(window, { __forklingPlots: () => plots.map((r) => ({ id: r.id, name: r.name, status: r.status, chunk: r.chunk, x: plotSign(r, 0).position[0], z: plotSign(r, 0).position[2] })) })
  }, [plots])

  // `?debug` lets a browser test find places to look at.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return
    Object.assign(window, {
      __forklingPlaces: () =>
        world.places.map((p) => {
          const [x, z] = placeCentre(toLandPlace(p))
          return { id: p.id, name: p.name, x, z, level: neglectFor({ id: p.id, lastCareAt: p.state.lastCareAt, founded: p.founded, closed: p.state.closed !== null }, nowMs), exhibits: p.exhibits.length }
        }),
    })
  }, [world, nowMs])

  return (
    <>
      {targets.exhibits.map((t) => (
        <mesh key={t.key} position={t.position} rotation={[0, t.rotY, 0]} onClick={opens(t.open)} onPointerOver={() => hoverStore.set({ title: t.title, text: t.text })} onPointerOut={() => hoverStore.set(null)}>
          <boxGeometry args={[0.7, 0.55, 0.45]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {targets.plots.map((t) => (
        <mesh key={t.key} position={[t.position[0], t.position[1] + 1.2, t.position[2]]} onClick={opens(t.open)} onPointerOver={() => hoverStore.set({ title: t.title, text: t.text })} onPointerOut={() => hoverStore.set(null)}>
          <boxGeometry args={[2.6, 2.4, 0.8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {targets.signs.map((t) => (
        <mesh key={t.key} position={[t.position[0], t.position[1] + 1.15, t.position[2]]} onClick={opens(t.open)} onPointerOver={() => hoverStore.set({ title: t.title, text: t.text })} onPointerOut={() => hoverStore.set(null)}>
          <boxGeometry args={[SIGN_W, 2.3, 0.7]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      <Signs boards={boards} missingTexture={qaRegistry.plant?.missingTexture.includes('signs') ?? false} />
      <TitleBars places={world.places} baseOf={baseOfPlace} />
      <WorkScreens faces={faces} urlOf={urlOf} />
      <GalleryWalls walls={gallery} clock={clock} urlOf={urlOf} open={openWork} />
      <ExhibitCards faces={cards} />
      <Shapes shape="box" data={scene.box} />
      <Shapes shape="sphere" data={scene.sphere} />
      <Shapes shape="cylinder" data={scene.cylinder} />
      <Shapes shape="cone" data={scene.cone} />
      <Shapes shape="box" data={scene.glassBox} glass />
      <LampLights lamps={scene.lamps} />
      {Object.entries(scene.models).map(([file, matrices]) => (loaded[file] ? <ModelShapes key={file} model={loaded[file]} matrices={matrices} /> : null))}
      <RigidBody type="fixed" colliders={false}>
        {/* Under ?qa=1 a fixture may plant a wall that stops the visitor but is not drawn (audit QW.7); none in normal mode. */}
        {(qaRegistry.plant?.invisibleWall ?? []).map((w, i) => (
          <CuboidCollider key={`qa-${i}`} args={[w.w / 2, 3, w.d / 2]} position={[w.x, land.heightAt(w.x, w.z) + 3, w.z]} />
        ))}
        {walls.map((w, i) => (
          <CuboidCollider key={i} args={w.half} position={w.position} />
        ))}
      </RigidBody>
    </>
  )
}
