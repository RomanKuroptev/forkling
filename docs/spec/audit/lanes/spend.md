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
| 2026-11-20 | QR | PR #446 3-day check (`day-7`, 1 seed, sessions) | $1.00 | $0.62 | $6.25 |
| 2026-11-20 | QR | Lemmy source trial rerun (#462, closed; Lemmy dropped) | $0.10 | $0.003 | $6.25 |
| 2026-11-20 | sources | Source trials: Dwitter, Imgflip Top New (2 runs, dropped), Lemmy c/memes and c/showerthoughts, Bluesky (2 runs) | $0.10 each | $0.028 | $6.28 |
| 2026-11-20 | sources | 3-day check, first pair (old snapshot: did not reach the new sources), v0.19.1 and main, 1 seed each | $2.00 | $1.07 | $7.35 |
| 2026-11-20 | sources | 3-day check, second pair, stopped on day 3 when the API credit ran out (results not used) | $2.00 | about $0.71 | $8.06 |
| 2026-11-21 | sources | Dwitter code-feed trial rerun with credit (#477) | $0.10 | $0.003 | $8.06 |
| 2026-11-21 | sources | 3-day check on the new snapshot, v0.19.1 ($0.602) and main ($0.639), 1 seed each, sessions | $2.00 | $1.24 | $9.30 |
| 2026-11-21 | fresh start | 1-day real run on a migrated copy of Merge (500 start points), sessions | $0.50 | $0.17 | $9.47 |
