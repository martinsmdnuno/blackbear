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
  ssh "${HOST}" "cd ${DIR} && git pull --ff-only && docker compose up -d --build && docker compose ps"
fi
echo "✅ Done."
