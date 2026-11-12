#!/usr/bin/env bash
# Updates the server to an engine release and restarts the service (spec 14.3). Run it as the deploy user, over SSH, by hand
# or from the `deploy` workflow:
#
#   /opt/forkling/engine/deploy/deploy.sh v0.11.0
#
# The first time, clone the engine into /opt/forkling/engine as the deploy user and run it from there. To go back, deploy
# the tag it printed (it is also kept in ~/previous-tag).
set -euo pipefail

TAG=${1:?usage: deploy.sh vX.Y.Z}
[[ $TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not a release tag: $TAG" >&2; exit 1; }

ENGINE=/opt/forkling/engine
REPO=https://github.com/RomanKuroptev/forkling.git
[ -d "$ENGINE/.git" ] || git clone "$REPO" "$ENGINE"
cd "$ENGINE"

previous=$(git describe --tags --exact-match 2>/dev/null || echo none)
echo "$previous" > "$HOME/previous-tag"

git fetch --tags --force --quiet
git checkout --detach --quiet "refs/tags/$TAG"
pnpm install --frozen-lockfile --filter "@forkling/mind..."
# The browser for the work check, for the Playwright version of this release, in the folder the service reads. It is quick when it is already there.
PLAYWRIGHT_BROWSERS_PATH=/opt/forkling/browsers pnpm --filter @forkling/mind exec playwright install chromium

sudo /usr/local/sbin/forkling-restart "$TAG"

# It counts as deployed once it answers.
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:8787/health" | jq -e '.up' >/dev/null 2>&1; then
    echo "up on $TAG (was $previous)"
    exit 0
  fi
  sleep 2
done
echo "the service did not come up on $TAG. Last log lines:" >&2
journalctl -u forkling-mind -n 30 --no-pager >&2 || true
echo "To go back: deploy.sh $previous" >&2
exit 1
