# Harness spend (real model runs)

Budget: $10 a month (D1), separate from Merge's $23. Every real run has its own `--cap`. Add one line per run; stop real runs when the month's total reaches $10.

| Date | Lane | Run | Cap | Spent | Month total |
|---|---|---|---|---|---|
| 2026-11-20 | B | QB.8: real fast-forward on `day-0`, 7 days, 2 seeds side by side, `--sessions --capture-prompts --web-snapshot` | $3.00 ($1.50 a seed) | $2.42 (seed 0 $1.52, stopped at its cap after 5.7 days; seed 1 $0.90) | $2.42 |
| 2026-11-19 | QR | PR #388 3-day check, first wording (`day-0`, 1 seed, snapshot) | $1.00 | $0.42 | $2.84 |
| 2026-11-19 | QR | PR #389 3-day check (`day-0`, 1 seed, snapshot) | $1.00 | $0.46 | $3.30 |
| 2026-11-19 | QR | PR #388 3-day check, reworded (`day-0`, 1 seed, sessions) | $1.00 | $0.33 | $3.63 |
| 2026-11-19 | QR | PR #401 3-day check (`day-0`, 1 seed, sessions) | $1.00 | $0.35 | $3.98 |
| 2026-11-20 | QR | `/qa release` real run on `day-7`, 7 days, 2 seeds, sessions (seed 0 on 8eee38e, seed 1 on fc490a6) | $3.00 ($1.50 a seed) | $1.65 (seed 0 $0.50, seed 1 $1.16) | $5.63 |
| 2026-11-20 | QR | #304 Lemmy source trial, c/showerthoughts and c/microblogmemes (offline done; real run not made, no API key in the fixer worktree) | $0.10 ($0.05 a community) | $0.003 (real run on c/showerthoughts) | $5.63 |
