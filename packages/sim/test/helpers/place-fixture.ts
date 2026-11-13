import { kit } from '@forkling/schema/kit'
import type { PlaceContext } from '../../src/validate-place.ts'

/** A small valid place: one room on one floor with a shelf, a frame and a screen, and three exhibits. */
export const base = () => ({
  id: 'house-of-lights',
  name: 'House of Lights',
  purpose: 'Where I keep everything I find about signals people sent into the dark.',
  tags: ['lighthouses', 'signals'],
  founded: '2026-11-20',
  chunk: [1, 0],
  related: ['workshop'],
  exterior: { style: 'stone', footprint: [16, 12], floors: 1, palette: 'harbour', sign: 'HOUSE OF LIGHTS' },
  rooms: [
    {
      id: 'hall',
      name: 'Hall',
      size: [10, 8, 4],
      parts: [
        { part: 'shelf-low', at: [-4, 0, 3.7], rot: 0 },
        { part: 'frame-large', at: [0, 1.6, 3.9], rot: 0 },
        { part: 'screen-small', at: [2, 0, 3], rot: 0 },
      ],
    },
  ],
  exhibits: [
    { id: 'keepers-log', kind: 'souvenir', ref: 'souvenirs/2026-11-18-keepers-log', slot: 'hall/0/0', label: "A keeper wrote 'fog, fog, fog' for nine days.", added: '2026-11-18' },
    { id: 'beacon', kind: 'souvenir', ref: 'souvenirs/2026-11-19-beacon', slot: 'hall/1/0', label: 'A beacon at night.', added: '2026-11-19' },
    { id: 'first-work', kind: 'work', ref: 'works/signal-clock', slot: 'hall/2/0', label: 'A clock made of signals.', added: '2026-11-20' },
  ],
  state: { construction: null, lastCareAt: '2026-11-21T19:40:00+01:00', neglect: 0 },
  history: [{ at: '2026-11-20T18:10:00+01:00', verb: 'found', summary: 'Built it because the codes and the lights kept pointing at each other.' }],
})
export type P = ReturnType<typeof base>

export const files: Record<string, 'quote' | 'fact' | 'image' | 'other'> = {
  'souvenirs/2026-11-18-keepers-log': 'quote',
  'souvenirs/2026-11-19-beacon': 'image',
  'souvenirs/2026-11-20-a-fact': 'fact',
  'works/signal-clock': 'other',
  'trails/2026-11-18-1': 'other',
}
export const ctx: PlaceContext = { kit, exists: (path) => path in files, souvenirKind: (path) => (files[path] === 'other' ? undefined : files[path]) }
