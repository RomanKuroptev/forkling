# packages/sim

The pure, deterministic sim. It runs in the browser, in the mind and in CI, so it must stay pure.

## Rules
- Keep it pure: no DOM, no three.js, no React, no network, no `node:` imports.
- No `Math.random()`. Use the seeded PRNG in `src/prng.ts` (`drawPrng` and `hashString` for keyed draws). No `Date.now()` either; time comes in as an argument.
- The body is deterministic from `(step, startedAt, seed, now)`, so every visitor sees roughly the same forkling at the same moment. The mind and every viewer build the same `BodyWorld` from the same places and seed (`src/body-world.ts`).
- The rules the mind applies to a world are here too and are deterministic: place limits and patches (`validate-place.ts`, `validate-place-patch.ts`), land, paths and neglect (`land.ts`, `paths.ts`, `neglect.ts`), the allowance, novelty and nudge measures, interests, beliefs and wants, mood, sleep and the triggers.
- Never write species-specific logic here. If a feature needs it, add a hook to the pack format instead. The tests run against a made-up "blob" pack with no animations to prove the engine has no cat assumptions.
- Never add goal, hobby, interest, topic or activity lists. Behaviour comes from the nine mind verbs (wander, tend, revisit, expand, found, tinker, write, reply, rest) and from what the mind writes in its plans.
- The pack gives the body only. `stations.ts` says where a verb goes, from the world's spot names (a place's id, or a kind of furniture where it stands); the pack's `mindPoses` says which of its actions shows the verb.

## Working here
- TDD: write the Vitest test first for sim logic, then the code.
- The headless runner steps the world without a renderer. Use it to test behaviour over simulated days.
- Triggers decide when the mind wakes the LLM (`surprise.ts`, spec 2.3): `sparked`, `stepDone`, `replan`, `newDay`, `buildResult`, `reflected` and `note`. No trigger means no LLM call; utility AI keeps the body busy between them.
- The plan owns the visible action. Drift fills gaps, then the plan goes on. A step's effect lands only after the body really spent time on its verb (`tallyWindow`).
- `starter-places.ts` is Home and the Workshop: the places of a new world, and what a world with none is walked and drawn as (`bodyWorldFor`).
- `fixture-world.ts` makes the 10-place test world (`?world=local&fixture=10` in the viewer).
- Run one file with `pnpm vitest run packages/sim/test/<file>`.

## Still here until W5 slice 14 part B lands
The free-form objects (`objects.ts`) and the species-pack fields that serve them. Nothing reads a world's `objects/` for the body any more. Don't extend them.
