import { Bloom, EffectComposer, Scanline } from '@react-three/postprocessing'
import { touchUi } from '../touch.ts'

/** Glow and a light scanline. Gentle: stronger and the sun becomes a white blob and text on signs is lost (look.md). */
export const EFFECTS = {
  bloom: { intensity: 0.45, threshold: 0.9 },
  /** On touch devices the bloom is lighter and there are no scanlines. */
  bloomTouch: { intensity: 0.3, threshold: 0.9 },
  scanlineOpacity: 0.035,
} as const

/** `?fx=0` switches the glow and the scanlines off, for a slow machine or to compare. */
export const effectsOn = (search: string): boolean => new URLSearchParams(search).get('fx') !== '0'

export function Effects() {
  if (!effectsOn(location.search)) return null
  const bloom = touchUi ? EFFECTS.bloomTouch : EFFECTS.bloom
  if (touchUi) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom intensity={bloom.intensity} luminanceThreshold={bloom.threshold} luminanceSmoothing={0.2} mipmapBlur />
      </EffectComposer>
    )
  }
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={bloom.intensity} luminanceThreshold={bloom.threshold} luminanceSmoothing={0.2} mipmapBlur />
      <Scanline density={1.6} opacity={EFFECTS.scanlineOpacity} />
    </EffectComposer>
  )
}
