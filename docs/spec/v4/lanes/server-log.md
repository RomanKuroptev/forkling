# Server log: step 3 runbook

Run by the coordinator over SSH (root@merge-mind.duckdns.org) on 18 November 2026, after R1 (v0.17.0) was deployed, under rule 8 of "Decided ahead". Each command from `step-3-runbook.md` and its output, in order.

**0.1** (18:53Z)

```
$ systemctl is-active forkling-mind
Host key verification failed.
[exit 255]
```

Note: `ssh root@merge-mind.duckdns.org` gave "Host key verification failed" because known_hosts holds the server under its IP. merge-mind.duckdns.org resolves to 5.189.149.243, and the keys it offers have the same fingerprints as the known ones (ED25519 SHA256:PGiZqH7GjqZBASXuCykWx9ExAkrG6sGgWJxiStZy+lM), so the log-in is `ssh root@5.189.149.243`. No SSH setting was changed.

**0.1** (18:54Z)

```
$ systemctl is-active forkling-mind
active
[exit 0]
```

**0.2** (18:54Z)

```
$ sudo -u deploy git -C /opt/forkling/engine describe --tags --exact-match
v0.17.0
[exit 0]
```

**0.3** (18:54Z)

```
$ sudo -u deploy git -C /opt/forkling/engine status --porcelain -- deploy/

[exit 0]
```

**0.4** (18:54Z)

```
$ ls -l /opt/forkling/sandbox/current && ls /opt/forkling/sandbox/current/
ls: cannot access '/opt/forkling/sandbox/current': No such file or directory
[exit 2]
```

**0.5** (18:54Z)

```
$ curl -s http://127.0.0.1:8787/health | jq '{up, sandbox}'
{
  "up": true,
  "sandbox": "missing"
}
[exit 0]
```

**0.6** (18:54Z)

```
$ id forkling-build; ls /etc/systemd/system/ | grep forkling-sandbox; ls -d /var/lib/forkling-build
id: ‘forkling-build’: no such user
ls: cannot access '/var/lib/forkling-build': No such file or directory
[exit 2]
```

**Stopped at 0.4** (first surprise): `/opt/forkling/sandbox/current` does not exist. Nothing was changed on the server (steps 0.1 to 0.6 only read), so there is nothing to undo. Likely cause: the deploy of v0.17.0 ran `deploy/deploy.sh` from the v0.16.0 checkout, and the sandbox-runner section is new in v0.17.0, so it did not run. Waiting for Roman.

Roman chose: deploy v0.17.0 again (deploy.yml run 44387563008), then go on from step 0.

**0.1** (20:07Z)

```
$ systemctl is-active forkling-mind
active
[exit 0]
```

**0.2** (20:07Z)

```
$ sudo -u deploy git -C /opt/forkling/engine describe --tags --exact-match
v0.17.0
[exit 0]
```

**0.3** (20:07Z)

```
$ sudo -u deploy git -C /opt/forkling/engine status --porcelain -- deploy/

[exit 0]
```

**0.4** (20:07Z)

```
$ ls -l /opt/forkling/sandbox/current && ls /opt/forkling/sandbox/current/
lrwxrwxrwx 1 deploy deploy 16 Nov 18 21:07 /opt/forkling/sandbox/current -> releases/v0.17.0
node_modules
package.json
runner.ts
[exit 0]
```

**0.5** (20:07Z)

```
$ curl -s http://127.0.0.1:8787/health | jq '{up, sandbox}'
{
  "up": true,
  "sandbox": "missing"
}
[exit 0]
```

**0.6** (20:07Z)

```
$ id forkling-build; ls /etc/systemd/system/ | grep forkling-sandbox; ls -d /var/lib/forkling-build
id: ‘forkling-build’: no such user
ls: cannot access '/var/lib/forkling-build': No such file or directory
[exit 2]
```

**1.1** (20:07Z)

```
$ useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin forkling-build

[exit 0]
```

**1.2** (20:07Z)

```
$ getent passwd forkling-build
forkling-build:x:995:986::/nonexistent:/usr/sbin/nologin
[exit 0]
```

**2.1** (20:07Z)

```
$ install -d -m 755 -o root -g root /var/lib/forkling-build

[exit 0]
```

**2.2** (20:07Z)

```
$ install -d -m 750 -o forkling-build -g forkling /var/lib/forkling-build/scratch

[exit 0]
```

**2.3** (20:07Z)

```
$ stat -c '%U:%G %a %n' /var/lib/forkling-build /var/lib/forkling-build/scratch
root:root 755 /var/lib/forkling-build
forkling-build:forkling 750 /var/lib/forkling-build/scratch
[exit 0]
```

**3.1** (20:07Z)

