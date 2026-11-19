---
name: qa
description: Run the audit harness by hand - the fast checks, the Actions artefacts, the reviewers, triage to GitHub issues, up to 5 fixes and the digest. Use when the user types /qa, /qa nightly, /qa weekly, /qa release or /qa dry-run.
---

The audit harness's AI part (`docs/spec/audit/spec.md` sections 5, 10 and 12; build steps in `steps.md`). It runs only when someone types it: **nothing is on a schedule** until Roman says so. Plain words for Roman everywhere. Pictures are PNG. Run `pnpm` directly (PowerShell), `rtk` for git and gh. Never pipe `gh pr checks` into another command (the exit code is the answer).

## Modes

| Mode | Steps |
|---|---|
| `/qa nightly` | 0, 1, 2, 5, 6, 7, 8, 9 |
| `/qa weekly`, `/qa release` | all, 0 to 10 (10 only for release) |
| `/qa` | nightly, plus the weekly steps when `qa-out/last-weekly.txt` is missing or older than 7 days |
| `/qa dry-run [mode]` | the steps of that mode, but GitHub is only read: no `gh workflow run` (use the newest runs there are), `pnpm qa triage --dry-run`, no fixers, `pnpm qa digest` without `--post`. Print what each skipped step would have done. This is the proof run. |

## Rules (always)

- **Merge never sees the harness.** Nothing from a run goes into a prompt, a plan check or Merge's repo. Production is read only: GET requests, the GitHub API, `/health` and the public JSON files.
- **The never list** of spec 10.5 holds for you and every fixer: no change to `self/seed.md`; nothing written to Merge's repo; no new plan check, quota or variety rule (such findings get `needs-roman`); no cap raised; no host added; no check or test skipped, disabled or loosened; no server or deploy; no picture baseline approved without the look reviewer.
- `qa/` levels and existing `apps/qa/test/planted/` files change only in PRs labelled `qa-rules`. **Never merge a `qa-rules` or `needs-roman` PR**; list it in the digest for Roman.
- The `qa-evidence` branch is written only by `pnpm qa triage` and `pnpm qa digest`. Never push to it, check it out or commit to it by hand.
- Real model runs only inside the harness budget: $10 a month (D1), tracked in `docs/spec/audit/lanes/spend.md`. Check the month's total plus the run's `--cap` before every real run; if it would pass $10, skip the run and say so in the digest.
- No `schedule:` in any workflow and no scheduled task: `qa/nightly.ps1` holds the one line for Roman, unused.

## Steps

**0. Start.** Work in the main checkout on `main`, clean (`rtk git status`); `rtk git pull --ff-only`; `pnpm install --frozen-lockfile`. Empty `qa-out/` except `fixes.json` and `last-weekly.txt`. Keep a list of the areas this run looks at (for step 5).

**1. Fast checks.** `pnpm qa fast` (a non-zero exit only means it found a blocker or major; go on). It writes `qa-out/findings.json` and `run.json`.

**2. Actions artefacts.** For `qa-live.yml` and the fake 30-day run workflow (the qa workflow that runs `pnpm qa behaviour --fake`; find it with `rtk gh workflow list`):
- `rtk gh run list --workflow <file> --branch main --limit 1 --json databaseId,status,conclusion,createdAt`.
- If there is no successful run under 24 hours old: `rtk gh workflow run <file> --ref main`, find the new run id the same way, and `rtk gh run watch <id> --exit-status` (dry-run: use the newest run there is).
- `rtk gh run download <id> --dir qa-out/actions/<file without .yml>`.
- A run that failed or has no `findings.json`: write `qa-out/review/actions-<name>.json` with one finding: id `qa.check-did-not-run`, fingerprint `qa.check-did-not-run|actions:<file>`, area `live` (or `behaviour` for the fake run), severity `major`, fixKind `code`, the run link in `what`, today's date as `firstSeen`, runs 1.

**3. The world (weekly, release).** Make a fresh read-only clone of Merge's repo: `git clone --depth 50 https://github.com/RomanKuroptev/merge qa-out/live`, then `git -C qa-out/live remote set-url --push origin no-push`. Start the `world-explorer` agent on the world fixtures and on `qa-out/live`; it writes its findings to `qa-out/review/world-explorer.json` with screenshot paths. Then the `look-reviewer` agent on those findings and pictures: what it confirms it writes again with severity `major` (same fingerprint) to `qa-out/review/look-reviewer.json`. Add `world` to the areas.

