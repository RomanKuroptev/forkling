# W4 runbook: the workshop on the server

The code is built and merged (slices 1 to 12 of [`w4-workshop.md`](w4-workshop.md)). Nothing here has been done to the server or to `RomanKuroptev/merge`: they are yours. This page is for the day W3 is live (the server runs Merge, see [`w3-runbook.md`](w3-runbook.md)) and you want Merge to make works.

Without the server nothing changes. The tinker verb makes sketches and asks for full works only where there is a browser to check them in, and the Actions tick has none: there a tinker step rests and says so.

## 1. The release (a stop, and yours)

1. A release PR changes `FORKLING_REF` to the new tag (the page calls it `v0.12.0`) in the four template workflows that carry it: `mind.yml`, `pages.yml`, `watchdog.yml` and `validate.yml`. A test requires them to match.
2. Once it is merged, tag that merge commit. The tag has to contain the new pins and `apps/mind/src/validate-pr.ts` (the validator in `validate.yml` is fetched from it), so tag after the PR, never before.

Read before you tag: the system prompt changed in three places during W4, and its golden file with it. `git diff v0.11.0 -- apps/mind/test/golden/system.txt` shows them:

- "Wandering, writing, resting and making things really happen" (it used to say tinker steps run as rest);
- the tinker line: a sketch is made at once, a full work is built by the workshop and arrives later, and you hear when it is done;
- the same line: a target may be the id of one of its own works, to remix it, put it away (with a reason, at most 2 a week) or bring it back.

## 2. The server

On the server as root (safe to run again; it changes only what is new):

```bash
cd /root/forkling-setup
git fetch --tags && git checkout v0.12.0
bash deploy/setup.sh HOST
```

New in `setup.sh`: the system libraries Chromium needs (installed with the Playwright version the engine pins), `/opt/forkling/browsers` for the browsers, and an AppArmor profile that lets Chromium make the user namespace its own sandbox is built on, for the browsers in that one folder only. The sandbox is never switched off: the pages it opens are written by a model. The unit file gets `PLAYWRIGHT_BROWSERS_PATH`, so `setup.sh` has to be run again for it to take effect.

Then deploy the release (Actions, `deploy`, Run workflow, with the tag; or `/opt/forkling/engine/deploy/deploy.sh v0.12.0` as `deploy`). Each deploy also fetches the browser for that release's Playwright version.

**Check the browser starts for the service user.** I wrote the profile from Ubuntu's documentation and could not try it: this machine is Windows. So this step is the test:

```bash
sudo -u forkling env PLAYWRIGHT_BROWSERS_PATH=/opt/forkling/browsers HOME=/var/lib/forkling \
  node -e "import('/opt/forkling/engine/apps/mind/node_modules/playwright/index.mjs').then(async ({ chromium }) => { const b = await chromium.launch(); console.log('chromium', b.version()); await b.close() })"
```

It should print `chromium` and a version. If it says the sandbox cannot start (a "No usable sandbox" or "user namespaces" message), tell me. The fallback is one line, `sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`, which loosens a protection for the whole machine; I would rather fix the profile than ship that.

## 3. Merge's repository

In a clone of `RomanKuroptev/merge` (this is a change to it, so it is yours), in one commit:

- copy the workflows from the engine's `templates/forkling-world/.github/workflows/` at the new tag: `mind.yml`, `pages.yml`, `watchdog.yml` and the new **`validate.yml`**, with the new pins (`heartbeat.yml` has none);
- if `brain/budget.json` should follow the server's real price, set `serverUsd` and `capUsd` (the two together may not pass 20).

Then check the repository's settings once:

