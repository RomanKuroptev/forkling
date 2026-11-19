import type { Check } from './run/check.ts'
import { sourceListChecks } from './sources/checks.ts'

// The PR tier (`pnpm qa fast`): free, no network, no key. Each lane adds its checks here; every check has a
// planted test that makes it fail.
export const fastChecks: Check[] = [...sourceListChecks]
