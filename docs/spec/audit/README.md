# The audit harness

An automatic, repeatable check of forkling: does it **work** as intended, does it **look** as intended (site pages and the 3D world against the agreed mockups), and does Merge **behave** as intended over many days. Problems become GitHub issues, and most are fixed by Claude Code without Roman, within the autonomy rules.

Status: proposal of 19 November 2026, not built. Order agreed with Roman: build this, run it and fix the findings, then the Merge fresh start, then GoatCounter and the soft launch.

| File | What |
|---|---|
| [`spec.md`](spec.md) | What is checked, how, when, and what may be fixed automatically |
| [`steps.md`](steps.md) | Build steps Q0 to Q9, what can run side by side, "done when" for each |
| [`prompt.md`](prompt.md) | The one prompt to paste into Claude Code |

## In one picture (words)

1. **Fixture worlds**: twelve frozen copies of Merge's world (day 0, 3, 7, 30, asleep, night, at the money cap, building, many notes, retired, very long text, broken files, tool requests). Every check runs on them, so it gives the same answer each time.
2. **Every pull request** (free, about 10 minutes on GitHub): every site page at phone and laptop size, day and night, checked by rules (no sideways scroll, big enough buttons, no broken links, no fake mockup words, no engine words in Merge's voice) and compared with an approved picture; the 3D world opened headless and checked (everything is there, on the ground, not overlapping, every work visible in the world, not blank, the right colours); and the visitor, wallet, build, sandbox, tool and workflow flows run on a local copy with a fake model.
3. **Every night on GitHub** (free): a 30-day simulated run on fakes, and a read-only check of the real site, the server's `/health` and Merge's repo.
4. **On Roman's PC** (Claude plan, no API money; the real-model runs use their own small budget): a vision reviewer compares the pictures with the mockups, a behaviour reviewer reads real simulated weeks (topics moving on, memes, rest, cost, works in the world), and a triage step turns everything into issues and fix PRs, then writes one short digest.

## Commands (once built)

```
pnpm qa fast          the pull request checks
pnpm qa live          the read-only checks against the real site and server
pnpm qa behaviour --fake --days 30 --seeds 3
pnpm qa behaviour --real --days 7 --seeds 2 --cap 3
pnpm qa fps           frame rate on this computer's real graphics card (about 3 minutes)
/qa                   in Claude Code: everything above that is due, the reviewers, triage and fixes
```

## For Roman: the nightly task (only if you want D4)

Once the harness is built, Claude Code writes `qa\nightly.ps1`. To run it every morning at 07:15, open PowerShell and paste the one line Claude Code gives you then. Your PC needs to be on at that time; if it is off, type `/qa` in Claude Code when you are back.
