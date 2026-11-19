import { ALLOWLIST } from '@forkling/mind/src/web/allowlist.ts'
import type { Check } from '../run/check.ts'
import { checkListMatchesEngine, checkPromisedMissing, readSourceList } from './list.ts'
import { checkSnapshotFormat, snapshotDir } from './snapshot.ts'

// On every pull request: what was promised against what the engine reads (QS.1), and the committed web snapshot's
// format (QS.4; its age is checked in the live run, so a PR never turns red only because time passed).
export const sourceListChecks: Check[] = [
  {
    id: 'sources.list-matches-engine',
    area: 'coverage',
    title: 'qa/sources.json matches the allowlist',
    run: async () => checkListMatchesEngine(readSourceList(), ALLOWLIST.map((r) => r.host)),
  },
  { id: 'sources.promised-missing', area: 'coverage', title: 'Every promised source is on the list', run: async () => checkPromisedMissing(readSourceList()) },
  {
    id: 'sources.web-snapshot-format',
    area: 'coverage',
    title: 'The committed web snapshot is well formed and on the allowlist',
    run: async () => checkSnapshotFormat(snapshotDir(), readSourceList()),
  },
]
