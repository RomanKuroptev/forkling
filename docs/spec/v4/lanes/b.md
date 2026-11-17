# Lane B: the sandbox (step 3), then projects (step 4)

Worktree `.claude/worktrees/lane-b`. Plan approved by the coordinator on 17 November, with the socket-activated unit instead of `systemd-run` (see `docs/decisions.md`, 2026-11-17).

## Step 3

- **3A, project files:** `apps/mind/src/builds/project-files.ts` (`checkProjectPath`, `resolveProjectPath`, `listProjectFiles`, `checkWrite`; tests 1 and 2 in `apps/mind/test/project-files.test.ts`), the decision entry and the pointer in `step-3-sandbox.md`. Merged (#180).
- **3B, one browser path:** `sandbox-runner.ts` (the browser side: files served from memory through `page.route` at `http://sandbox.invalid`, a probe mode, a stdin/stdout program for the server), `sandbox-run.ts` (`createLocalSandbox`, `runInSandbox(projectDir, sandbox)`), and the work check moved onto it (`browser-check.ts`, `reasonsOf`). Test 3 in `test/sandbox-run.test.ts`. Merged (#186).
- **3C, the server side:** `deploy/forkling-sandbox.socket` and `deploy/forkling-sandbox@.service` (every property of step 3, plus `InaccessiblePaths` and `ProtectProc=invisible`), the socket client (`createSocketSandbox`, `createSandbox`), the self-test at start and `/health` `sandbox: ok | missing` (a failed self-test falls back to checking works in-process), `pnpm --filter @forkling/mind sandbox-proof` (tests 4 to 9, plus the browser starting as `forkling-build`), `deploy.sh` copying the runner and `playwright-core` to `/opt/forkling/sandbox/releases/<tag>` with `current` pointing at it, and `setup.sh` for a fresh server. Branch `claude/v4-b-sandbox-server`.
- **3D, the runbook:** after 3C.

## Step 4

Not started. The `build` verb in `mind-plan.ts` waits for lane A's step 1 slice B.
