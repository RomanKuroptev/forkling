# Lane B: the sandbox (step 3), then projects (step 4)

Worktree `.claude/worktrees/lane-b`. Plan approved by the coordinator on 17 November, with the socket-activated unit instead of `systemd-run` (see `docs/decisions.md`, 2026-11-17).

## Step 3

- **3A, project files:** `apps/mind/src/builds/project-files.ts` (`checkProjectPath`, `resolveProjectPath`, `listProjectFiles`, `checkWrite`; tests 1 and 2 in `apps/mind/test/project-files.test.ts`), the decision entry and the pointer in `step-3-sandbox.md`. Merged (#180).
- **3B, one browser path:** `sandbox-runner.ts` (the browser side: files served from memory through `page.route` at `http://sandbox.invalid`, a probe mode, a stdin/stdout program for the server), `sandbox-run.ts` (`createLocalSandbox`, `runInSandbox(projectDir, sandbox)`), and the work check moved onto it (`browser-check.ts`, `reasonsOf`). Test 3 in `test/sandbox-run.test.ts`. Merged (#186).
- **3C, the server side:** `deploy/forkling-sandbox.socket` and `deploy/forkling-sandbox@.service` (every property of step 3, plus `InaccessiblePaths` and `ProtectProc=invisible`), the socket client (`createSocketSandbox`, `createSandbox`), the self-test at start and `/health` `sandbox: ok | missing` (a failed self-test falls back to checking works in-process), `pnpm --filter @forkling/mind sandbox-proof` (tests 4 to 9, plus the browser starting as `forkling-build`), `deploy.sh` copying the runner and `playwright-core` to `/opt/forkling/sandbox/releases/<tag>` with `current` pointing at it, and `setup.sh` for a fresh server. Merged (#190).
- **3D, the runbook:** `docs/spec/v4/step-3-runbook.md`, the exact root commands over SSH with expected output and undo for each (rule 8). Merged (#191). **After it is merged, the coordinator runs it** (after the release carrying step 3 is deployed).

## Step 4

Plan approved by the coordinator on 17 November: 4A to 4D, then 5E (the seed sentence). 4B and 4C are `prompt-review`.

- **4A, project files:** `packages/schema/src/project.ts` (`Project`, `ProjectSession`, `canStartProject`, `projectIdFor`, the 3.1 limits; `inspiredBy` is lane C's `InspiredBy`), `apps/mind/src/builds/projects.ts` (read, write, create with at most 3 building, end with a reason, add a session), `projects/` in `validate-pr` (a person's pull request is checked against 3.1; the build worker's branch may not touch it), `projects/.gitkeep` in the template. Branch `claude/v4-b-project-schema`.
- **4B, the session loop:** next.