```
$ cat /opt/forkling/engine/deploy/forkling-sandbox.socket
# The sandbox's door (spec v4 section 4, step 3). The mind (group forkling) connects here to have one page run in headless
# Chromium; systemd starts one forkling-sandbox@.service for each connection, with the limits written in that file, as the user
# forkling-build. The mind gets no privilege from this: it can only ask for a run, and every property of the run is fixed by root.
# Installed by root from the deployed release (docs/spec/v4/step-3-runbook.md, or setup.sh on a fresh server).
[Unit]
Description=Forkling sandbox socket (one page run at a time, in a unit with no network)

[Socket]
ListenStream=/run/forkling-sandbox.sock
SocketUser=root
SocketGroup=forkling
SocketMode=0660
Accept=yes
MaxConnections=1

[Install]
WantedBy=sockets.target
[exit 0]
```

**3.2** (20:08Z)

```
$ cat '/opt/forkling/engine/deploy/forkling-sandbox@.service'
# One run in the sandbox (spec v4 section 4, step 3): started by forkling-sandbox.socket for one connection from the mind. It
# reads one request from the connection, runs the page in headless Chromium (its own sandbox on), writes one answer and ends.
# The page's files come in the request and are served from memory; nothing Merge wrote is run by Node or a shell.
#
# Every property below is required by step 3. Do not widen one to make Chromium start: if it does not, stop and ask Roman.
# Installed by root from the deployed release (docs/spec/v4/step-3-runbook.md, or setup.sh on a fresh server).
[Unit]
Description=Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s)

[Service]
Type=simple
User=forkling-build
Group=forkling-build
StandardInput=socket
StandardOutput=socket
StandardError=journal
ExecStart=/usr/bin/node /opt/forkling/sandbox/current/runner.ts --browsers /opt/forkling/browsers --scratch /var/lib/forkling-build/scratch
# The scratch folder is emptied after every run, a killed one too (this runs after a timeout or an out-of-memory kill as well).
ExecStopPost=/usr/bin/find /var/lib/forkling-build/scratch -mindepth 1 -delete
# An environment with HOME and PATH only: no key, no token and no secret is ever in it.
Environment=HOME=/var/lib/forkling-build/scratch
Environment=PATH=/usr/bin:/bin

NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ReadWritePaths=/var/lib/forkling-build/scratch
# The engine, the world (its .git holds the remote) and the keys file are not even visible.
InaccessiblePaths=/opt/forkling/engine /var/lib/forkling /etc/forkling
# Other users' processes (the mind's /proc/<pid>/environ) are hidden.
ProtectProc=invisible
# No network at all: no address is allowed, and no socket but a local one can even be made.
IPAddressDeny=any
RestrictAddressFamilies=AF_UNIX
MemoryMax=1G
MemorySwapMax=0
CPUQuota=100%
RuntimeMaxSec=30
[exit 0]
```

**4.1** (20:08Z)

```
$ install -m 0644 -o root -g root /opt/forkling/engine/deploy/forkling-sandbox.socket /etc/systemd/system/forkling-sandbox.socket

[exit 0]
```

**4.2** (20:08Z)

```
$ install -m 0644 -o root -g root '/opt/forkling/engine/deploy/forkling-sandbox@.service' '/etc/systemd/system/forkling-sandbox@.service'

[exit 0]
```

**4.3** (20:08Z)

```
$ cmp /opt/forkling/engine/deploy/forkling-sandbox.socket /etc/systemd/system/forkling-sandbox.socket && cmp '/opt/forkling/engine/deploy/forkling-sandbox@.service' '/etc/systemd/system/forkling-sandbox@.service' && stat -c '%U:%G %a %n' /etc/systemd/system/forkling-sandbox.socket '/etc/systemd/system/forkling-sandbox@.service'
root:root 644 /etc/systemd/system/forkling-sandbox.socket
root:root 644 /etc/systemd/system/forkling-sandbox@.service
[exit 0]
```

**4.4** (20:08Z)

```
$ systemctl daemon-reload

[exit 0]
```

**5.1** (20:08Z)

```
$ systemctl enable --now forkling-sandbox.socket
Created symlink /etc/systemd/system/sockets.target.wants/forkling-sandbox.socket → /etc/systemd/system/forkling-sandbox.socket.
[exit 0]
```

**5.2** (20:08Z)

```
$ systemctl is-active forkling-sandbox.socket
active
[exit 0]
```

**5.3** (20:08Z)

```
$ stat -c '%U:%G %a %F %n' /run/forkling-sandbox.sock
root:forkling 660 socket /run/forkling-sandbox.sock
[exit 0]
```

**6.1** (20:08Z)

```
$ cd /opt/forkling/engine/apps/mind && sudo -u forkling env HOME=/var/lib/forkling node src/sandbox-proof.ts; echo "exit $?"
FAIL 0 the unit answers a probe
     no answer: is forkling-sandbox.socket running, and is the runner deployed?
FAIL 0 a page that draws runs and is photographed
     rendered false, screenshot none, blank false, errors []
FAIL 4 a page gets nothing from example.com, and the unit cannot open any connection
     image: []; connections opened: no probe answer
FAIL 5 it cannot read the keys file, the world's .git/config, the mind's /proc environ or the engine
     targets: /etc/forkling/mind.env, /var/lib/forkling/world/.git/config, /proc/60543/environ, /opt/forkling/engine/package.json; missing from here: []; readable from the unit: no probe answer
FAIL 6 it cannot write outside its scratch folder
     written outside: no probe answer; scratch writable: false
FAIL 7 a page with an endless loop is stopped and the call returns timedOut
     timedOut false, after 0 s
FAIL 8 a page that takes memory without end is stopped, the mind keeps running, and the next run works
     crashed true, timedOut false, errors [], after 0 s; mind active: true; next run drew: false
PASS 9 after the runs the scratch folder is empty
     left: []
sandbox-proof: 7 of 8 failed
exit 1
[exit 0]
```

