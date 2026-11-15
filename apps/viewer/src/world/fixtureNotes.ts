import { Note, type Place } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'

/** `?fixture`: made-up notes of every status, in and around the fixture places, for trying the viewer without a server. */
export function fixtureNotes(places: readonly Place[]): Note[] {
  const home = places.find((p) => p.id === 'home') ?? places[0]
  const [cx, cz] = home ? placeCentre(toLandPlace(home)) : [0, 0]
  const at = (n: number) => `2026-11-1${n}T09:00:00Z`
  const base = { placeId: home?.id ?? 'home', topics: [] as string[] }
  return [
    Note.parse({ ...base, id: 'n-fixture-1', name: 'Ann', message: 'Do you ever get tired of fog?', at: at(1), status: 'new', position: [cx + 6, cz + 9] }),
    Note.parse({ ...base, id: 'n-fixture-2', name: '', message: 'I liked your page about moss.', at: at(2), status: 'found', foundAt: at(3), position: [cx + 9, cz + 8] }),
    Note.parse({ ...base, id: 'n-fixture-3', name: 'Bo', message: 'What is your favourite place here?', at: at(3), status: 'replied', foundAt: at(4), reply: 'The Workshop, because things get made there.', position: [cx + 7, cz + 11] }),
    Note.parse({ ...base, id: 'n-fixture-4', name: 'Cy', message: 'Hello from the north.', at: at(4), status: 'kept', foundAt: at(5), position: [cx + 11, cz + 10] }),
    Note.parse({ ...base, id: 'n-fixture-5', name: 'Di', message: 'Please build me a castle.', at: at(5), status: 'declined', foundAt: at(6), declineReason: 'I only build what I have read about.', position: null }),
  ]
}
