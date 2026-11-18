# Step 3 runbook: the sandbox on the server

This page sets up the sandbox of [`step-3-sandbox.md`](step-3-sandbox.md) on Merge's server. Every page Merge writes will then run in headless Chromium as a separate user, `forkling-build`. That user has no login, no network, 1 GB of memory, one CPU and 30 seconds per run. It cannot see the engine, the world or the keys.

**Who runs it.** The coordinator (Claude Code on Roman's PC) runs it over SSH as root, under rule 8 of "Decided ahead" in [`parallel-plan.md`](parallel-plan.md). Roman can run it the same way. Each step is one command. Run the command, compare what it prints with **You should see**, and go on only if it matches. **On the first surprise, stop.** Then undo with that step's **Undo** and the steps before it, in reverse order, and tell Roman. Write every command and its output into `docs/spec/v4/lanes/server-log.md` (make the file if it is not there yet).

**What this page never does.** It does not print, copy or change a key, a token or `/etc/forkling/mind.env`. It does not touch the firewall, SSH or any existing user. It never uses `rm -rf`. Chromium's own sandbox stays on. If the browser will not start inside the unit, stop and ask Roman. Do not loosen the unit or the kernel to make it start.

**When to run it.** Run it after the release that carries step 3's code (R1) is deployed with the `deploy` workflow as usual. Run it while Merge is asleep or between ticks: step 9 restarts the mind, and a stop waits up to 2 minutes for a tick in progress.

## Words used here

- **Unit:** a program that `systemd` (Linux's service manager) starts and watches, with limits written in a small text file.
- **Socket:** a door in the file system (`/run/forkling-sandbox.sock`). The mind knocks on it to ask for one page to be run. `systemd` then starts one sandboxed run for that knock, with the limits in `forkling-sandbox@.service`.
- **User:** a Linux account. Files and processes belong to a user, and a user can only read what it is allowed to.
- **Root:** the account allowed to do everything. The SSH login below is root.

## 0. Log in and look before changing anything

Log in from Roman's PC:

```bash
ssh root@merge-mind.duckdns.org
```

**0.1** Check that the mind is running.

```bash
systemctl is-active forkling-mind
```

You should see: `active`.

**0.2** Check that the release with step 3 is the one deployed. `TAG` below is that release (for example `v0.17.0`).

```bash
sudo -u deploy git -C /opt/forkling/engine describe --tags --exact-match
```

You should see the tag of the release, for example `v0.17.0`. If you see an older tag, stop: deploy the release first (Actions, `deploy`, Run workflow).

**0.3** Check that the checkout has no local changes in `deploy/`. The unit files are copied from there in step 4.

```bash
sudo -u deploy git -C /opt/forkling/engine status --porcelain -- deploy/
```

You should see: nothing (an empty line). Anything listed means a file in the checkout was changed by hand. Stop.

**0.4** Check that the deploy put the runner in place.

```bash
ls -l /opt/forkling/sandbox/current && ls /opt/forkling/sandbox/current/
```

You should see `current -> releases/<TAG>`, then `node_modules  package.json  runner.ts`.

**0.5** Check what `/health` says now.

```bash
curl -s http://127.0.0.1:8787/health | jq '{up, sandbox}'
```

You should see `"up": true` and `"sandbox": "missing"`: the code knows about the sandbox, but the unit is not there yet.

**0.6** Check that nothing of the sandbox exists yet.

```bash
id forkling-build; ls /etc/systemd/system/ | grep forkling-sandbox; ls -d /var/lib/forkling-build
```

You should see `id: 'forkling-build': no such user`, nothing from `grep`, and `ls: cannot access '/var/lib/forkling-build': No such file or directory`. If any of them exist, someone ran part of this page before. Stop and read `lanes/server-log.md`.

Undo for step 0: nothing, it only looked.

## 1. The user `forkling-build`

**1.1** Create the user and its group. It gets no login shell, no home folder and no password.

```bash
useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin forkling-build
```

You should see: nothing.

**1.2** Check the user.

```bash
getent passwd forkling-build
```

You should see one line that ends in `:/nonexistent:/usr/sbin/nologin`, for example `forkling-build:x:996:996::/nonexistent:/usr/sbin/nologin` (the numbers may differ).

Undo for step 1: `userdel forkling-build` (this also removes its group). Expected: nothing printed.

## 2. The scratch folder

**2.1** Create the parent folder. It belongs to root and can be read by everyone.

```bash
install -d -m 755 -o root -g root /var/lib/forkling-build
```

You should see: nothing.

**2.2** Create the scratch folder. `forkling-build` may write in it. The mind's group `forkling` may only look inside, which the proof uses to check that it is empty.

```bash
install -d -m 750 -o forkling-build -g forkling /var/lib/forkling-build/scratch
```

You should see: nothing.

**2.3** Check both folders.

```bash
stat -c '%U:%G %a %n' /var/lib/forkling-build /var/lib/forkling-build/scratch
```

You should see:

```
root:root 755 /var/lib/forkling-build
forkling-build:forkling 750 /var/lib/forkling-build/scratch
```

Undo for step 2: `rmdir /var/lib/forkling-build/scratch /var/lib/forkling-build`. Expected: nothing printed. If `rmdir` says the folder is not empty, run `find /var/lib/forkling-build/scratch -mindepth 1 -delete` first.

## 3. Read the two unit files before installing them

**3.1** Read the socket file.

```bash
cat /opt/forkling/engine/deploy/forkling-sandbox.socket
```

You should see the `[Socket]` section with exactly these lines: `ListenStream=/run/forkling-sandbox.sock`, `SocketUser=root`, `SocketGroup=forkling`, `SocketMode=0660`, `Accept=yes`, `MaxConnections=1`.

**3.2** Read the service file.

```bash
cat /opt/forkling/engine/deploy/forkling-sandbox@.service
```

You should see, among its lines:
- `User=forkling-build`, `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `PrivateDevices=yes`
- `ReadWritePaths=/var/lib/forkling-build/scratch`
- `InaccessiblePaths=/opt/forkling/engine /var/lib/forkling /etc/forkling`, `ProtectProc=invisible`
- `IPAddressDeny=any`, `RestrictAddressFamilies=AF_UNIX`
- `MemoryMax=1G`, `MemorySwapMax=0`, `CPUQuota=100%`, `RuntimeMaxSec=30`
- `Environment=HOME=/var/lib/forkling-build/scratch` and `Environment=PATH=/usr/bin:/bin`, and no other `Environment` line
- `ExecStart=/usr/bin/node /opt/forkling/sandbox/current/runner.ts --browsers /opt/forkling/browsers --scratch /var/lib/forkling-build/scratch`
- `ExecStopPost=/usr/bin/find /var/lib/forkling-build/scratch -mindepth 1 -delete`

No `--no-sandbox` anywhere. If anything differs, stop.

Undo for step 3: nothing, it only read.

## 4. Install the unit files (root-owned copies)

**4.1** Copy the socket file into systemd's folder as a root-owned copy.

```bash
install -m 0644 -o root -g root /opt/forkling/engine/deploy/forkling-sandbox.socket /etc/systemd/system/forkling-sandbox.socket
```

You should see: nothing.

**4.2** Copy the service file the same way.

```bash
install -m 0644 -o root -g root '/opt/forkling/engine/deploy/forkling-sandbox@.service' '/etc/systemd/system/forkling-sandbox@.service'
```

You should see: nothing.

**4.3** Check that the copies are the files you read in step 3.

```bash
cmp /opt/forkling/engine/deploy/forkling-sandbox.socket /etc/systemd/system/forkling-sandbox.socket && cmp '/opt/forkling/engine/deploy/forkling-sandbox@.service' '/etc/systemd/system/forkling-sandbox@.service' && stat -c '%U:%G %a %n' /etc/systemd/system/forkling-sandbox.socket '/etc/systemd/system/forkling-sandbox@.service'
```

You should see:

```
root:root 644 /etc/systemd/system/forkling-sandbox.socket
root:root 644 /etc/systemd/system/forkling-sandbox@.service
```

**4.4** Tell systemd about the new files.

```bash
systemctl daemon-reload
```

You should see: nothing.

Undo for step 4: `rm /etc/systemd/system/forkling-sandbox.socket '/etc/systemd/system/forkling-sandbox@.service' && systemctl daemon-reload`. Expected: nothing printed. Each `rm` removes one named file; there is no `-r` and no `-f`.

## 5. Open the socket

**5.1** Start the socket now, and at every boot.

```bash
systemctl enable --now forkling-sandbox.socket
```

You should see: `Created symlink /etc/systemd/system/sockets.target.wants/forkling-sandbox.socket → /etc/systemd/system/forkling-sandbox.socket.`

**5.2** Check that it is listening.

```bash
systemctl is-active forkling-sandbox.socket
```

You should see: `active`.

**5.3** Check who may use it.

```bash
stat -c '%U:%G %a %F %n' /run/forkling-sandbox.sock
```

You should see: `root:forkling 660 socket /run/forkling-sandbox.sock`.

Undo for step 5: `systemctl disable --now forkling-sandbox.socket`. Expected: `Removed "/etc/systemd/system/sockets.target.wants/forkling-sandbox.socket".` The mind does not use the socket until step 9's restart, so nothing changes for Merge until then.

## 6. Run the proof

**6.1** Run `sandbox-proof` as the mind's user. It asks the unit, through the socket, to run five pages and four probes. It prints one PASS or FAIL line per test and never prints a file's contents or an environment value. It takes about one to two minutes.

```bash
cd /opt/forkling/engine/apps/mind && sudo -u forkling env HOME=/var/lib/forkling node src/sandbox-proof.ts; echo "exit $?"
```

You should see 8 lines that start with `PASS`, each followed by a detail line, then `sandbox-proof: all 8 passed` and `exit 0`:

```
PASS 0 the browser starts in the unit, as forkling-build, with its own sandbox on and no key in its environment
PASS 0 a page that draws runs and is photographed
PASS 4 a page gets nothing from example.com, and the unit cannot open any connection
PASS 5 it cannot read the keys file, the world's .git/config, the mind's /proc environ or the engine
PASS 6 it cannot write outside its scratch folder
PASS 7 a page with an endless loop is stopped and the call returns timedOut
PASS 8 a page that takes memory without end is stopped, the mind keeps running, and the next run works
PASS 9 after the runs the scratch folder is empty
```

The environment names on the first detail line are names only. Expect `HOME`, `PATH`, `TMPDIR` and a few that systemd adds itself (`USER`, `LOGNAME`, `SHELL`, `INVOCATION_ID`, `SYSTEMD_EXEC_PID` and the like). If a name looks like a key (`KEY`, `TOKEN`, `SECRET`), test 0 fails by itself.

Test 5 names the real paths: `/etc/forkling/mind.env`, `/var/lib/forkling/world/.git/config`, `/proc/<pid of forkling-mind>/environ` and `/opt/forkling/engine/package.json`. Its detail line must say `missing from here: []`. That proves the files exist, so "could not read" is a real refusal and not a missing file.

Paste the whole output into `lanes/server-log.md`. Step 3's "done when" asks for it.

**If a line says FAIL, stop.** Read the reason on its detail line. Then read the last lines of the runs' own log; it holds no keys:

```bash
journalctl -u 'forkling-sandbox@*' -n 40 --no-pager
```

- **Test 0 fails with "No usable sandbox", "Operation not permitted" or a namespace error.** Chromium's own sandbox is blocked inside the unit. Do not add `--no-sandbox` and do not change the kernel. Undo step 5 and ask Roman.
- **The log names an address family, or `socket()` fails with `Address family not supported`** (for example Chromium wanting `AF_NETLINK`). Do not widen `RestrictAddressFamilies`. Undo step 5 and ask Roman.
- **Any other FAIL.** Undo step 5, copy the output into the log, and tell Roman.

Undo for step 6: nothing to undo. The proof changes nothing; its probe files are created only in the scratch folder, which is emptied after each run.

## 7. The scratch folder after the proof

**7.1** Check that the scratch folder is empty.

```bash
ls -A /var/lib/forkling-build/scratch | wc -l
```

You should see: `0`.

Undo for step 7: nothing.

## 8. Choose the moment

**8.1** Check whether Merge is asleep. The restart in step 9 is best done then, or between ticks.

```bash
curl -s http://127.0.0.1:8787/health | jq '{asleep, lastTickAt}'
```

You should see `"asleep": true`, or a `lastTickAt` within the last minute. Either is fine. A restart waits for a tick in progress to finish (up to 2 minutes).

## 9. Restart the mind so it runs its self-test

**9.1** Restart the mind.

```bash
systemctl restart forkling-mind
```

You should see: nothing. It can take up to 2 minutes when a tick was running.

**9.2** Check what the self-test found.

```bash
journalctl -u forkling-mind -n 40 --no-pager | grep 'sandbox:'
```

You should see: `sandbox: ok`. If you see `sandbox: missing (...)`, the reasons are in the brackets. The mind then goes on checking works in its own process, as before this page, so Merge is not harmed. Undo step 5 and tell Roman.

**9.3** Check `/health` from the server.

```bash
curl -s http://127.0.0.1:8787/health | jq '{up, sandbox}'
```

You should see `"up": true` and `"sandbox": "ok"`.

**9.4** Check `/health` from outside, through Caddy.

```bash
curl -s https://merge-mind.duckdns.org/health | jq .sandbox
```

You should see: `"ok"`.

Undo for step 9: undo step 5, then `systemctl restart forkling-mind`. `/health` then says `sandbox: missing`, and works are checked in the mind's own process, as before.

## 10. After: one live sketch

**10.1** The next sketch Merge makes is checked in the sandbox. When one has been made (the tick log or `/workshop/` shows it), check that the unit ran it:

```bash
journalctl -u 'forkling-sandbox@*' --since today --no-pager | grep -c 'Started'
```

You should see a number above 0. The sketch must also show on the site after the next Pages build. Step 3's "done when", item 4, asks for that.

## 11. ffmpeg, for the projects' timelapse video

After each build session the mind makes a short vertical video of the project's screenshots (sharing S4). It draws the frames itself and hands them to `ffmpeg`, a standard video tool from Ubuntu's own packages. `ffmpeg` never runs anything Merge wrote. Without it, no video is made, and the project page simply has no video link. This step is independent of the sandbox: it can be run at any time, and Merge does not need to be asleep.

**11.1** Install it.

```bash
apt-get install -y ffmpeg
```

You should see apt list the packages it adds and end without an error. The last lines look like `Setting up ffmpeg (7:6.1.1-3ubuntu5) ...` and `Processing triggers for libc-bin ...`; the version may differ.

**11.2** Check that it runs for the mind's user.

```bash
sudo -u forkling ffmpeg -hide_banner -version | head -1
```

You should see one line that starts with `ffmpeg version`.

Undo for step 11: `apt-get remove -y ffmpeg`. Expected: apt lists `ffmpeg` as removed and ends without an error. Videos already made stay where they are; new ones are skipped.

## Undo everything, in one place

Run these in this order, from the top down. Each is one step's undo from above:

1. `systemctl disable --now forkling-sandbox.socket`
2. `systemctl restart forkling-mind`, then `curl -s http://127.0.0.1:8787/health | jq .sandbox` should say `"missing"`
3. `rm /etc/systemd/system/forkling-sandbox.socket '/etc/systemd/system/forkling-sandbox@.service' && systemctl daemon-reload`
4. `find /var/lib/forkling-build/scratch -mindepth 1 -delete` (only if it is not empty), then `rmdir /var/lib/forkling-build/scratch /var/lib/forkling-build`
5. `userdel forkling-build`
6. `apt-get remove -y ffmpeg` (step 11, if it was run)

`/opt/forkling/sandbox` belongs to the deploy user and holds only the runner and `playwright-core` of each release. It is harmless and is left in place. The next deploy updates it.

## Troubleshooting

| What you see | What it means |
|---|---|
| `sandbox-proof` says `FAIL all: there is no sandbox socket` | Step 5 did not run, or the socket is stopped: `systemctl status forkling-sandbox.socket`. |
| Test 0: `no answer: is forkling-sandbox.socket running, and is the runner deployed?` | The run starts and ends without an answer. Read `journalctl -u 'forkling-sandbox@*' -n 40 --no-pager`: a missing `/opt/forkling/sandbox/current/runner.ts` means the deploy of step 0.4 did not put it there. |
| The sandbox cannot be reached (`EACCES`) | The mind's user is not in the socket's group. Check step 5.3 (`root:forkling 660`). |
| `sandbox: missing (it could read ...)` in the mind's log | The unit can see a file it must not. Stop: undo step 5 and tell Roman. |
| A work is scrapped with "the page crashed the browser" | The work took more than 1 GB, or more than 30 seconds. This is the sandbox working; the reason is in the scrap bin. |
