import type { Kit, Place, WorkMeta } from '@forkling/schema'
import { clampText } from '../decision.ts'

/** The slots (`room/part/slot`) of a place's screens, in the order the parts are placed. A screen holds one work. */
export function screenSlots(place: Place, kit: Kit): string[] {
  const out: string[] = []
  for (const room of place.rooms) {
    room.parts.forEach((placed, p) => {
      kit.parts.find((k) => k.id === placed.part)?.slots.forEach((slot, s) => {
        if (slot.kind === 'screen') out.push(`${room.id}/${p}/${s}`)
      })
    })
  }
  return out
}

export interface InstallPlan {
  /** The place with its screens changed, or null when nothing needs to change. */
  place: Place | null
  /** Works whose `installedIn` changed. */
  workUpdates: WorkMeta[]
}

const refOf = (id: string) => `works/${id}`
const where = (place: Place, slot: string) => `${place.id}/${slot}`

/**
 * Which works are on a place's screens (W5). Code does this, no model: the newest shelved works are on the screens, so a new work
 * takes a free screen or replaces the oldest one on show (sketches are made often, so they are usually what rotates off), and an
 * older work stays off, still in the terminal's gallery. A work that is put away or scrapped leaves its screen.
 * It is not care: the care time and neglect are left alone. The gallery terminal is never touched.
 */
export function planInstalls(place: Place, works: readonly WorkMeta[], kit: Kit, nowIso: string): InstallPlan {
  const slots = screenSlots(place, kit)
  if (slots.length === 0) return { place: null, workUpdates: [] }
  const byId = new Map(works.map((w) => [w.id, w]))
  const updates = new Map<string, WorkMeta>()
  const setInstalled = (w: WorkMeta, installedIn: string | null) => {
    const now = updates.get(w.id) ?? w
    if (now.installedIn !== installedIn) updates.set(w.id, { ...now, installedIn })
  }
  const slotSet = new Set(slots)
  let exhibits = place.exhibits.map((e) => ({ ...e }))
  const names: { put: string[]; off: string[] } = { put: [], off: [] }

  // Off the screens: a work that is no longer on the shelf (or is gone).
  exhibits = exhibits.filter((e) => {
    if (e.kind !== 'work' || !slotSet.has(e.slot) || !e.ref) return true
    const w = byId.get(e.ref.slice('works/'.length))
    if (w && w.status === 'shelf') return true
    if (w) {
      setInstalled(w, null)
      names.off.push(w.title)
    }
    return false
  })
  const onScreen = () => exhibits.filter((e) => e.kind === 'work' && slotSet.has(e.slot) && e.ref)
  const workOf = (e: { ref: string | null }) => byId.get(e.ref!.slice('works/'.length))!
  for (const e of onScreen()) setInstalled(workOf(e), where(place, e.slot))
  // A shelved work that says it is on a screen but is not on one.
  const installedIds = () => new Set(onScreen().map((e) => workOf(e).id))
  for (const w of works) if (w.status === 'shelf' && w.installedIn !== null && !installedIds().has(w.id)) setInstalled(w, null)

  // The screens hold the newest shelved works, a pure function of the shelf, so a quiet tick changes nothing and nothing churns.
  const shelf = works.filter((w) => w.status === 'shelf').sort((a, b) => b.made.localeCompare(a.made))
  const target = new Set(shelf.slice(0, slots.length).map((w) => w.id))
  exhibits = exhibits.filter((e) => {
    if (e.kind !== 'work' || !slotSet.has(e.slot) || !e.ref) return true
    const w = workOf(e)
    if (target.has(w.id)) return true
    setInstalled(w, null)
    names.off.push(w.title)
    return false
  })
  const usedIds = new Set(exhibits.map((e) => e.id))
  for (const w of shelf.slice(0, slots.length)) {
    if (installedIds().has(w.id)) continue
    const taken = new Set(exhibits.map((e) => e.slot))
    const slot = slots.find((s) => !taken.has(s))
    if (!slot) break
    let id = `screen-${w.id}`.slice(0, 60)
    for (let n = 2; usedIds.has(id); n++) id = `${`screen-${w.id}`.slice(0, 56)}-${n}`
    usedIds.add(id)
    exhibits.push({ id, kind: 'work', ref: refOf(w.id), slot, label: clampText(`${w.title}: ${w.about}`, 120), added: nowIso.slice(0, 10) })
    setInstalled(w, where(place, slot))
    names.put.push(w.title)
  }

  const workUpdates = [...updates.values()].filter((u) => u.installedIn !== byId.get(u.id)!.installedIn)
  const same = JSON.stringify(exhibits) === JSON.stringify(place.exhibits)
  if (same && workUpdates.length === 0) return { place: null, workUpdates: [] }
  if (same) return { place: null, workUpdates }
  const summary = clampText(
    [names.put.length > 0 ? `Put ${names.put.join(', ')} on ${names.put.length === 1 ? 'a screen' : 'screens'}.` : '', names.off.length > 0 ? `Took ${names.off.join(', ')} off.` : ''].filter(Boolean).join(' ') || 'Rearranged the screens.',
    140,
  )
  return { place: { ...place, exhibits, history: [...place.history, { at: nowIso, verb: 'install', summary }] }, workUpdates }
}
