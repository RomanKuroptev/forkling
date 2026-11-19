import { ALLOWLIST } from '@forkling/mind/src/web/allowlist.ts'
import type { Check } from '../run/check.ts'
import { checkListMatchesEngine, checkPromisedMissing, readSourceList } from './list.ts'

// QS.1, on every pull request: what was promised against what the engine reads.
export const sourceListChecks: Check[] = [
  {
    id: 'sources.list-matches-engine',
    area: 'coverage',
    title: 'qa/sources.json matches the allowlist',
    run: async () => checkListMatchesEngine(readSourceList(), ALLOWLIST.map((r) => r.host)),
  },
  { id: 'sources.promised-missing', area: 'coverage', title: 'Every promised source is on the list', run: async () => checkPromisedMissing(readSourceList()) },
]
