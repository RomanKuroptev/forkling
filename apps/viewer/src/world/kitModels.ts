/**
 * The URLs of the model files in `kit/models/` (spec 5.3), built by the bundler. A file the kit names that is not here simply has
 * no URL, and the part is drawn from its primitives.
 */
const urls = import.meta.glob('../../../../kit/models/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>

export const kitModelUrl = (file: string): string | undefined => Object.entries(urls).find(([path]) => path.endsWith(`/${file}`))?.[1]
