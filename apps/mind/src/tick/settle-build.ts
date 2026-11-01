import { settleOpenBuild } from '../builds.ts'
import type { Tick } from './context.ts'

/** A build it asked for earlier: closed when its object is in the world (that is the answer; nobody asks GitHub), or given up on. */
export function settleBuild(t: Tick): void {
  const { mind, w, nowMs, nowIso } = t
  const settled = settleOpenBuild(mind, new Set(mind.openBuild?.kind === 'code' ? w.art.map((a) => a.id) : w.objects.map((o) => o.id)), nowMs)
  if (settled.outcome === 'arrived' || settled.outcome === 'expired') {
    const { id, kind: builtKind } = mind.openBuild!
    mind.openBuild = null
    const what = builtKind === 'code' ? 'project' : 'object'
    const name = (builtKind === 'code' ? w.art.find((a) => a.id === id)?.title : w.objects.find((o) => o.id === id)?.name) ?? id
    const text = settled.outcome === 'arrived' ? `The ${what} I asked for has arrived: ${name}.` : `The ${what} I asked for (${id}) never came.`
    t.remember.push({ at: nowIso, kind: settled.outcome === 'arrived' ? 'made' : 'event', text, objectId: id })
    t.justNow.push(text)
  }
}
