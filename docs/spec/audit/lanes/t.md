# Lane T: `/qa` and triage (step QT)

Status: plan approved by the coordinator (19 November), including fix PRs merging themselves under the gates of `prompt.md`.

## Progress

- **T1** (#272, branch `claude/qa-t-triage`): built. `apps/qa/src/triage/` (tracker, gh-tracker, marker, plan, apply, command, run-info), the sample findings file and PNG, with tests. `pnpm qa fast` now also writes `qa-out/run.json`. Changes from the plan: `info` findings never open issues. Real read-only dry run on the sample (19 November): 7 issues to open, 2 of them `needs-roman`, 4 picks, no existing issue touched.
- **T2** (#275, branch `claude/qa-t-digest`): built. `gather.ts`, `fix-try.ts`, `digest.ts`, `config.ts`, `qa/triage.json`; `Tracker.getIssue`; the marker keeps `fixedBy`, so the close says "fixed by #PR" (cleared if the issue comes back). Other lanes can put a short `qa-out/behaviour/summary.md` and `qa-out/sources/summary.md` in the run; the digest shows their first 15 lines. A `needs-roman` issue's recommended answer is the line `**Recommended answer:** …` in its body (the skill writes it). After a dry-run triage the digest says nothing changed on GitHub.
- **T3** (branch `claude/qa-t-skill`): built. `.claude/skills/qa/SKILL.md`, `.claude/agents/fixer.md`, `qa/nightly.ps1`, `apps/qa/test/no-schedule.test.ts`. Choices: `/qa dry-run [mode]` is the proof mode (GitHub only read, no fixers, digest not posted); a fixer never merges and writes "For #n", not "Fixes #n", so the issue closes only after 2 clean runs; adding a new check with a new planted test is allowed in a normal PR, changing or removing an existing level or planted test is `qa-rules`; prompt fixes' real runs are started by the skill (budget check, spend line), never by the fixer. The skill refers to `world-explorer`, `look-reviewer` and `behaviour-reviewer` by name and to lane B's `pnpm qa behaviour` and fake-run workflow; wire the exact names when those merge.
- **Not done here:** a permission rule that blocks pushes to `qa-evidence` (settings are Roman's); today only the code writes there, and the skill and the fixer forbid it.

Built against `apps/qa/test/fixtures/sample-findings.json` (a stand-in with one finding per area and fixKind, a `qa.check-did-not-run`, a PNG evidence file and a `needs-roman` case) until lanes W, B and S merge real findings. Every GitHub call goes through one small interface (`Tracker`); tests use an in-memory fake and never touch GitHub.

## Choices (each gets one line in `docs/decisions.md`)

- **Where the clean-run count lives:** a hidden marker in the issue body, `<!-- qa-state {"fp":"…","clean":0,"evidence":"<hash>","tries":0} -->`. Why: the issue is already the one record per fingerprint, it works from any PC and needs no committed state file. Issues without a marker (the hand-filed `phase-2` ones, #262 to #268) are never touched.
- **"Evidence changed"** means a change in severity, `what`, or the list of evidence file names (a hash of those). Picture bytes are not hashed: a re-render differs by a pixel every run and would comment every night.
- **"Clean"** counts only when the run covered that issue's area (the run writes the areas it ran into `qa-out/run.json`). A `/qa nightly` without the explorer must not count as a clean run for a world-explorer issue.
- **Pictures:** issue comments cannot take uploads through the API, so PNG evidence is committed by `gh api` (contents API) to an orphan branch `qa-evidence` of this repo (public) under `<fingerprint-hash>/<date>/<name>.png`, and the issue shows it with a `raw.githubusercontent.com` link. Never Merge's repo, never `main`.
- **A closed issue whose fingerprint comes back** is reopened with one comment (not a second issue).
- **Merging fix PRs:** the skill merges a fix PR only after `gh pr checks` exits 0 with checks present (the standing rule of 10 November and spec 10), and only the kinds the table allows; `qa-rules` PRs and anything `needs-roman` are left for Roman.
- **D2's "reviewer agent" for prompt fixes:** a fresh `behaviour-reviewer` run reading the before and after 3-day runs plus the prompt diff (no new agent).

## PRs, in order (each: tests first, `STATUS.md` line for lane T, this file updated, branch `claude/qa-t-…`)

**T1. Triage core and `pnpm qa triage [--dry-run]`** (`apps/qa/src/triage/`)
- Tests first (`test/triage.test.ts`, `test/marker.test.ts`, `test/gh-tracker.test.ts`):
  - marker: render and parse round trip; body without a marker is "not ours".
  - plan against the fake tracker: new fingerprint opens one issue (labels `qa` + area + severity, plus `needs-roman` for fixKind `server`/`roman`); known with same evidence does nothing; known with changed evidence comments once; absent in a covered area counts clean 1, then closes on clean 2 with "not seen for 2 runs"; absent in an uncovered area does not count; seen again resets clean to 0; closed issue that comes back is reopened; a marker-less `qa` issue is left alone; the same sample file run twice gives no new actions the second time.
  - picks: up to 5, blockers then majors then oldest; skips `needs-roman`, `fix-failed`, `qa-rules`, minor and info.
  - pictures: PNG evidence is uploaded once per issue/date, SVG refused (already by the schema), missing files listed in the issue instead of failing the run.
  - gh adapter: builds the right `gh` argument lists (an injected `exec` fake records them), parses `gh issue list --json` output.
- Code: `tracker.ts` (interface + fake), `gh-tracker.ts` (`execFile('gh', …)`, no shell, works in PowerShell), `marker.ts`, `plan.ts` (pure: findings + issues + covered areas → actions + picks), `apply.ts`, CLI `triage [--findings <file>] [--dry-run]`. `--dry-run` only reads GitHub (`gh issue list`) and prints the actions; writes `qa-out/triage.json` (actions and picks) in both modes.
- Sample findings file and a small PNG fixture.

**T2. Gather, fix tries and the digest**
- Tests first: gather merges several findings files (Q0 `fast`, downloaded artefacts, reviewer files in `qa-out/review/*.json`) into one, one entry per fingerprint, highest severity wins, `runs` and earliest `firstSeen` kept, a file that does not parse becomes a `qa.check-did-not-run` finding (not a crash); `fix-try` adds a try to the marker and labels `fix-failed` on the second failure with what was tried; the digest renders found / fixed and merged (PR links) / waiting for Roman (one line and a recommended answer each) / fix-failed, with the sheets as PNG links, and `--post` adds exactly one comment on #269 through the tracker.
- Code: `src/triage/gather.ts` (`pnpm qa gather [--from <dir>…]`), `fix-try` (`pnpm qa fix-try <issue> --failed "<what was tried>" | --merged <pr>`), `src/triage/digest.ts` (`pnpm qa digest [--post]`, writes `qa-out/digest.md`). Digest issue number in `qa/triage.json` (`{"digestIssue": 269, "maxFixes": 5}`; a `qa-rules` file).

**T3. The skill, the fixer and the nightly script** (no Vitest for agents; one test that `nightly.ps1` holds no `Register-ScheduledTask` call outside a comment and that no workflow has `schedule:`)
- `.claude/skills/qa/SKILL.md`, `/qa [nightly|weekly|release]`, steps: (1) `pnpm qa fast`; (2) `gh run list` for the newest `qa-live.yml` and fake 30-day runs, `gh workflow run` when none is under 24 hours old (wait for it, `gh run watch`), `gh run download` into `qa-out/actions/`; (3) weekly and release: fresh `live` clone, `world-explorer` on it and the fixtures, `look-reviewer` on its findings; (4) weekly and release: real behaviour run if `lanes/spend.md` has room under $10 for its `--cap`, line added to spend.md, then `behaviour-reviewer`; (5) `pnpm qa gather`, `pnpm qa triage`; (6) a `fixer` per pick (up to 5 in parallel, worktree isolation), reviewers on look and prompt fixes, merge after green CI, `pnpm qa fix-try` on failure; (7) `pnpm qa digest --post`. Nightly = 1, 2, 5 to 7; weekly and release = all. Which parts ran goes into `qa-out/run.json` (the covered areas).
- `.claude/agents/fixer.md` (Opus): one issue, its own worktree, branch `claude/qa-fix-<issue>`, by the fixKind table of spec 10 and the full "never" list (seed, Merge's repo, plan checks/quotas/variety rules → label `needs-roman` and stop, caps, hosts, loosening a check or test, server, deploy; `qa/` thresholds and `test/planted/` only in a PR labelled `qa-rules`). Code: failing test first. Look: before and after PNGs in the PR. Prompt: goldens + 3-day real run under the harness budget. Reports PR number or "could not fix: …".
- `qa/nightly.ps1` (runs `claude -p "/qa nightly"` from the repo root, log to `qa-out/nightly-<date>.log`) with the one `Register-ScheduledTask` line for 07:15 in its header comment and in the skill, **not created**.
- `CLAUDE.md` Commands and `docs/decisions.md` lines.

## What I will show you as the dry-run proof (before QR)

1. `pnpm qa triage --dry-run --findings apps/qa/test/fixtures/sample-findings.json`: reads the real `qa` issues (read only) and prints the plan: N to open, the comments, nothing to close, the 5 picks, and confirms #262 to #269 are left alone. Then the same with the fake tracker run twice and a third time with findings removed, showing clean 1, then the close.
2. `pnpm qa digest` (no `--post`): the `qa-out/digest.md` it would post to #269.
3. The skill walked through with `--dry-run` at each GitHub step, listing what it would start, download, call and merge.

The first real run (issues opened, one fix merged, digest posted) is QR, with you, after I tell you first.