**4. Behaviour (weekly, release).** If the budget allows, the real run lane B built (`pnpm qa behaviour --real --days 7 --seeds 2 --cap 3`; on `day-0` and `day-7` for release), and the live last 7 days from `qa-out/live`. Add one line per real run to `docs/spec/audit/lanes/spend.md` (commit it on a branch `claude/qa-spend-<date>` with a PR, merged after green CI like a code PR). Then the `behaviour-reviewer` agent on the run folders: it writes `qa-out/review/behaviour-reviewer.json` and a short `qa-out/behaviour/summary.md`. Add `behaviour` to the areas. Write today's date to `qa-out/last-weekly.txt`.

**5. Gather.** `pnpm qa gather --areas <areas from steps 3 and 4, comma-separated>`. One `findings.json`, `report.md` and `run.json` for the run.

**6. Triage.** `pnpm qa triage` (dry-run: `--dry-run`). Read `qa-out/triage.json`: what was opened, commented, reopened and closed, and the picks (at most `maxFixes` in `qa/triage.json`).

**7. Fix.** For each pick, one `fixer` agent (Agent tool, `subagent_type: fixer`, `isolation: worktree`), all at once, with the issue number, fingerprint, fixKind and title. Each answers `pr:`, `could not fix:` or `needs-roman:`.
- `needs-roman`: `rtk gh issue edit <issue> --add-label needs-roman`, and put the line `**Recommended answer:** <its answer>` at the top of the issue body (keep the hidden `qa-state` line as it is).
- `could not fix`: `pnpm qa fix-try <issue> --failed "<what was tried>"` (the second failure labels it `fix-failed`).

**8. Merge, gated.** For each PR, in turn:
1. Refuse to merge if it is labelled `qa-rules` or `needs-roman`, or `rtk gh pr diff <pr> --name-only` shows `self/seed.md`, `apps/mind/src/web/allowlist.ts`, `deploy/`, `.github/workflows/deploy*`, a changed file in `qa/`, or a changed or removed file in `apps/qa/test/planted/`. Leave it open for Roman and say so in the digest.
2. Wait for CI: `rtk gh pr checks <pr> --watch`, then `rtk gh pr checks <pr>` on its own. Merge only if it exits 0 **and** lists at least one check (including `qa.yml`'s `fast`).
3. By kind:
   - **code, data**: green is enough.
   - **look**: a fresh `look-reviewer` agent (not the one from step 3) gets the before and after PNGs the fixer named and `docs/spec/v4/look.md` with the world mockups (`docs/spec/v4/look/world.png`, `world-night.png`, `buildings-merge-visitor.png`, `site/world-overlay.png`). Merge only if it passes the after pictures.
   - **prompt** (D2): the written checks are green; then, if the budget allows, a 3-day real run on the PR branch (`pnpm qa behaviour --real --days 3 --seeds 1 --cap 1`, a spend line) compared with the newest run on `main`; then a fresh `behaviour-reviewer` reads both and the prompt diff. Merge only if the score moved the right way, nothing else got worse, and the reviewer agrees. No budget: leave it open and say so.
4. Merge: `rtk gh pr merge <pr> --squash --delete-branch`, then `pnpm qa fix-try <issue> --merged <pr>`.
5. Not merged because a gate failed: `rtk gh pr close <pr> --comment "<which gate and why>"` and `pnpm qa fix-try <issue> --failed "<the same>"`.

**9. Digest.** `pnpm qa digest --post --mode <mode>` (dry-run: no `--post`). Then tell the user in a few lines what was found, fixed and merged (PR links), and what waits for Roman, with the link to the digest comment on #269.

**10. Release (`/qa release` only, D3).** If fixes merged since the last release include anything live and the whole harness was green (fast, real behaviour, live), run the steps of the `release` skill as for R1 and R2, then the pin-only commit in Merge's repo (only `FORKLING_REF` in its four workflows). Otherwise say what is still red.

## Headless (later, D4)

`qa/nightly.ps1` runs `claude -p "/qa nightly"` from the repo root and logs to `qa-out/nightly-<date>.log`. The one line that would make it a Windows scheduled task is in that file's header. **It is not created**: Roman switches schedules on when he says so, and he also decides which tools a headless run may use.