- **Actions, General, Workflow permissions: read and write.** `validate.yml` merges a work with the workflow's own token; it asks for `contents` and `pull-requests` write itself, but the repository default must not forbid it.
- **`main` must not require reviews or other checks for a pull request from a `work/` branch.** If it is protected, the merge step fails and the work waits for you. (`validate.yml` is itself the check.)
- The token in `/etc/forkling/mind.env` is the one from the W3 runbook (Contents and Pull requests, read and write, on this repository only). Opening a pull request with it starts `validate.yml`; a pull request opened with the workflow's own token would not.
- Pages is on (it was for W2), and `pages.yml` now also builds every 30 minutes, so a new work is on the site within half an hour of it landing.

## 4. Try it

A sketch needs no help: when a plan has a tinker step with size sketch, it is made, checked and committed with the loop's next push (within 15 minutes), and is on the site after the next Pages build.

A full work can be tried on purpose, at a cost of about $0.16 to $0.30 (a Sonnet call of about 20K tokens in and 12K out, and a repair if the first page fails its check). On the server as `forkling`, put a request in the world:

```bash
sudo -u forkling tee /var/lib/forkling/world/mind/builds/tinker-20261201-0900.json >/dev/null <<'EOF'
{"id":"tinker-20261201-0900","kind":"tinker","requestedAt":"2026-12-01T08:00:00.000Z","idea":"a small clock that tells the time by how full a pool is","reason":"a first work, to see that the path holds","remixOf":null}
EOF
```

Within a minute the worker picks it up. You will see, in order: a branch `work/<id>` and a pull request in Merge's repository; the `validate` run on it (a browser check, then a merge); the result in `mind/builds/<id>.result.json`; the next tick booking its cost and waking one decide call; and, after the next Pages build, the work on `/workshop/`. If the request is older than 48 hours with no result it is closed as failed.

## 5. W4's "done when" (spec 16)

Proved by tests, with no live week needed:

- **A work that calls `fetch` is rejected:** `apps/mind/test/work-check.test.ts` (the static check) and the browser check's own tests.
- **A shelved work loads its library and cannot reach the network:** `apps/mind/test/browser/work-check.test.ts` and, through the real site build, `apps/mind/test/browser/site-workshop.test.ts`.
- **Every route built so far renders from the template world:** `apps/site/test/workshop.test.ts` (and the template world renders `/workshop/` and `/feed.xml`).

Needs the live week, once the server runs the release:

1. **At least 2 works pass the check** and are on the shelf (`/workshop/`, or `works/<id>/meta.json` with `"status": "shelf"`).
2. **A sketch appears on at least 5 days** (the strip on `/workshop/` shows it).
3. **The ledger's Sonnet rows are compared with spec 13.** On the server:

   ```bash
   jq '.byKind | with_entries(select(.key == "tinker" or .key == "repair" or .key == "sketch" or .key == "rework")) | to_entries | map({kind: .key, calls: .value.calls, usd: .value.usd, avgInput: ((.value.input + .value.cacheRead + .value.cacheWrite) / .value.calls | floor), avgOutput: (.value.output / .value.calls | floor)})' /var/lib/forkling/world/brain/budget.json
   ```

   Spec 13 expects a tinker at about 20K in and 12K out on Sonnet, a repair the same, a sketch at about 6K in and 3K out on Haiku. Paste me the output and I will correct the table.

## Troubleshooting

| What you see | What it means |
|---|---|
| A tinker step "rested" with "no browser" in the notes | The browser did not start for the service. Run the check in section 2. |
| A job stays in `mind/builds/` with no result | No browser, or no key, so the worker waits and spends nothing. `journalctl -u forkling-mind -n 50`. |
| A `work/<id>` pull request is open and not merged | Open its `validate` run: every problem is an error annotation. Or the repository settings in section 3 forbid the merge. |
| The work is merged but not on the site | Pages builds every 30 minutes; run `pages` by hand to hurry it. |
| `/workshop/` shows the work but the frame is blank | Open the work's page and the browser console: the page may load a library path the site does not serve (`lib/` has p5, Tone and three). |
| A work should not be on the shelf | Revert its merge commit in Merge's repository; the site drops it at the next build. Or let Merge put it away (a tinker step on its id). |
