import { fixedImportance, type FixedEvent } from '@forkling/sim'
import type { MindState } from '@forkling/schema'
import type { NewEntry } from '../stream.ts'
import type { Tick } from './context.ts'

type Reflect = NonNullable<MindState['reflect']>

/** The importance since the last reflection, and the reflections made today (spec 9.3). Nothing before the first. */
export const reflectState = (mind: Pick<MindState, 'reflect'>): Reflect => mind.reflect ?? { sum: 0, lastAt: null, date: '', today: 0, pending: null, questions: [] }

/** Adds points to the sum a reflection waits for. */
export function addImportance(t: Pick<Tick, 'mind'>, points: number): void {
  if (points <= 0) return
  const state = reflectState(t.mind)
  t.mind.reflect = { ...state, sum: state.sum + points }
}

/** Writes a stream entry whose importance code sets (spec 9.3) and counts it. The thought tick does not score these again. */
export function rememberScored(t: Pick<Tick, 'mind' | 'remember'>, entry: NewEntry, event: FixedEvent): void {
  const importance = fixedImportance(event)
  t.remember.push({ ...entry, importance })
  addImportance(t, importance)
}
