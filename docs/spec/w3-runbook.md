# W3 runbook: putting the mind on a server

Everything here is yours to do: creating the server, the DNS name, the keys and the cut-over. Nothing in the engine does any of it for you. The code is built and merged (slices 1 to 6 of [`w3-server.md`](w3-server.md)). Read the whole page once before you start.

W3's "done when" is in section 10. Rollback is in section 9.

## What you need

- A Contabo account (or any VPS provider) and an SSH key pair you already use (or make one: `ssh-keygen -t ed25519`).
- A free DuckDNS name, or a domain of your own. The name is one value; the rest of the page calls it `HOST` (for example `merge-mind.duckdns.org`).
- The Anthropic Console, for a workspace of its own with a monthly spend limit, and an API key inside it.
- GitHub: the `gh` CLI logged in as you, and a fine-grained personal access token for the world repo.
- The engine release that has all of W3: `v0.11.0`, tagged on 12 November (section 1). The commands below say `v0.11.0`; use the newest tag instead (`STATUS.md` says which, and `w4-runbook.md` covers what W4 adds to the server).

## 1. The engine release (done)

`v0.11.0` is tagged on the merge commit of the release PR, which changed `FORKLING_REF` from `v0.10.0` to `v0.11.0` in the three template workflows that carry the pin: `mind.yml`, `pages.yml` and `watchdog.yml` (`heartbeat.yml` has none). A test requires them to match. The tag contains `apps/mind/src/watchdog.ts`, which the watchdog fetches from it. Go on to section 2.

Merge's own repo still pins `v0.10.0` and runs the Actions tick. Two things change the day it moves to `v0.11.0` (section 6 or 8), so read them first:

- **Decide and morning calls run at medium effort** (spec 13), where they ran at low. A little more thinking per call; it shows in the ledger.
- **A new world's model cap is $12.51** ($20 minus a guessed $7.49 for the server). **Merge's own `brain/budget.json` keeps `capUsd: 10`** until you change it (section 6).

## 2. Create the server

Merge's server is a **Contabo Cloud VPS 4** (4 vCPU, 8 GB RAM, 100 GB SSD, x86_64) in the Hub Europe location: €6.88 a month including VAT on a 1-month term, plus a one-off €2.50 setup fee. Any VPS with Ubuntu 24.04 on x86_64 works the same way.

