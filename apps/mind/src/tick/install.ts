import type { WorkMeta } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { planInstalls } from '../builds/install.ts'
import { readWorks } from '../builds/works.ts'
import type { Tick } from './context.ts'

/**
 * Keeps the works on the screens of the places that have screens (the Workshop): the newest shelved works, whatever this tick made,
 * put away or brought back. No model call. A place changes only when a screen does, so a quiet tick writes nothing.
 */
export function installStep(t: Tick): void {
  if (!t.places.some((p) => p.rooms.length > 0)) return
  const byId = new Map<string, WorkMeta>(readWorks(t.dir).map((w) => [w.id, w]))
  for (const u of t.workUpdates) byId.set(u.id, u)
  for (const n of t.newWorks) byId.set(n.meta.id, n.meta)
  for (const place of t.places) {
    const plan = planInstalls(place, [...byId.values()], kit, t.nowIso)
    if (plan.place) {
      t.places = t.places.map((p) => (p.id === place.id ? plan.place! : p))
      t.placeUpdates = [...t.placeUpdates.filter((p) => p.id !== place.id), plan.place]
      t.parts.push(`installed works in ${place.name}`)
    }
    for (const update of plan.workUpdates) {
      byId.set(update.id, update)
      const fresh = t.newWorks.find((n) => n.meta.id === update.id)
      if (fresh) fresh.meta = update
      else t.workUpdates = [...t.workUpdates.filter((w) => w.id !== update.id), update]
    }
  }
}
