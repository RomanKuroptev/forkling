# Lane A: grow and wallet (steps 1 and 2)

- Step 1 slice A, interest families: PR open (label prompt-review, waits for the reviewer). Next: slice B, expand by price.
- Step 1 slice A: merged (#179).
- Step 1 slice B, expand by price: PR open with prompt-review. Gate removed (earning is a price only). Lane B may rebase for the `build` verb once it is merged.
- Step 1 slice B: merged (#187).
- Step 1 slice C, found builds at once: PR open with prompt-review. Next: step 1 replay report, then step 2 plan.
- Step 1 slice C: merged (#197). Step 1 is done.
- For Roman's list (step 1 caveat): interest families link every topic fed by the same trip, so on 17 Nov "installation art" is one family of 19 topics at weight 100 (capped). That is spec-v4 2.1 working as written; if the families turn out too big, the fix is a spec change (for example, link by trail only when the topics share a word), not a code tweak.
- Step 2 slice A, captions and the short diary: PR open with prompt-review. Caption on a place stays a plaque text in notebook/writing (the plaque mechanism); caption on a work is `caption` in meta.json. Caption kept up to 50 words (asked 40, same 25% margin as pages). Replies are cut at 60 words. Project ids as caption targets come when step 4 lands.
- Points for a founding refused for having no real tag are not refunded: a step spends its points when it starts, and no refused job output (tinker, expand, found) gets points back today. Kept consistent.
- Step 2 slice A: merged (#207).
- Step 2 slice B, prices and points: PR open with prompt-review. Daily points: 300 at the stored cap 12.6, 370 at 15 (rule 7). Fixes folded in from review: caption is 40 words and cut at a word (not 50, not dropped), fitReply keeps line breaks unless it cuts, about.md once a week is a 6-day minimum since the newest copy.
- Step 2 slice B: merged (#210).
- Step 2 slice C, ready for income: PR open (no prompt text changes). Credits file and schema, effectiveCapUsd read by the guard, pace rule, Haiku fallback, daily points formula and health file; grants carry a source; an earned expand is min(20, expand). The `session` call kind of lane B is untouched. Fast-forward and run-report still read `capUsd` from a ledger on disk (lane 0's files); they run on throwaway copies with no credits file, so nothing changes for them.
