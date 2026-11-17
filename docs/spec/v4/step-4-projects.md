# Step 4: projects and build sessions

Spec: [`spec-v4.md`](spec-v4.md) sections 0, 3 and 5. **Do not start until step 3 is merged, deployed, and `/health` shows `sandbox: ok`.**

## Why

Every work so far is one model call that writes one file and is never looked at again, and all six are the same sand shader. Roman: "the real fun is real autonomy in coding, creating and exploring" and "I would like Merge to also build cool stuff, not just trinkets". This step lets Merge write code, run it, look at the result, fix it, and keep going over days.

## The rule above all others

Not on rails. The engine never suggests, assigns or lists a project, never sets a number of sessions or projects, and never tells Merge to continue or finish one. If any part of this step seems to need such a rule, stop and ask Roman.

## Build

Five slices, one PR each, in this order.

### Slice A: the project files (schema and checks, no model)

- `packages/schema/src/project.ts`: `Project` per spec-v4 3.1, with a template copy. `projects/` added to the world layout and to `validate.yml`'s known paths, with the limits of 3.1 checked there too.
- Reading and writing a project folder in `apps/mind`, on top of step 3's `project-files.ts`.
- Tests first: every limit and every field length; a project with 3 `building` siblings cannot be created; `done` and `abandoned` need a reason.

### Slice B: the session loop

- `apps/mind/src/builds/session.ts`: the agent loop of spec-v4 3.3 on Sonnet 5.5, with exactly the tools `list_files`, `read_file`, `write_file`, `delete_file`, `run`, `look`, `finish`. Tool choice is left to the model (no forced tool choice, no prefill). `run` calls `runInSandbox`.
- Stops: 25 model turns, $1.50, points in hand at 0, 90 minutes on the clock, or `finish`. On any stop but `finish`, the engine runs once more, saves the state, and writes the caption itself as a plain fact ("Stopped at the session limit.") flagged `engine`, so it stays out of Merge's diary input like other engine lines.
- Every turn goes through the budget guard and is booked in the ledger under the new kind `session`. Points are taken as the session runs: 1 per $0.001.
- The input is exactly what 3.3 lists. **No web text, no visitor notes, no stream.** A session's prompt has no `<data>` blocks from outside.
- The screenshot of the last `run` is saved as `shots/<n>.png` (downscaled to at most 300 KB; the newest 60 are kept, older ones stay in git).
- A session ends in one commit by the server: `projects/<id>/` and nothing else.
- Tests first, with a fake model: each stop condition; a write outside `src/` is refused and the session goes on; `done` with a failing check becomes `continue` with `broken: true`; the ledger and the points agree to the cent; a session with the sandbox missing does not start.

### Slice C: the verb

- `build` joins `MIND_VERBS` (ten verbs). It has no entry in `VERB_MINUTES`: the plan holds while the session runs, and the steps after it start when it ends. Check how `advance` and the body's playback use a step's `until`, and give a build step an open end that closes when the session does.
- Plan validation for `build`: the target is a new name (3 to 40 characters, and fewer than 3 projects `building`) or the id of a `building` project; it is refused when tired, when the pace rule holds build verbs, and when fewer than 300 points are in hand. Nothing else.
- The system prompt gains one paragraph for `build`, in plain words: you can start a project of your own or go on with one, you write code and can run it and see it, a session costs what it uses, you need 300 points to start, and you may finish or drop a project whenever you like, with a reason. The planner is shown its `building` projects with their aims and last captions, and its `done` and `abandoned` ones by name.
- The body: at the Workshop bench, as for tinker. The latest screenshot shows on the bench screen while a session runs.
- `CLAUDE.md`: the lines named for step 4 in spec-v4 section 12.
- Tests first: plan validation cases; a plan with a build step in the middle keeps its later steps and starts them after the session; a day with a 70-minute session still ends in a valid state at bedtime.

### Slice D: shown and placed

- Site: `/projects/` and `/projects/<id>/` per spec-v4 3.4, with the timelapse (the screenshots in order with their captions; plain images, no video). A `done` project runs in the same frame and policy as a work.
- A tend may put a `done` project on a free screen slot as an exhibit of kind `project`. It then counts for "earned" (step 1's `expandEarned`).
- `site/changes.json` and the RSS feed gain "started a project", "worked on …", "finished …", "dropped …".
- Tests: the routes render from the template world with one project in each status.
- Sharing: also build the vertical timelapse file of [`sharing.md`](sharing.md) S4.

### Slice E: the seed sentence (persona, needs Roman's explicit OK)

- Proposed addition to `self/seed.md`, after "…and you find your own limits funny.": **"You like projects that are a bit too big for you, and you would rather fail at something interesting than finish something dull."**
- Run the voice test with and without it and show Roman 5 thought lines and 1 diary entry from each. He may edit the sentence or say no. Nothing is committed to Merge's repo without his yes.

## Do not touch

- Sketches and full works (`tinker`): they stay as the quick way to make something small.
- The four existing plan checks. Do not add one for projects.
- The rule that a call which reads web text or visitor notes has no tools. A session has tools, so it reads neither.

## Done when

1. All tests pass, and `pnpm test` and `pnpm typecheck` pass.
2. A local dry run with the real model against the template world (Roman's key, under $2): one new project, one session, a screenshot that is not blank, a second session that changes it. Show Roman the two screenshots and captions.
3. Roman has read the `build` paragraph of the system prompt and said yes.
4. The cost note in `docs/decisions.md` shows the expected monthly total with sessions, under $15 for models.

## After release

Over the first live week, without anyone assigning anything, report to Roman each day in plain words: did Merge start a project, how many sessions, what each screenshot shows, what it cost, and whether anything was held back by a limit. If Merge starts none in 4 days, do not add a rule. Tell Roman, and look at prices and the prompt paragraph with him.
