import { kit } from '@forkling/schema/kit'
import { neglectFor, openPlaceRequests, placeCentre, toLandPlace } from '@forkling/sim'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { visitor } from '../visitor.ts'
import { SIGN_W, exhibitSpots, signSpot } from './exhibitGeometry.ts'
import { hoverStore } from './hoverStore.ts'
import { panelStore } from './panelStore.ts'
import { plotSign } from './plotGeometry.ts'
import { kitModelUrl } from './kitModels.ts'
import { restyleMaterial } from './modelStyle.ts'
import { Signs } from './Signs.tsx'
import { signBoards } from './signGeometry.ts'
import { ROUND_SEGMENTS, SPHERE_SEGMENTS, interiorsToLoad, modelFiles, sceneInstances, wallBoxes, type Shape, type ShapeInstances } from './kitGeometry.ts'
import { useWorld } from './WorldContext.tsx'
import { worldLand } from './worldLand.ts'

/** The unit shapes every part is made of; an instance scales them to its primitive's size. */
const GEOMETRIES: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, SPHERE_SEGMENTS[0], SPHERE_SEGMENTS[1]),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, ROUND_SEGMENTS),
  cone: new THREE.ConeGeometry(0.5, 1, ROUND_SEGMENTS),
}

/** One draw call for all the instances of a shape, each with its own matrix and colour. */
function Shapes({ shape, data }: { shape: Shape; data: ShapeInstances }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
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
    <instancedMesh key={data.count} ref={mesh} args={[GEOMETRIES[shape], undefined, data.count]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial flatShading roughness={0.9} />
    </instancedMesh>
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
    for (const file of modelFiles(kit)) {
      const url = kitModelUrl(file)
      if (!url) continue
      loader.loadAsync(url).then(
        (gltf) => {
          if (cancelled) return
          gltf.scene.updateMatrixWorld(true)
          const parts: LoadedModel['parts'] = []
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) parts.push({ geometry: o.geometry, material: restyleMaterial(o.material as THREE.Material), matrix: o.matrixWorld.clone() })
          })
          setLoaded((was) => ({ ...was, [file]: { parts } }))
        },
        (error) => console.warn(`kit model ${file} did not load, so its parts stay as primitives:`, error),
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

  const scene = useMemo(() => sceneInstances(world.places, kit, { heightAt: (x, z) => land.heightAt(x, z), interiors, models: loadedFiles, nowMs, plots }), [world, land, interiors, loadedFiles, nowMs, plots])
  // The board of each place's sign: its name and its sign text, painted on one texture.
  const boards = useMemo(() => signBoards(world.places, (p) => { const [x, z] = placeCentre(toLandPlace(p)); return land.heightAt(x, z) }, kit), [world, land])
  const walls = useMemo(
    () =>
      world.places.flatMap((place) => {
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
      signs: world.places.map((p) => ({ key: p.id, position: signSpot(p, baseOf(p)).position, title: p.exterior.sign || p.name, text: `${p.name}: ${p.purpose}`, open: () => void panelStore.open({ kind: 'sign', place: p }, world) })),
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
          return { id: p.id, name: p.name, x, z, level: neglectFor({ id: p.id, lastCareAt: p.state.lastCareAt, founded: p.founded }, nowMs), exhibits: p.exhibits.length }
        }),
    })
  }, [world, nowMs])

  return (
    <>
      {targets.exhibits.map((t) => (
        <mesh key={t.key} position={t.position} rotation={[0, t.rotY, 0]} onClick={t.open} onPointerOver={() => hoverStore.set({ title: t.title, text: t.text })} onPointerOut={() => hoverStore.set(null)}>
          <boxGeometry args={[0.7, 0.55, 0.45]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {targets.plots.map((t) => (
        <mesh key={t.key} position={[t.position[0], t.position[1] + 1.2, t.position[2]]} onClick={t.open} onPointerOver={() => hoverStore.set({ title: t.title, text: t.text })} onPointerOut={() => hoverStore.set(null)}>
          <boxGeometry args={[2.6, 2.4, 0.8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {targets.signs.map((t) => (
        <mesh key={t.key} position={[t.position[0], t.position[1] + 1.15, t.position[2]]} onClick={t.open} onPointerOver={() => hoverStore.set({ title: t.title, text: t.text })} onPointerOut={() => hoverStore.set(null)}>
          <boxGeometry args={[SIGN_W, 2.3, 0.7]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      <Signs boards={boards} />
      <Shapes shape="box" data={scene.box} />
      <Shapes shape="sphere" data={scene.sphere} />
      <Shapes shape="cylinder" data={scene.cylinder} />
      <Shapes shape="cone" data={scene.cone} />
      {Object.entries(scene.models).map(([file, matrices]) => (loaded[file] ? <ModelShapes key={file} model={loaded[file]} matrices={matrices} /> : null))}
      <RigidBody type="fixed" colliders={false}>
        {walls.map((w, i) => (
          <CuboidCollider key={i} args={w.half} position={w.position} />
        ))}
      </RigidBody>
    </>
  )
}
