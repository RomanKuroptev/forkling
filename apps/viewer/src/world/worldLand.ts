import { createLand, openPlaceRequests, toLandPlace } from '@forkling/sim'
import type { PlaceRequest } from '@forkling/schema'
import type { LoadedWorld } from './loadWorld.ts'

/** The chunks open place requests have staked (spec 10.3): plots a visitor can see and stand on. */
export const stakedChunks = (requests: readonly PlaceRequest[]) => openPlaceRequests(requests).map((r) => r.chunk)

/** The land of a loaded world: its places and the plots staked by open requests. The one place the viewer builds it, so they always agree. */
export const worldLand = (world: Pick<LoadedWorld, 'forkling' | 'places' | 'requests'>) => createLand(world.forkling.seed, world.places.map(toLandPlace), stakedChunks(world.requests))