1. In the Contabo customer panel, order the VPS: image **Ubuntu 24.04**, 1-month term, and add your **SSH public key** in the order form if it offers one, so root login by key works from the first boot (otherwise add it to `/root/.ssh/authorized_keys` through the panel's console or the emailed password, once). Contabo emails the IPv4 address and hostname when the server is ready (a few minutes).
2. Note the IPv4 address. The page calls it `IP`.
3. **Log in as root with the key, from Windows** (PowerShell or Git Bash, with the key in `~/.ssh`). Use `-o BatchMode=yes` so a missing key fails at once instead of waiting on a password prompt:

   ```bash
   ssh -o BatchMode=yes root@IP 'lsb_release -a; uname -m; free -h; df -h /'
   ```

   Stop if it is not Ubuntu 24.04 on `x86_64`. The first connection asks you to trust the host key (with `BatchMode` it refuses instead: connect once without it, and compare the fingerprint with the panel's if it shows one).
4. **There is no cloud firewall.** Contabo's plain VPS has none, so the firewall that `setup.sh` turns on (`ufw`, opening 22, 80 and 443 only) is the only one. Do not close your session until a second, fresh `ssh -o BatchMode=yes root@IP true` works after `setup.sh` (it switches SSH to keys only).
5. The first invoice shows the real price. If it is not €6.88 with VAT, tell me, or edit `serverUsd` in Merge's `brain/budget.json` (section 6, in dollars). The model cap is $20 minus that.

`setup.sh` upgrades the system, and if `/var/run/reboot-required` exists after it, reboot once (`reboot`) before the cut-over, when nothing is running yet.

## 3. The DNS name

For a DuckDNS name: sign in at duckdns.org, add a domain (say `merge-mind`), and set its IPv4 to `IP`. `HOST` is then `merge-mind.duckdns.org`. For your own domain, add an `A` record from `HOST` to `IP`.

Check that it resolves before you go on (it can take a few minutes):

```bash
nslookup HOST
```

Caddy cannot get a certificate until the name points at the server.

## 4. Set the server up (once)

```bash
ssh root@IP
git clone https://github.com/RomanKuroptev/forkling.git /root/forkling-setup
cd /root/forkling-setup
git checkout v0.11.0
bash deploy/setup.sh HOST
```

`setup.sh` is safe to run again. It:

- installs updates by itself (unattended-upgrades), takes SSH keys only, and opens the firewall for 22, 80 and 443 and nothing else;
- installs Node 24, pnpm (through corepack) and Caddy, and points Caddy at `HOST` with a free certificate;
- makes two users: `forkling` runs the service and owns the world; `deploy` is who GitHub logs in as, owns the engine checkout, and may run exactly one root command (`forkling-restart`), so the deploy key never means root;
- creates `/etc/forkling/mind.env` for the keys (mode 640, empty) and installs the systemd unit `forkling-mind` from a root-owned copy. It does not start it.

If you change `deploy/forkling-mind.service` or `deploy/Caddyfile` later, run `setup.sh` again to install the new copy. Deploys do not touch them, on purpose.

## 5. The keys

**The Anthropic key.** In the Console, make a workspace for Merge and set its **monthly spend limit** (use the model cap, $12.51, or a little over), then create an API key in that workspace. This limit is the second guard behind the budget ledger (spec 11.2).

**The GitHub token.** In GitHub, Settings, Developer settings, Fine-grained tokens: one token, **only** the repository `RomanKuroptev/merge`, with Contents read and write, Pull requests read and write, and Metadata read. No other repository, no organisation access. It lets the server commit and push, and later open build pull requests. It is also sent to `api.github.com` (and nowhere else) so GitHub reads are not limited to 60 an hour.

Put them in the keys file on the server:

```bash
nano /etc/forkling/mind.env
```

```
ANTHROPIC_API_KEY=<the key from the Console>
GITHUB_TOKEN=<the fine-grained token>
FORKLING_PAGES_ORIGIN=https://romankuroptev.github.io
FORKLING_REPO_URL=https://x-access-token:<the same token>@github.com/RomanKuroptev/merge.git
FORKLING_REF=
```

Leave `FORKLING_REF` empty: each deploy fills it in. `FORKLING_PAGES_ORIGIN` must be Merge's Pages address exactly as the browser sends it (scheme and host, no path, no trailing slash): it is the only origin the server answers. If Merge's site is on another address, put that here.

The keys exist only in this file. They are never in a repository.

## 6. The world

Clone Merge's repo where the service expects it, as the `forkling` user, and give it a git identity:

```bash
set -a; . /etc/forkling/mind.env; set +a
sudo -u forkling git clone "$FORKLING_REPO_URL" /var/lib/forkling/world
sudo -u forkling git -C /var/lib/forkling/world config user.name "forkling-mind"
sudo -u forkling git -C /var/lib/forkling/world config user.email "forkling-mind@users.noreply.github.com"
```

Then, from your own machine, in a clone of `RomanKuroptev/merge`, in one commit (this is a change to Merge's repo, so it is yours to make):

- copy the four workflows from the engine's `templates/forkling-world/.github/workflows/` at `v0.11.0` (`mind.yml`, `pages.yml`, `heartbeat.yml` and the new `watchdog.yml`);
- if you want the cap to follow the server price, set `"serverUsd"` and `"capUsd"` in `brain/budget.json` (the two together may not pass 20; for 7.49 the cap is 12.51). Leave them and the cap stays $10.

Do not push it until section 8, step 2, so that nothing starts twice.

## 7. Deploy from GitHub

The `deploy` workflow in the engine repo logs in as the `deploy` user. On your machine:

```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C "forkling-deploy"
ssh-keyscan -t ed25519 HOST
```

Add the public key to the server (as root on the server):

```bash
echo "<contents of deploy_key.pub>" >> /home/deploy/.ssh/authorized_keys
```

In the engine repo (`RomanKuroptev/forkling`), Settings, Secrets and variables, Actions, add four secrets:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `HOST` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | the whole of `deploy_key` (the private half) |
| `DEPLOY_KNOWN_HOSTS` | the line `ssh-keyscan` printed |

Delete `deploy_key` from your machine once it is in the secret.

**The first deploy** is by hand, because the engine is not on the server yet. Log in as `deploy`:

```bash
ssh deploy@HOST
git clone https://github.com/RomanKuroptev/forkling.git /opt/forkling/engine
/opt/forkling/engine/deploy/deploy.sh v0.11.0
```

`deploy.sh` checks out the tag, installs from the lockfile, writes the tag into `FORKLING_REF`, restarts the service and waits for `/health`. That starts the service, so **do section 8 first** if Merge's Actions tick is still running. After this first one, deploys are Actions, then `deploy`, then Run workflow, with the tag.

## 8. The cut-over

Two minds must never write one repo. So:

1. **Before the first deploy**, stop Merge's Actions tick. In Merge's repo (this is a change to it, so it is yours):

   ```bash
   gh workflow disable mind.yml --repo RomanKuroptev/merge
   gh workflow disable heartbeat.yml --repo RomanKuroptev/merge
   ```

   `pages.yml` stays on. From the new pin it also builds every 30 minutes when something changed, since `mind.yml` no longer starts it after a commit.
2. Push the commit from section 6.
3. Deploy (section 7).
4. Check it from your own machine:

   ```bash
   curl -s https://HOST/health
   curl -s https://HOST/now.json
   ```

   `/health` gives `up`, `asleep`, `shouldBeAwake`, `lastThoughtAt`, `lastTickAt` and `warnings`. `/now.json` gives the step, the last thought line and the mood. Watch the log on the server:

   ```bash
   journalctl -u forkling-mind -f
   ```

5. Set the watchdog's address and enable it:

   ```bash
   gh variable set MIND_URL --body "https://HOST" --repo RomanKuroptev/merge
   ```

   Then in Merge's repo, Actions, `watchdog`, Enable workflow (scheduled workflows start off in a repo made from a template).

What does not work after the cut-over, and is not W3's job: a visitor event no longer starts a tick (the viewer's report went to the `mind` workflow), and `POST /notes` answers "the mailbox is closed" until W7. The site does not read `/now.json` yet.

## 9. Rollback

- **A bad deploy.** The deploy prints the tag it replaced, and keeps it in `~/previous-tag` for the `deploy` user. Deploy that one: Actions, deploy, Run workflow, with the old tag. Or on the server, as `deploy`: `/opt/forkling/engine/deploy/deploy.sh <old tag>`.
- **Back to the Actions tick.** On the server: `sudo systemctl stop forkling-mind`. In Merge's repo: `gh workflow enable mind.yml --repo RomanKuroptev/merge` (and `heartbeat.yml` if you used it). Everything is in the repo, so the Actions tick carries on from the last push. The server commits every 15 minutes, so at most 15 minutes of the stream are missing.
- **The disk is lost.** Make a new server with sections 2 to 5 and 7, and start the service: with no world on disk it clones `FORKLING_REPO_URL` itself.
- **Stop and start.** `sudo systemctl stop forkling-mind` finishes the tick in progress and commits (up to 2 minutes). `sudo systemctl start forkling-mind` starts it again.

## 10. W3's "done when" (spec 16)

1. **Thought ticks on time, within 10 seconds.** Over a few hours, in the tick log or the stream: `thought` entries should come every 5 minutes (every 2 from 18:00). A model call blocks the loop while it runs, so a thought can be late by about as long as a decide call. If it is later than 10 seconds often, tell me: the thought tick may need its own lane.
2. **3 live days on the server with no health warnings.** `curl -s https://HOST/health` shows `warnings`; the world's `mind/health.json` has the same list. `push failing` means pushes are failing.
3. **The watchdog fires once in a test stop.** In the waking hours (08:40 to 22:15 Stockholm time):

   ```bash
   ssh root@IP systemctl stop forkling-mind
   gh workflow run watchdog.yml --repo RomanKuroptev/merge
   ```

   The run should fail and GitHub should email you. Then `systemctl start forkling-mind` and run it again: it should pass.
4. **The ledger's Haiku rows compared with spec 13.** The ledger keeps the month's totals per kind of call, so nothing is lost when the list of calls is cut to its last 500. On the server:

   ```bash
   jq '.byKind | to_entries | map({kind: .key, calls: .value.calls, usd: .value.usd, avgInput: ((.value.input + .value.cacheRead + .value.cacheWrite) / .value.calls | floor), avgOutput: (.value.output / .value.calls | floor)})' /var/lib/forkling/world/brain/budget.json
   ```

   Compare each row with the table in spec 13 and correct the table. Paste me the output and I will.

## Troubleshooting

| What you see | What it means |
|---|---|
| Caddy gives no certificate | The name does not point at `IP` yet, or port 80 is blocked. `journalctl -u caddy`. |
| `curl https://HOST/health` gives 502 | Caddy is up and the service is not. `systemctl status forkling-mind`, `journalctl -u forkling-mind -n 50`. |
| The service restarts over and over | Usually a missing key or a world that does not parse. The log says which. |
| `/health` has `push failing` | The token cannot push (wrong repository, wrong permission, or expired). Fix it in `mind.env` and `sudo systemctl restart forkling-mind`. |
| The browser blocks calls to the server | `FORKLING_PAGES_ORIGIN` is not exactly the address the page is served from. |
| `deploy.sh` says the service did not come up | It prints the last log lines and the tag to go back to. |
