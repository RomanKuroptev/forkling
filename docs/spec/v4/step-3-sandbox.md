# Step 3: the sandbox

Spec: [`spec-v4.md`](spec-v4.md) sections 0 and 4, and v3.3 sections 7.3 and 7.4 for the existing work check and policy.

## Why

Step 4 lets Merge run code it wrote, many times a day, on the server that also holds its keys. This step makes that safe first, and proves it with tests. **Nothing in step 4 starts until this step is merged, deployed and checked on the real server.**

## The design, in one paragraph

Merge's code never runs anywhere but inside headless Chromium. That browser runs as a separate Linux user with no keys, no network and a hard time and memory limit. The engine hands it a read-only copy of the project's files and gets back errors and a screenshot. There is no shell tool and no Node execution of anything Merge wrote.

## Build

One PR for the code, then a runbook for the server.

### Code

- `apps/mind/src/builds/sandbox-run.ts`: `runInSandbox(srcDir)` returns `{ errors[], consoleErrors[], screenshotPng | null, blank, timedOut }`. It copies `srcDir` to a fresh scratch folder owned by `forkling-build`, starts Chromium as that user through `systemd-run` with the properties below, loads `index.html` with the production policy of v3.3 7.4, waits 5 seconds, takes the screenshot, and empties the scratch folder. A single-colour screenshot is `blank`.
- The `systemd-run` properties, all required: `User=forkling-build`, `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `PrivateDevices=yes`, `ReadWritePaths=` the scratch folder only, `IPAddressDeny=any`, `RestrictAddressFamilies=AF_UNIX`, `MemoryMax=1G`, `CPUQuota=100%`, `RuntimeMaxSec=30`, and an empty environment apart from `HOME` and `PATH`. Chromium keeps its own sandbox on (no `--no-sandbox`); if the server's kernel settings block that, stop and tell Roman what the choice is, do not switch it off quietly.
- The existing work check (`builds/work-check.ts`, `browser-check.ts`) is moved onto `runInSandbox`, so works and sessions use one path.
- `apps/mind/src/builds/project-files.ts`: `resolveProjectPath(projectDir, path)` and the file limits of spec-v4 3.1 (extensions, 40 files, 500 KB a file, 2 MB in total, the name rule, no `..`, no absolute path, no symlink, nothing outside `src/`). Pure where it can be.
- On a machine without `systemd-run` (Roman's Windows PC, CI) the function uses the existing in-process browser check and says so in its result (`sandboxed: false`). The server refuses to start a session when `sandboxed` is false.
- `/health` gains `sandbox: ok | missing`, from a self-test at start (the "cannot read" and "cannot connect" tests below, run once).

### Tests first

On any machine:

1. `resolveProjectPath` refuses `../x`, `/etc/passwd`, `src/../../x`, a symlink that points out, a name with a capital or a space, and a `.sh` or `.exe` file.
2. The 41st file, a 501 KB file, and a write that takes the total over 2 MB are each refused with a plain reason.
3. A page that calls `fetch`, opens a `WebSocket`, or loads a script from another host is rejected by the existing static check before it runs.

On the server only (a script `pnpm --filter @forkling/mind sandbox-proof`, which prints a pass or fail line per test and exits non-zero on any fail):

4. A page whose script tries to load an image from `https://example.com` gets nothing, and no packet leaves (the unit's network is denied).
5. A process started as `forkling-build` with the unit's properties cannot read the engine's `.env`, the world repo's `.git/config`, or `/proc/<pid>/environ` of the mind service.
6. It cannot write outside its scratch folder.
7. A page with an endless loop is killed at 30 seconds and the call returns `timedOut`.
8. A page that allocates memory without end is killed at the limit and the mind service keeps running.
9. After any run the scratch folder is empty.

## The server runbook (for Roman, very simple steps)

Write `docs/spec/v4/step-3-runbook.md` in the style of `docs/spec/w7-runbook.md`: numbered steps, one command per step, what he should see after each, and how to undo. It covers: creating the `forkling-build` user with no login shell and no home files; the scratch folder and its owner; the one `sudoers` or polkit line that lets the mind service start the transient unit (as narrow as it can be, written out in full); deploying the engine tag; running `sandbox-proof`; reading `/health`. Roman is new to Linux: no step may assume he knows what a unit, a user or a permission is.

## Do not touch

- Merge's behaviour. This step adds no verb, no prompt text and no price. Merge should not notice it.
- The policy of v3.3 7.4 and the list of forbidden calls in 7.3, except to reuse them.

## Done when

1. Tests 1 to 3 pass in CI.
2. `sandbox-proof` passes on the real server, and its output is pasted into the PR or STATUS.md.
3. `/health` shows `sandbox: ok`.
4. Works made after the deploy still pass their check and show on the site (one live sketch is enough).
5. Roman has followed the runbook himself, start to end, and it worked without help.
