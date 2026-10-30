import { Component, useEffect, useState, type ReactNode } from 'react'
import { App } from './App.tsx'
import { speciesPacks } from './species/registry.ts'
import { ASSETS } from './world/assets.ts'
import { loadWorld, type LoadedWorld, type LoadResult, type WorldError } from './world/loadWorld.ts'
import { parseRoute, type WorldRef } from './world/route.ts'
import { WorldErrorPanel } from './world/WorldErrorPanel.tsx'
import { WorldProvider } from './world/WorldContext.tsx'

/** Where the bare viewer address takes you. */
const DEFAULT_WORLD = 'RomanKuroptev/merge'

type State =
  | { status: 'loading' }
  | { status: 'error'; error: WorldError; ref?: WorldRef }
  | { status: 'ready'; world: LoadedWorld }

/** One request per world per page, even when StrictMode mounts twice. */
const loads = new Map<string, Promise<LoadResult>>()

function load(ref: WorldRef): Promise<LoadResult> {
  const key = `${ref.owner}/${ref.repo}@${ref.ref ?? ''}`
  let pending = loads.get(key)
  if (!pending) {
    pending = loadWorld(ref, { fetch: (input, init) => fetch(input, init), species: speciesPacks, assets: ASSETS })
    loads.set(key, pending)
  }
  return pending
}

/** Picks the world from the address, loads it from GitHub, and shows it or explains why it can't. */
export function Root() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    let route = parseRoute(location.pathname, base, location.search)
    if (route.kind === 'home') {
      history.replaceState(null, '', `${base}${DEFAULT_WORLD}${location.search}`)
      route = parseRoute(location.pathname, base, location.search)
    }
    if (route.kind !== 'world') {
      const reason = route.kind === 'invalid' ? route.reason : ''
      setState({ status: 'error', error: { kind: 'not-found', title: 'No world here', message: reason, problems: [] } })
      return
    }
    const ref = route.ref
    let cancelled = false
    load(ref)
      .then((result) => {
        if (cancelled) return
        setState(result.ok ? { status: 'ready', world: result.world } : { status: 'error', error: result.error, ref })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          ref,
          error: { kind: 'network', title: 'Something went wrong', message: String(e), problems: [] },
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') return <div className="loading">Finding the world…</div>
  if (state.status === 'error') return <WorldErrorPanel error={state.error} worldRef={state.ref} />
  return (
    <WorldProvider world={state.world}>
      <RenderGuard worldRef={state.world.ref}>
        <App />
      </RenderGuard>
    </WorldProvider>
  )
}

/** If drawing the world throws, say so instead of leaving a blank page. */
class RenderGuard extends Component<{ worldRef: WorldRef; children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <WorldErrorPanel
        worldRef={this.props.worldRef}
        error={{ kind: 'invalid', title: 'Something broke while drawing this world', message: this.state.error.message, problems: [] }}
      />
    )
  }
}
