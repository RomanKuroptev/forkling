import { PROP_MODELS } from './propModels.ts'

/** Models a world's objects may use, like `nature/rock_largeA`: the CC0 assets this viewer ships. */
export const ASSETS: ReadonlySet<string> = new Set(
  Object.values(PROP_MODELS)
    .flat()
    .map((s) => `nature/${s.file.replace(/\.glb$/, '')}`),
)

export const assetUrl = (asset: string) => `${import.meta.env.BASE_URL}models/${asset}.glb`

/** Height in meters the asset is drawn at, at scale 1. */
export function assetHeight(asset: string): number {
  const file = `${asset.split('/')[1]}.glb`
  return Object.values(PROP_MODELS).flat().find((s) => s.file === file)?.height ?? 1
}
