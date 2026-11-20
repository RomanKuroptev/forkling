import { placeHolding, placesRev } from '@forkling/sim'
import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { App } from './App.tsx'
import { Boot } from './ui/Boot.tsx'
import { speciesPacks } from './species/registry.ts'
import { fixtureNotes } from './world/fixtureNotes.ts'
import { mindUrlFrom, startLiveSync } from './world/liveSync.ts'
import { startNotesSync } from './world/notesClient.ts'
import { notesStore } from './world/notesStore.ts'
import { createWorldClock } from './clock.ts'
import { loadFixtureWorld } from './world/fixtureWorld.ts'
import templateForkling from '../../../templates/forkling-world/forkling.json'
import { loadWorld, placesOrStarter, type LoadedWorld, type LoadResult, type WorldError } from './world/loadWorld.ts'
import { LOCAL_REF, localFetch } from './world/localWorld.ts'
import { fixedRoute, parseRoute, siteWorldExists, worldSiteRedirect, type WorldRef } from './world/route.ts'
import { WorldErrorPanel } from './world/WorldErrorPanel.tsx'
import { WorldProvider } from './world/WorldContext.tsx'
import { visitor } from './visitor.ts'
import { qaMode } from './qa/params.ts'
import { plantFrom } from './qa/plant.ts'
import { qaRegistry } from './qa/registry.ts'

/** Where the bare viewer address takes you. */
const DEFAULT_WORLD = 'RomanKuroptev/merge'

type State =
  | { status: 'loading' }
  | { status: 'error'; error: WorldError; ref?: WorldRef }
  | { status: 'ready'; world: LoadedWorld }

/** One request per world per page, even when StrictMode mounts twice. */
const loads = new Map<string, Promise<LoadResult>>()

function load(ref: WorldRef, local: boolean): Promise<LoadResult> {
  const key = `${ref.owner}/${ref.repo}@${ref.ref ?? ''}`
  let pending = loads.get(key)
  if (!pending) {
    const real: typeof fetch = (input, init) => fetch(input, init)
    // `?world=local` reads the world from files served next to the viewer, not from GitHub.
    pending = loadWorld(ref, { fetch: local ? localFetch(`${location.origin}${import.meta.env.BASE_URL}`, real) : real, species: speciesPacks })
    // The audit harness (`?qa=1`, a local world only) reads a planted flaw from the fixture's qa.json before the world is shown.
    if (local && qaMode) {
      const world = pending
      pending = real(`${location.origin}${import.meta.env.BASE_URL}world/qa.json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((qa: { plant?: unknown } | null) => {
          qaRegistry.plant = plantFrom(qaMode, qa?.plant)
        })
        .catch(() => undefined)
        .then(() => world)
    }
    loads.set(key, pending)
  }
  return pending
}

/** Picks the world from the address, loads it from GitHub, and shows it or explains why it can't. */
export function Root() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    const query = new URLSearchParams(location.search)
    const local = query.get('world') === 'local'
    // `?world=local&fixture=10` is a made-up world of that many places, built here, for looking at the land.
    if (local && query.has('fixture')) {
      // Built at the world's moment, so `?time=` and `?at=` show the neglect and the construction of that moment, not of the real clock.
      const nowMs = createWorldClock(templateForkling.timezone, location.search).now()
      setState({ status: 'ready', world: loadFixtureWorld(Number(query.get('fixture')) || 10, speciesPacks.cat!, nowMs) })
      return
    }
    // Inside a forkling's own site (`<site>/world/`, built with VITE_WORLD) the one world is fixed; on the engine's own address a visit for Merge's world goes to Merge's site.
    const fixed = import.meta.env.VITE_WORLD as string | undefined
    let route: ReturnType<typeof parseRoute> = local ? { kind: 'world', ref: LOCAL_REF } : fixed ? fixedRoute(fixed, location.search) : parseRoute(location.pathname, base, location.search)
    let cancelled = false
    const show = () => {
      if (cancelled) return
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
      load(ref, local)
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
    }
    const to = !fixed && !local ? worldSiteRedirect(route, location.search, import.meta.env.VITE_WORLD_SITE as string | undefined) : null
    if (to) {
      // Only go if the world is really there at the other address (it is not until Merge's site has been rebuilt); otherwise show Merge's world here, as before.
      void siteWorldExists(to, (input, init) => fetch(input, init)).then((there) => {
        if (cancelled) return
        if (there) location.replace(to)
        else show()
      })
    } else {
      show()
    }
    return () => {
      cancelled = true
    }
  }, [])

  // The places stay current by polling the mind server's now.json (spec 4.6). Only a world read from a real repo does; a local
  // or fixture world has no server. Without a server address the viewer shows the committed state, as before.
  const shown = useRef<LoadedWorld | null>(null)
  shown.current = state.status === 'ready' ? state.world : null
  const live = state.status === 'ready' && state.world.ref !== LOCAL_REF && !new URLSearchParams(location.search).has('fixture')
  useEffect(() => {
    const first = shown.current
    if (!live || !first) return
    return startLiveSync({
      mindUrl: mindUrlFrom(new URLSearchParams(location.search).get('mind'), import.meta.env.VITE_MIND_URL as string | undefined),
      intervalMs: 30_000,
      fetch: (input, init) => fetch(input, init),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      knownRev: placesRev(first.places),
      onPlaces: (places) => setState((s) => (s.status === 'ready' ? { status: 'ready', world: { ...s.world, places: placesOrStarter(places) } } : s)),
      // The place the visitor stands in, for the visit count Merge is shown (issue #422). Its id only, never a position.
      here: () => {
        const p = visitor.position
        const w = shown.current
        return p && w ? (placeHolding([p.x, p.z], w.places)?.id ?? null) : null
      },
    })
  }, [live])

  // The paper notes (spec 10.1): read from the server's /notes.json when there is a server, or made up in a fixture world.
  const notesReady = state.status === 'ready'
  useEffect(() => {
    const first = shown.current
    if (!notesReady || !first) return
    if (new URLSearchParams(location.search).has('fixture')) {
      notesStore.set(fixtureNotes(first.places))
      return
    }
    return startNotesSync({
      mindUrl: mindUrlFrom(new URLSearchParams(location.search).get('mind'), import.meta.env.VITE_MIND_URL as string | undefined),
      intervalMs: 60_000,
      fetch: (input, init) => fetch(input, init),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      onNotes: (notes) => notesStore.set(notes),
    })
  }, [notesReady])

  if (new URLSearchParams(location.search).has('boot')) return <Boot progress={60} note="Loading… 60%" />
  if (state.status === 'loading') return <Boot note="Finding the world…" />
  if (state.status === 'error') return <WorldErrorPanel error={state.error} worldRef={state.ref} />
  return (
    <WorldProvider world={state.world}>
      <RenderGuard worldRef={state.world.ref}><App /></RenderGuard>
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