**6.log** (20:08Z)

```
$ journalctl -u 'forkling-sandbox@*' -n 40 --no-pager
Nov 18 21:08:26 vmi3750658 systemd[1]: Started forkling-sandbox@0-61864-997.service - Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s) (PID 61864/UID 997).
Nov 18 21:08:27 vmi3750658 systemd[1]: forkling-sandbox@0-61864-997.service: Deactivated successfully.
Nov 18 21:08:27 vmi3750658 systemd[1]: Started forkling-sandbox@1-61864-997.service - Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s) (PID 61864/UID 997).
Nov 18 21:08:27 vmi3750658 systemd[1]: forkling-sandbox@1-61864-997.service: Deactivated successfully.
Nov 18 21:08:27 vmi3750658 systemd[1]: Started forkling-sandbox@2-61864-997.service - Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s) (PID 61864/UID 997).
Nov 18 21:08:28 vmi3750658 systemd[1]: forkling-sandbox@2-61864-997.service: Deactivated successfully.
Nov 18 21:08:28 vmi3750658 systemd[1]: Started forkling-sandbox@3-61864-997.service - Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s) (PID 61864/UID 997).
Nov 18 21:08:28 vmi3750658 systemd[1]: forkling-sandbox@3-61864-997.service: Deactivated successfully.
Nov 18 21:08:28 vmi3750658 systemd[1]: Started forkling-sandbox@4-61864-997.service - Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s) (PID 61864/UID 997).
Nov 18 21:08:28 vmi3750658 systemd[1]: forkling-sandbox@4-61864-997.service: Deactivated successfully.
Nov 18 21:08:28 vmi3750658 systemd[1]: Started forkling-sandbox@5-61864-997.service - Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s) (PID 61864/UID 997).
Nov 18 21:08:29 vmi3750658 systemd[1]: forkling-sandbox@5-61864-997.service: Deactivated successfully.
Nov 18 21:08:29 vmi3750658 systemd[1]: Started forkling-sandbox@6-61864-997.service - Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s) (PID 61864/UID 997).
Nov 18 21:08:29 vmi3750658 systemd[1]: forkling-sandbox@6-61864-997.service: Deactivated successfully.
Nov 18 21:08:29 vmi3750658 systemd[1]: Started forkling-sandbox@7-61864-997.service - Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s) (PID 61864/UID 997).
Nov 18 21:08:30 vmi3750658 systemd[1]: forkling-sandbox@7-61864-997.service: Deactivated successfully.
Nov 18 21:08:30 vmi3750658 systemd[1]: Started forkling-sandbox@8-61864-997.service - Forkling sandbox run (headless Chromium as forkling-build, no network, 1 GB, 30 s) (PID 61864/UID 997).
Nov 18 21:08:30 vmi3750658 systemd[1]: forkling-sandbox@8-61864-997.service: Deactivated successfully.
[exit 0]
```

**undo-5** (20:08Z)

```
$ systemctl disable --now forkling-sandbox.socket
Removed "/etc/systemd/system/sockets.target.wants/forkling-sandbox.socket".
[exit 0]
```

**check** (20:08Z)

```
$ systemctl is-active forkling-sandbox.socket; systemctl is-active forkling-mind; curl -s http://127.0.0.1:8787/health | jq '{up, sandbox}'
inactive
active
{
  "up": true,
  "sandbox": "missing"
}
[exit 0]
```

**Stopped at 6.1:** 7 of 8 tests failed with "no answer". The runs' journal shows each run start and end ("Deactivated successfully") within a second, with nothing on stderr. Step 5 was undone as the runbook says (socket disabled and inactive); `/health` is `up: true, sandbox: missing`, as before. Steps 1 to 4 are left in place (user `forkling-build`, `/var/lib/forkling-build/scratch`, the two unit files in `/etc/systemd/system/`); they do nothing while the socket is off.

Likely cause, found in the code (not on the server): `sandbox-runner.ts` runs `main()` only when `fileURLToPath(import.meta.url) === process.argv[1]`. The unit starts `/opt/forkling/sandbox/current/runner.ts`, and `current` is a symlink to `releases/v0.17.0`. Node resolves the main module's symlink, so `import.meta.url` is the `releases/v0.17.0` path and `argv[1]` is the `current` path. They differ, `main()` never runs, and the process exits 0 without reading the request or answering. That matches the journal. Fix: compare against `realpathSync(process.argv[1])` (lane B), a patch release, a deploy, then this runbook again from step 5.
