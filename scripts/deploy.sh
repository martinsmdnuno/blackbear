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
# Override the target with env vars:
#   BLACKBEAR_HOST=user@host  BLACKBEAR_DIR=/path/to/blackbeard  ./scripts/deploy.sh
set -euo pipefail

HOST="${BLACKBEAR_HOST:-nunomartins@192.168.1.134}"
DIR="${BLACKBEAR_DIR:-~/Desktop/blackbear/blackbeard}"

echo "🏴‍☠️  Deploying to ${HOST}:${DIR}"
ssh "${HOST}" "cd ${DIR} && git pull --ff-only && docker compose up -d --build && docker compose ps"
echo "✅ Done."
