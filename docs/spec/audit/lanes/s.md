# Lane S: data sources (QS)

Step QS in [`../steps.md`](../steps.md), spec 9.4 and 11. Plan first; nothing is built until the coordinator approves.

## Plan (19 November)

Four PRs, in this order, each with its tests first and a lane S line in `STATUS.md`. S1 and S2 do not depend on each other; S3 needs S1; S4 needs S3. Branches `claude/qa-s-<name>`.

`apps/qa` gets a dependency on `@forkling/mind` (`workspace:*`) and imports the real code by path (`@forkling/mind/src/web/fetch.ts`, `allowlist.ts`, `robots.ts`, `starts.ts`, `sources/index.ts`, `clean.ts`). Lane B needs the same for the snapshot; whoever lands first adds it.

### S1 `claude/qa-s-sources-list`: promised against present (QS.1, fast tier)

- `qa/sources.json`, parsed by `apps/qa/src/sources/list.ts` (Zod). One entry per source: `id`, `name`, `group` (`maker`, `pulse`, `reference`, `manual`), `hosts`, `state` (`on the list`, `trial passed, not added`, `trial failed`, `blocked by robots.txt`, `dropped by Roman`), `reason`, `trial` (path in `docs/spec/w2-trials/` or `w4-trials/`, or null), `promisedBy` (spec line or Roman's date), and for anything not on the list a `recommended` answer for Roman. Sources: Wikipedia, Esolang, Commons, Art Institute, GitHub creative-coding, the four manuals, Imgflip, Show HN (hn.algolia.com, trial failed: readable 10%), Lobsters (robots.txt), Hacker News API (robots.txt), Lemmy memes (lemmy.world, trial failed: readable 63%, crawl delay 60 s), Mastodon trends (mastodon.social, blocks ClaudeBot by name, 0 readable links).
- Checks (in `fastChecks`, area `coverage`):
  - `sources.promised-missing`: every promised source not `on the list` is a finding, `major` for pulse sources (Roman's focus), `minor` for the rest. `fixKind: code` only when the state is `trial passed, not added` and robots allows (the v4 rule for new hosts); every other state is `fixKind: roman` with the recommended answer in `what`. Never Reddit or Know Your Meme (a test refuses them in the file).
  - `sources.list-matches-engine`: `on the list` hosts are exactly the hosts in `ALLOWLIST` (both ways), and every `trial` path exists. Stops the file going stale.
- Tests first (`apps/qa/test/sources-list.test.ts`, planted): an `on the list` source whose host is not in the allowlist; an allowlist host missing from the file; a missing trial report; the real file gives exactly Lemmy memes, Mastodon trends and Show HN as pulse/maker findings with `fixKind: roman`.
- `docs/decisions.md`: steps.md's `qa/sources.json` is used instead of spec 9.4's `qa/coverage.json` (coverage.json is Phase 2's mockup file).

### S2 `claude/qa-s-behaviour`: what Merge actually read (QS.3)

- Pure measures in `packages/sim/src/source-mix.ts`, test first, numbers in and out: `hostShares(reads)` and the top share, `share(count, total)` per day and per 7 days, `newSince(previous, current)` (used by S3 for Imgflip). Reuse `topHostShare` ideas from `apps/mind/src/web/stats.ts` only where it fits; it reads `SourceStats`, so the trail-level measure is new, not a second copy.
- `apps/qa/src/behaviour/sources.ts`: reads a world folder (a fast-forward world copy or a `live` clone): `trails/*.json`, the day's starting points (`points` in the mind state, and its git history over the last 7 days when the folder is a clone; `unknown` when it cannot tell), the tick log notes (`could not be read`), works' `sources` and souvenirs. Gives per day and per 7 days: trips per host, top host share (major over 50%), trips per start source, trips that read nothing or hit a 404 (major over 10%), invented Wikipedia titles (a 404 on `en.wikipedia.org/wiki/`), pages read twice, which sources fed a work or souvenir (`info` when read but never feeding), and sources on the list that were never offered (finding). The `info` line "Wikipedia share" is always written, so the report shows it.
- `pnpm qa sources --world <dir>` (also used by S4 on the live clone).
- Tests first, on small worlds written in the test: planted 80% Wikipedia trips (top host alarm), 20% read-nothing trips, a never-offered source; a clean world gives no major.

### S3 `claude/qa-s-live`: source health and the snapshot check (QS.2, QS.4, QS.6)

- `apps/qa/src/live/sources.ts`, the real `createFetcher` (allowlist only, the normal gaps; GitHub with the workflow's token through `authorization`), robots.txt read first through `checkRobots` with the `HOST_PLANS` paths (manuals: `/`); a host whose robots.txt now disallows is a `blocker` and is not read further; unreachable is a `major` and that host's item checks are skipped with `qa.check-did-not-run`.
- Item checks: Wikipedia Main Page section links (1 to 4), Esolang front page (6 or more), GitHub `creative-coding` repos (4), Imgflip formats (6 or more), Commons and Art Institute start through `HOST_PLANS`, one manual page each. A sample Wikipedia page from the morning links cleans to over 120 words and has links. "0 items" is a `major` named after the source.
- Imgflip freshness: the 100 format ids against a history file (`--imgflip-history <file>`, list of `{date, ids}`, last 8 entries). Count of new formats is `info`; zero new across 14 days or more is `major` (`fixKind: roman`, recommended: add a pulse source that moves, see S1). No history yet: `info` "first run, nothing to compare".
- **History is kept as an Actions artefact** (`imgflip-history`, carried from the last successful `qa-live` run with `gh run download`, 90-day retention): no commits from the job and no PR noise for a 2 KB file.
- Snapshot check `sources.web-snapshot`: `takenAt` under 14 days (major), every `on the list` source in `qa/sources.json` has at least one item (major), every file named in the manifest exists and every URL is `isAllowed`. Runs in the live run, not the PR tier, so pull requests do not turn red only because two weeks passed. Until lane B's snapshot is merged it says `qa.check-did-not-run` there.
- `pnpm qa live --sources [--world <clone>] [--imgflip-history <file>]` writes `findings.json` and `report.md` in `qa-out/`.
- Tests first, all with recorded responses and a fake fetch (no network in CI): planted Esolang front page with a changed layout (0 items), a robots.txt that now disallows `/wiki/` (blocker), a snapshot 20 days old, a snapshot missing a source, Imgflip with the same ids two weeks running.

### S4 `claude/qa-s-workflow`: `.github/workflows/qa-live.yml` (QS.5)

- `workflow_dispatch` only, two jobs picked by an input (`sources` default, `web-snapshot`). The planned times are comments: `# schedule: - cron: '30 5 * * *'` (06:30 Stockholm in winter; 04:30 UTC in summer) and the snapshot `# weekly, Monday 05:00 UTC`.
- `sources` job: checkout, install, `gh run download` of the last `imgflip-history`, `git clone --shallow-since` of `RomanKuroptev/merge` (read only, public), `pnpm qa live --sources --world merge --imgflip-history ...`, upload `qa-out/` and the new history. Permissions `contents: read`, `actions: read`. No secrets.
- `web-snapshot` job: runs lane B's `pnpm qa web-snapshot` and opens a PR (`gh pr create`, permissions `contents: write`, `pull-requests: write`). If the repository setting "Allow GitHub Actions to create pull requests" is off, the job says so and Roman decides (no setting is changed by me).
- After the coordinator merges S4: `gh workflow run qa-live.yml` twice, then a lane S note with the two run links and what the report says (missing pulse sources, Imgflip freshness, live Wikipedia share).

### Snapshot file format (for lane B, through the coordinator)

```
qa/web-snapshot/
  manifest.json
  files/<sha256 first 16 hex>.<html|json|txt>
```

`manifest.json`:

```json
{
  "version": 1,
  "takenAt": "2026-11-20T05:00:00Z",
  "engine": "<git sha of the fetch code>",
  "userAgent": "<USER_AGENT>",
  "entries": [
    { "url": "https://en.wikipedia.org/wiki/Main_Page", "host": "en.wikipedia.org", "source": "wikipedia", "status": 200, "contentType": "text/html", "file": "files/3f2a....html", "bytes": 123456, "sha256": "<full>" }
  ],
  "sources": { "wikipedia": { "items": 4 }, "esolang": { "items": 6 } }
}
```

- `source` and the keys of `sources` are the ids in `qa/sources.json`; `items` is what the source code found on the snapshot (the same count S3 checks live).
- robots.txt of each host is an entry too, so a replay can honour it. A request that failed is an entry with its `status` and no `file`.
- Only `isAllowed` URLs; the files are what `createFetcher` returned (after its 2 MB cap).

## Progress

- 19 November: plan written and approved (Lemmy `trial failed` per its report; a schema-and-allowlist check of the committed snapshot also goes in `fast`; a missing Imgflip history is `info` "no history yet").
- S1 PR opened: `qa/sources.json`, `apps/qa/src/sources/list.ts`, `checks.ts`, tests in `apps/qa/test/sources-list.test.ts`. Choice made: a `fixKind: roman` major does not fail a PR (`blocking` in `report/write.ts`), else the three missing pulse sources would hold every PR.
