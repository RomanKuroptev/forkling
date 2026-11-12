#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server for the forkling mind (spec 11.2, 14.3). Run it as root, from a clone of the
# engine that root owns (a throwaway one in /root is fine):
#
#   sudo bash deploy/setup.sh merge-mind.duckdns.org
#
# It does not start the service: the keys go into /etc/forkling/mind.env first (docs/spec/w3-runbook.md). Safe to run again.
set -euo pipefail

HOST=${1:?usage: setup.sh <host name, e.g. merge-mind.duckdns.org>}
[ "$(id -u)" = 0 ] || { echo "run this as root" >&2; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get -y upgrade
apt-get -y install unattended-upgrades ufw git curl jq ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

# System updates install by themselves.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# SSH takes keys only.
cat > /etc/ssh/sshd_config.d/10-forkling.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh

# The firewall opens SSH and the two web ports and nothing else.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Node 24 (the repository's .nvmrc) and pnpm, which comes through corepack from the engine's packageManager field.
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get -y install nodejs
corepack enable

# Caddy, from its own repository, for HTTPS.
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get -y install caddy

# Two users. `forkling` runs the service and owns the world. `deploy` is who GitHub Actions logs in as: it owns the engine
# checkout and may run one root command, forkling-restart, so a deploy key never means root.
id forkling >/dev/null 2>&1 || useradd --system --home-dir /var/lib/forkling --shell /usr/sbin/nologin forkling
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
# It may read the service's log, to show it when a deploy does not come up.
usermod -aG systemd-journal deploy
mkdir -p /opt/forkling/engine /var/lib/forkling /etc/forkling /home/deploy/.ssh
chown -R deploy:deploy /opt/forkling
chown -R forkling:forkling /var/lib/forkling
chmod 755 /opt/forkling /opt/forkling/engine
chmod 700 /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

install -m 755 -o root -g root "$HERE/forkling-restart" /usr/local/sbin/forkling-restart
echo 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/forkling-restart' > /etc/sudoers.d/forkling-deploy
chmod 440 /etc/sudoers.d/forkling-deploy
visudo -cf /etc/sudoers.d/forkling-deploy

# Chromium, for the work check (spec 7.3): a work is opened in a real browser before it goes up. The system libraries it needs
# come from the Playwright version the engine pins (keep this the same as apps/mind/package.json; a test holds them together).
# The browsers themselves are fetched by each deploy, as the deploy user, into one shared folder the service reads.
PLAYWRIGHT_VERSION=1.65.0
npx --yes "playwright@$PLAYWRIGHT_VERSION" install-deps chromium
mkdir -p /opt/forkling/browsers
chown deploy:deploy /opt/forkling/browsers
chmod 755 /opt/forkling/browsers

# Ubuntu 24.04 stops an ordinary program making the user namespace that Chromium's own sandbox is built on. The pages it opens are
# written by a model, so the browser's sandbox is never switched off: this profile allows the user namespace for the browsers in that
# one folder and for nothing else, instead of loosening the whole machine.
if command -v apparmor_parser >/dev/null 2>&1; then
  cat > /etc/apparmor.d/forkling-chromium <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile forkling-chromium /opt/forkling/browsers/**/{chrome,chrome-headless-shell} flags=(unconfined) {
  userns,

  include if exists <local/forkling-chromium>
}
EOF
  apparmor_parser -r /etc/apparmor.d/forkling-chromium
fi

# The keys file: filled in by hand, never in a repository.
if [ ! -f /etc/forkling/mind.env ]; then
  cat > /etc/forkling/mind.env <<'EOF'
ANTHROPIC_API_KEY=
GITHUB_TOKEN=
FORKLING_PAGES_ORIGIN=https://romankuroptev.github.io
FORKLING_REPO_URL=
FORKLING_REF=
EOF
fi
chown root:forkling /etc/forkling/mind.env
chmod 640 /etc/forkling/mind.env

# HTTPS for the host, and the service itself, both from root-owned copies.
sed "s/__HOST__/$HOST/" "$HERE/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy
install -m 644 -o root -g root "$HERE/forkling-mind.service" /etc/systemd/system/forkling-mind.service
systemctl daemon-reload
systemctl enable forkling-mind

echo "Done. Next: put the keys in /etc/forkling/mind.env, add the deploy key to /home/deploy/.ssh/authorized_keys, clone the world and deploy a release. See docs/spec/w3-runbook.md."
