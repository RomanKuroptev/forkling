import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { MIST_FADE_FAR, MIST_FADE_NEAR, mistColor, mistPuffs } from './mistGeometry.ts'
import { useWorld } from './WorldContext.tsx'
import { worldLand } from './worldLand.ts'

/** A soft cloud: a few blurred blobs on top of each other, so no two puffs look like a disc, and nothing has an edge. */
function cloudTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')!
  // Fixed blobs (x, y, radius, strength) as shares of the canvas; nothing is random.
  for (const [x, y, r, a] of [[0.5, 0.5, 0.42, 0.55], [0.36, 0.55, 0.3, 0.45], [0.64, 0.46, 0.3, 0.45], [0.5, 0.36, 0.26, 0.35], [0.46, 0.68, 0.24, 0.3]] as const) {
    const fill = g.createRadialGradient(x * size, y * size, 0, x * size, y * size, r * size)
    fill.addColorStop(0, `rgba(255,255,255,${a})`)
    fill.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = fill
    g.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec2 aShape;
  uniform float uNear;
  uniform float uFar;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    vUv = uv;
    vec4 view = modelViewMatrix * vec4(aOffset, 1.0);
    // Gone at the camera and whole by uFar (the same smoothstep as mistFade), so a puff close by never fills the screen.
    vAlpha = aShape.y * smoothstep(uNear, uFar, length(view.xyz));
    // Always faces the camera: the corner is moved in the view's own plane.
    view.xy += position.xy * aShape.x;
    gl_Position = projectionMatrix * view;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, vUv).a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * The world ends in mist (spec 4.1): soft, overlapping puffs along every side of the land that faces unowned ground, one draw call
 * (`mistPuffs` places them, deterministically). They are not the sky's colour, so the bank shows at night as well as by day
 * (`mistColor`), and a puff close to the camera fades away instead of covering the view.
 */
export function Fog() {
  const { world } = useWorld()
  const { scene } = useThree()
  const { geometry, material } = useMemo(() => {
    const puffs = mistPuffs(worldLand(world))
    const quad = new THREE.PlaneGeometry(1, 1)
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.index = quad.index
    geometry.setAttribute('position', quad.getAttribute('position'))
    geometry.setAttribute('uv', quad.getAttribute('uv'))
    geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(puffs.flatMap((p) => [p.x, p.y, p.z])), 3))
    geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(new Float32Array(puffs.flatMap((p) => [p.size, p.alpha])), 2))
    geometry.instanceCount = puffs.length
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: cloudTexture() }, uColor: { value: new THREE.Color('#d7e6f0') }, uNear: { value: MIST_FADE_NEAR }, uFar: { value: MIST_FADE_FAR } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    })
    return { geometry, material }
  }, [world])

  useEffect(
    () => () => {
      geometry.dispose()
      ;(material.uniforms.uMap!.value as THREE.Texture).dispose()
      material.dispose()
    },
    [geometry, material],
  )
  // The mist follows the sky: its colour comes from the fog colour the environment sets for this hour.
  useFrame(() => {
    if (scene.fog) material.uniforms.uColor!.value.set(mistColor(`#${scene.fog.color.getHexString()}`))
  })

  return <mesh geometry={geometry} material={material} renderOrder={2} frustumCulled={false} raycast={() => null} />
}
