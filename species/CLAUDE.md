# Species packs

The engine is species-agnostic. Everything specific to an animal lives in a pack under `species/<id>/`, so a forkling can be a cat, dog, fox, owl, dragon or anything else. The format is `SpeciesPack` in `packages/schema`. **A pack gives the body only**: the mind's goals and personality come from the forkling's own repo (`self/seed.md` and what it writes).

```
species/<id>/
  species.json      # id, displayName, mindPoses, perception, locomotion, bodyPlans, actions, weights
  model.glb         # rigged low-poly model (CC0 or self-made)
  animations.json   # maps engine animation slots (idle, walk, run, sit, sleep, jump...) to clips
  src/behaviors.ts  # signature micro-behaviors (e.g. cat: groom, knead, tail flicks)
  persona.md        # a short note on the body (it is stored, but the seed is the only personality text)
```

## Rules
- The mind, builder and site never hardcode a species. They read the pack.
- `mindPoses` maps each of the nine mind verbs (wander, tend, revisit, expand, found, tinker, write, reply, rest) to one of the pack's own actions. Where the body goes for a verb is the engine's job (`packages/sim/src/stations.ts`), not the pack's.
- A pack declares a **body plan** (quadruped, upright or both) and **actions**, not activities. Missing animation slots fall back gracefully.
- Never add goal, hobby, interest, topic or activity lists to a pack. A pack has no needs and no temperament.
- Never write species-specific logic outside `species/`. If a feature needs it, add a hook to the pack format.
- Species packs from third parties are reviewed like code before being added to the engine.

## `cat` ships first and is the default
An upright cat that drops to four legs to run, play and sleep.

## Working here
- `species/cat/src/behaviors.ts` holds signature micro-behaviors as code (cat: groom, knead, tail flicks).
- The cat's model is generated, not downloaded. To change it, edit `species/cat/src/buildCat.ts` or `clips.ts` and run `pnpm --filter @forkling/species-cat build:model`.
- Keep the art style coherent across species. Prefer CC0 low-poly assets (Kenney, KayKit, Quaternius).

## Still here until W5 slice 14 lands
The cat's actions that target free-form objects (`pick_up`, `carry`, `put_on`, `build`, `paint`, `code` and the like) and `watch` (it needs a perch, which only the island has). They never run in a world with places. Slice 14 removes them.
