import { sunDirection } from '@forkling/sim'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { touchUi } from '../touch.ts'
import { GRID, LIGHT, MIST, SKY } from './theme.ts'
import { useWorld } from './WorldContext.tsx'

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

const color = (hex: string) => new THREE.Color(hex)
const four = (s: { horizon: string; pink: string; purple: string; top: string }) => [color(s.horizon), color(s.pink), color(s.purple), color(s.top)]

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`
// Sky stops by the sine of the angle above the horizon (look.md, "What the test on the real world showed", rule 6).
const skyFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform float uNight;
  uniform vec3 uDay[4];
  uniform vec3 uNightColors[4];
  uniform vec3 uBelow;
  uniform vec3 uSunLow;
  uniform vec3 uSunHigh;
  uniform vec3 uStops;
  uniform vec2 uSunShape;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c0 = mix(uDay[0], uNightColors[0], uNight);
    vec3 c1 = mix(uDay[1], uNightColors[1], uNight);
    vec3 c2 = mix(uDay[2], uNightColors[2], uNight);
    vec3 c3 = mix(uDay[3], uNightColors[3], uNight);
    vec3 c = mix(c0, c1, smoothstep(0.0, uStops.x, h));
    c = mix(c, c2, smoothstep(uStops.x, uStops.y, h));
    c = mix(c, c3, smoothstep(uStops.y, uStops.z, h));
    c = mix(uBelow, c, smoothstep(-0.02, 0.0, h));
    // Stars at night.
    vec2 g = floor(d.xz / max(0.15, d.y + 0.3) * 220.0);
    float star = step(0.996, hash(g)) * smoothstep(0.05, 0.3, h) * uNight;
    c += vec3(star);
    // The striped sun: always big and low, on the side the real sun is, gone at night.
    vec3 s = normalize(vec3(uSun.x, 0.0, uSun.z));
    s = normalize(vec3(s.x, uSunShape.y, s.z));
    float ang = acos(clamp(dot(d, s), -1.0, 1.0));
    float R = uSunShape.x;
    float disc = 1.0 - smoothstep(R - 0.004, R, ang);
    float y = (d.y - s.y) / R;
    // Solid above the middle, then stripes that get thicker towards the bottom.
    float band = clamp(0.1 - y, 0.0, 1.5);
    float gap = 0.26 + 0.5 * clamp(band / 0.64, 0.0, 1.0);
    float stripe = y > 0.1 ? 1.0 : step(gap, fract(band * 7.0));
    vec3 sunCol = mix(uSunLow, uSunHigh, smoothstep(-0.5, 0.6, y));
    float show = disc * stripe * step(0.0, h) * (1.0 - uNight);
    c = mix(c, sunCol, show);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`
const gridVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`
const gridFragment = /* glsl */ `
  uniform vec3 uGround;
  uniform vec3 uLine;
  uniform float uSpacing;
  uniform vec2 uFade;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz / uSpacing;
    vec2 w = fwidth(p);
    vec2 a = abs(fract(p - 0.5) - 0.5) / max(w, vec2(0.0001));
    float line = 1.0 - min(min(a.x, a.y), 1.0);
    float fade = 1.0 - smoothstep(uFade.x, uFade.y, length(vWorld.xz - cameraPosition.xz));
    gl_FragColor = vec4(mix(uGround, uLine * 1.3, line * fade), 1.0);
    #include <colorspace_fragment>
  }
`

/** Sky, grid, fog and lights in the Merge 95 look, driven by the time of day. The sun always stands low and big on its side. */
export function Environment() {
  const { scene } = useThree()
  const { clock } = useWorld()
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const fogDay = useMemo(() => color(MIST.fogDay), [])
  const fogNight = useMemo(() => color(MIST.fogNight), [])
  const fog = useMemo(() => new THREE.Fog(MIST.fogDay, 60, 260), [])
  const tmp = useMemo(() => new THREE.Color(), [])
  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uSun: { value: new THREE.Vector3(0, 0.2, -1) },
          uNight: { value: 0 },
          uDay: { value: four(SKY.day) },
          uNightColors: { value: four(SKY.night) },
          uBelow: { value: color(SKY.below) },
          uSunLow: { value: color(SKY.sunLow) },
          uSunHigh: { value: color(SKY.sunHigh) },
          uStops: { value: new THREE.Vector3(SKY.stops.pink, SKY.stops.purple, SKY.stops.top) },
          uSunShape: { value: new THREE.Vector2(SKY.sunSize, SKY.sunHeight) },
        },
      }),
    [],
  )
  const grid = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: gridVertex,
        fragmentShader: gridFragment,
        fog: false,
        uniforms: {
          uGround: { value: color(GRID.ground) },
          uLine: { value: color(GRID.line) },
          uSpacing: { value: GRID.farSpacing },
          uFade: { value: new THREE.Vector2(...GRID.farFade) },
        },
      }),
    [],
  )
  const colors = useMemo(
    () => ({ hemiDay: color(LIGHT.hemiSkyDay), hemiNight: color(LIGHT.hemiSkyNight), sunDay: color(LIGHT.sunDay), sunNight: color(LIGHT.sunNight) }),
    [],
  )

  useLayoutEffect(() => {
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, fog])

  useFrame(() => {
    const dir = sunDirection(clock.hour())
    const night = 1 - smoothstep(0.02, 0.3, dir[1])
    sky.uniforms.uSun!.value.set(dir[0], dir[1], dir[2])
    sky.uniforms.uNight!.value = night
    fog.color.copy(fogDay).lerp(fogNight, night)
    if (sun.current) {
      sun.current.position.set(dir[0] * 80, Math.max(dir[1], 0.25) * 80, dir[2] * 80)
      sun.current.intensity = 2.2 * (1 - night) + 0.4 * night
      sun.current.color.copy(colors.sunDay).lerp(colors.sunNight, night)
    }
    if (rim.current) rim.current.intensity = 0.9 * (1 - night) + 0.5 * night
    if (hemi.current) {
      hemi.current.intensity = LIGHT.hemiDayIntensity - 1.6 * night
      hemi.current.color.copy(tmp.copy(colors.hemiDay).lerp(colors.hemiNight, night))
    }
  })

  return (
    <>
      <mesh material={sky} frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <mesh material={grid} rotation={[-Math.PI / 2, 0, 0]} position={[0, -7, 0]}>
        <planeGeometry args={[4000, 4000]} />
      </mesh>
      <hemisphereLight ref={hemi} args={[LIGHT.hemiSkyDay, LIGHT.hemiGround, LIGHT.hemiDayIntensity]} />
      <directionalLight
        ref={sun}
        intensity={2}
        castShadow
        shadow-mapSize={touchUi ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      <directionalLight ref={rim} position={[40, 20, -30]} intensity={0.9} color={LIGHT.rim} />
    </>
  )
}
