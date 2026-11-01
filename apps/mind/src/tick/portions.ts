import { eatsFrom, matchesTarget, portionsLeft } from '@forkling/sim'
import type { Tick } from './context.ts'
import { spotsFor } from './create.ts'

/**
 * Food that comes in portions, such as the bowl. Each time the replayed body ate from it, a portion goes; when the
 * forkling wakes it is filled again. The mind counts, because the body cannot change the world, and writes the count
 * with the body, so the same stretch is never counted twice. Verbs that eat are the ones whose target is food.
 */
export function portionsStep(t: Tick): void {
  const portioned = t.objects.filter((o) => portionsLeft(o) !== null).sort((a, b) => a.id.localeCompare(b.id))
  if (portioned.length === 0) return
  const woke = !t.asleep && t.forkling.asleep
  const eating = t.pack.actions.filter((a) => eatsFrom(a) && (a.effect ?? 'none') === 'none')
  let meals = woke ? 0 : eating.reduce((sum, a) => sum + (t.begun[a.id] ?? 0), 0)

  let changed = false
  t.objects = t.objects.map((o) => {
    const left = portionsLeft(o)
    if (left === null || !portioned.includes(o)) return o
    const fits = eating.some((a) => a.target.type === 'object' && matchesTarget(a.target, a.id, o))
    const take = fits ? Math.min(meals, left) : 0
    meals -= take
    const next = woke ? o.properties.portions! : left - take
    if (next === left && o.state.portionsLeft === undefined) return o
    if (next === (o.state.portionsLeft ?? o.properties.portions)) return o
    changed = true
    t.touched.add(o.id)
    return { ...o, state: { ...o.state, portionsLeft: next } }
  })
  if (changed) t.spotKeys = spotsFor(t, t.objects)
}
