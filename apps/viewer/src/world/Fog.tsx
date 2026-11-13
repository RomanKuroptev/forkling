import { createLand, toLandPlace } from '@forkling/sim'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fogWalls } from './landGeometry.ts'
import { useWorld } from './WorldContext.tsx'

const HEIGHT = 34
/** How far below the ground the wall starts, so it never shows a gap at the foot. */
const SINK = 3

/** Opaque at the foot and clear at the top, as a texture the material reads as its alpha. */
function gradient(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 64
  const g = canvas.getContext('2d')!
  const fill = g.createLinearGradient(0, 0, 0, 64)
  fill.addColorStop(0, '#000000')
  fill.addColorStop(0.55, '#7f7f7f')
  fill.addColorStop(1, '#ffffff')
  g.fillStyle = fill
  g.fillRect(0, 0, 4, 64)
  return new THREE.CanvasTexture(canvas)
}

/**
 * The world ends in fog (spec 4.1): a bank of mist on every side of the land that faces unowned ground, in the colour of the
 * scene's fog, so the edge of the world is a soft wall and never a cliff.
 */
export function Fog() {
  const { world } = useWorld()
  const { scene } = useThree()
  const { geometry, material } = useMemo(() => {
    const land = createLand(world.forkling.seed, world.places.map(toLandPlace))
    const planes = fogWalls(land).map((wall) => {
      const g = new THREE.PlaneGeometry(wall.length, HEIGHT)
      g.rotateY(wall.rotY)
      g.translate(wall.x, land.heightAt(wall.x, wall.z) - SINK + HEIGHT / 2, wall.z)
      return g
    })
    const geometry = planes.length > 0 ? mergeGeometries(planes) : new THREE.BufferGeometry()
    for (const g of planes) g.dispose()
    const material = new THREE.MeshBasicMaterial({ color: '#bcd7e6', alphaMap: gradient(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })
    return { geometry, material }
  }, [world])

  useEffect(
    () => () => {
      geometry.dispose()
      material.alphaMap?.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  // The same colour as the sky's horizon at this hour, which the environment sets on the scene's fog.
  useFrame(() => {
    if (scene.fog) material.color.copy(scene.fog.color)
  })

  return <mesh geometry={geometry} material={material} renderOrder={2} />
}
