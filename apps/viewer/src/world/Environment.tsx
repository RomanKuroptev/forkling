import { Sky } from '@react-three/drei'

const SUN: [number, number, number] = [40, 60, 25]
const FOG_COLOR = '#bcd7e6'

export function Environment() {
  return (
    <>
      <Sky sunPosition={SUN} turbidity={4} rayleigh={1.2} mieCoefficient={0.004} />
      <fog attach="fog" args={[FOG_COLOR, 40, 160]} />
      <hemisphereLight args={['#dff1ff', '#6b8f4e', 1.1]} />
      <directionalLight
        position={SUN}
        intensity={2.2}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
    </>
  )
}
