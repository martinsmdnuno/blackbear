#!/usr/bin/env bash
#
# Deploy the latest committed code to the Mac mini and rebuild the stack.
# Run this from any dev machine after you've pushed to GitHub:
#
#   ./scripts/deploy.sh
#
# It SSHes into the host, pulls main, and rebuilds the containers. Secrets are
# never touched — they live only in ./config/config.json on the host.
#
# When run on the target host itself (detected by comparing the target IP with
# the local interfaces, or forced with --local), it skips SSH and deploys
# directly.
#
# Override the target with env vars:
#   BLACKBEAR_HOST=user@host  BLACKBEAR_DIR=/path/to/blackbeard  ./scripts/deploy.sh
set -euo pipefail

HOST="${BLACKBEAR_HOST:-nunomartins@192.168.1.134}"
DIR="${BLACKBEAR_DIR:-~/blackbear/blackbeard}"

# A non-interactive SSH session on macOS gets a bare PATH (/usr/bin:/bin:/usr/sbin:
# /sbin), which has no `docker` — Docker Desktop keeps its binaries elsewhere. Without
# this the pull succeeds and the rebuild dies with "command not found: docker".
# Harmless on the local path, and on Linux hosts where docker is already on PATH.
DOCKER_PATH="/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:/opt/homebrew/bin"
export PATH="${DOCKER_PATH}:${PATH}"

TARGET="${HOST#*@}"

LOCAL=false
if [[ "${1:-}" == "--local" ]]; then
  LOCAL=true
fi

is_local_host() {
  # Target matches this machine's hostname...
  [[ "${TARGET}" == "$(hostname)" || "${TARGET}" == "$(hostname -s)" ]] && return 0
  # ...or one of its interface IPs.
  ifconfig 2>/dev/null | awk -v ip="${TARGET}" '$1 == "inet" && $2 == ip { found = 1 } END { exit !found }'
}

if ! ${LOCAL} && is_local_host; then
  LOCAL=true
fi

if ${LOCAL}; then
  echo "🏴‍☠️  Already on ${TARGET} — deploying locally in ${DIR}"
  cd "${DIR/#\~/${HOME}}"
  git pull --ff-only
  docker compose up -d --build
  docker compose ps
else
  echo "🏴‍☠️  Deploying to ${HOST}:${DIR}"
  # Note: if the rebuild ever fails on `docker-credential-desktop`, it's Docker
  # Desktop reaching for the login keychain, which is locked in a non-interactive
  # SSH session. Unlock it in the same command before building:
  #   security unlock-keychain ~/Library/Keychains/login.keychain-db
  ssh "${HOST}" "export PATH=\"${DOCKER_PATH}:\$PATH\" && cd ${DIR} && git pull --ff-only && docker compose up -d --build && docker compose ps"
fi
echo "✅ Done."
