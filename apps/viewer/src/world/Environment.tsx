import { sunDirection } from '@forkling/sim'
import { Sky } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorld } from './WorldContext.tsx'

const DAY = new THREE.Color('#bcd7e6')
const DUSK = new THREE.Color('#e9a77c')
const NIGHT = new THREE.Color('#1a2c52')
const SUN_LOW = new THREE.Color('#ffb27a')
const SUN_HIGH = new THREE.Color('#fff3dc')
const SKY_DAY = new THREE.Color('#dff1ff')
const SKY_NIGHT = new THREE.Color('#6479b8')
const GROUND_DAY = new THREE.Color('#6b8f4e')
const GROUND_NIGHT = new THREE.Color('#2c4234')

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Sky, fog and lights driven by the time of day: the sun crosses the sky, and nights are dim and moonlit. */
export function Environment() {
  const { scene } = useThree()
  const { clock } = useWorld()
  const sky = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const moon = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const fog = useMemo(() => new THREE.Fog(DAY, 40, 160), [])
  const background = useMemo(() => new THREE.Color(DAY), [])

  useLayoutEffect(() => {
    scene.fog = fog
    scene.background = background
    return () => {
      scene.fog = null
      scene.background = null
    }
  }, [scene, fog, background])

  useFrame(() => {
    const dir = sunDirection(clock.hour())
    const elevation = dir[1]
    const day = smoothstep(0.02, 0.3, elevation)

    // Horizon colour: night, then a warm dusk, then day.
    background.copy(NIGHT).lerp(DUSK, smoothstep(-0.12, 0.04, elevation)).lerp(DAY, smoothstep(0.04, 0.4, elevation))
    fog.color.copy(background)

    if (sky.current) {
      sky.current.visible = elevation > -0.03
      sky.current.material.uniforms.sunPosition!.value.set(dir[0], dir[1], dir[2])
    }
    if (sun.current) {
      sun.current.position.set(dir[0] * 80, Math.max(dir[1], 0.05) * 80, dir[2] * 80)
      sun.current.intensity = 2.2 * day
      sun.current.color.copy(SUN_LOW).lerp(SUN_HIGH, smoothstep(0.05, 0.5, elevation))
    }
    if (moon.current) moon.current.intensity = 1.1 * (1 - day)
    if (hemi.current) {
      hemi.current.intensity = 0.95 + 0.25 * day
      hemi.current.color.copy(SKY_NIGHT).lerp(SKY_DAY, day)
      hemi.current.groundColor.copy(GROUND_NIGHT).lerp(GROUND_DAY, day)
    }
  })

  return (
    <>
      <Sky ref={sky as never} turbidity={4} rayleigh={1.2} mieCoefficient={0.004} />
      <hemisphereLight ref={hemi} args={['#dff1ff', '#6b8f4e', 1.1]} />
      <directionalLight
        ref={sun}
        intensity={2.2}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      <directionalLight ref={moon} position={[-30, 50, -20]} intensity={0} color="#9db4ff" />
    </>
  )
}
