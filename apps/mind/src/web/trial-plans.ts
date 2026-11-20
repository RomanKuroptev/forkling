/**
 * Source trials of hosts that are NOT on the allowlist (spec 6.5), for the trial CLI only. Nothing the mind runs imports this
 * file (a test checks that): the fetcher reads these hosts only when it is given `TRIAL_HOSTS`, and only `trial-cli.ts` does
 * that. A host moves to `allowlist.ts` (and its plan to `starts.ts`, its adapter to `sources/`) only when Roman adds it after
 * reading its report.
 *
 * To add a trial: write `trials/<site>.ts` exporting its `TrialPlan`s and add them to `TRIAL_PLANS` below. Each plan names
 * the host rules it needs (`rules`): the hosts it fetches that are not on the allowlist, each with its own gap (Crawl-delay).
 */
import type { HostRule } from './allowlist.ts'
import type { Fetcher } from './fetch.ts'
import type { Item } from './item.ts'
import type { HostPlan } from './starts.ts'
import { LEMMY_TRIALS } from './trials/lemmy.ts'

export interface TrialPlan extends HostPlan {
  /** What the trial is called on the command line, and its report's file name with `/` as `-` (`lemmy.world/c/memes` is `lemmy.world-c-memes.md`). */
  id: string
  /**
   * The hosts this trial reads that are not on the allowlist, each with its kind, tier and gap. The first is the rule of the
   * trial's own host (`host`), whose kind and tier the report is marked against.
   */
  rules: readonly [HostRule, ...HostRule[]]
  /** A link to an item, read by the plan's own adapter (the mind's `readUrl` refuses hosts that are not on the list). */
  open(f: Fetcher, url: string): Promise<Item>
  /** A line or two for the top of the report about what the trial saw or how it read the host. */
  note?(): string
  /** Clears what the plan remembers between runs (lists it fetched, counts for `note`). */
  reset?(): void
}

/** Every trial-only plan. Lanes add theirs here, one line each. */
export const TRIAL_PLANS: readonly TrialPlan[] = [...LEMMY_TRIALS]

/** The rules of every host a trial-only plan reads, each host once (the first plan to name it sets its rule). */
export const TRIAL_HOSTS: readonly HostRule[] = TRIAL_PLANS.flatMap((p) => p.rules).filter((r, i, all) => all.findIndex((x) => x.host === r.host) === i)

export const trialPlanFor = (id: string): TrialPlan | undefined => TRIAL_PLANS.find((p) => p.id === id)
