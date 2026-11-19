import { Souvenir, type Place } from '@forkling/schema'
import { useEffect, useRef, useState } from 'react'
import type { LoadedWorld } from './loadWorld.ts'
import { localFilesBase, worldFiles } from './worldData.ts'

/**
 * The souvenir files the exhibits of the given places name (`<ref>.json`), read once each as those places' insides are drawn, so a
 * card can show the quote, the fact or the picture itself. A file that is missing or does not fit the schema is null: its card
 * keeps the exhibit's label. Everything read is data, painted as text or loaded as a picture, never run.
 */
export function useSouvenirs(world: Pick<LoadedWorld, 'ref' | 'sha'>, places: readonly Place[]): ReadonlyMap<string, Souvenir | null> {
  const [read, setRead] = useState<ReadonlyMap<string, Souvenir | null>>(() => new Map())
  const asked = useRef(new Set<string>())
  const worldKey = `${world.ref.owner}/${world.ref.repo}@${world.sha}`
  const lastWorld = useRef(worldKey)
  useEffect(() => {
    if (lastWorld.current !== worldKey) {
      lastWorld.current = worldKey
      asked.current = new Set()
      setRead(new Map())
    }
    const refs = [...new Set(places.flatMap((p) => p.exhibits.filter((e) => e.kind === 'souvenir' && e.ref).map((e) => e.ref!)))].filter((r) => !asked.current.has(r))
    if (refs.length === 0) return
    for (const r of refs) asked.current.add(r)
    const files = worldFiles(world, undefined, localFilesBase(world, location.origin, import.meta.env.BASE_URL))
    // A read that finishes after the world changed is dropped; a new list of places never cancels one that is on its way.
    void Promise.all(
      refs.map(async (ref) => {
        const parsed = Souvenir.safeParse(await files.json(`${ref}.json`))
        return [ref, parsed.success ? parsed.data : null] as const
      }),
    ).then((entries) => {
      if (lastWorld.current === worldKey) setRead((was) => new Map([...was, ...entries]))
    })
  }, [world, worldKey, places])
  return read
}
