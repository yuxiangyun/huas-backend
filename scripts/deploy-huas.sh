#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-huas}"
REMOTE_DIR="${REMOTE_DIR:-/www/wwwroot/huas-server}"
APP_NAME="${APP_NAME:-huas-server}"
SYNC_DELETE="${SYNC_DELETE:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RSYNC_ARGS=(
  -az
  --stats
  --exclude=.git
  --exclude=.claude
  --exclude=node_modules
  --exclude=data
  --exclude=logs
  --exclude=.env
  --exclude=.DS_Store
)

if [[ "$SYNC_DELETE" == "1" ]]; then
  RSYNC_ARGS+=(--delete --delete-excluded)
fi

if [[ "${1:-}" == "--dry-run" ]]; then
  RSYNC_ARGS+=(--dry-run)
  echo "[dry-run] rsync only, no restart"
fi

echo "Deploying $ROOT_DIR -> $REMOTE_HOST:$REMOTE_DIR"
rsync "${RSYNC_ARGS[@]}" "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

if [[ "${1:-}" == "--dry-run" ]]; then
  exit 0
fi

echo "Installing deps and restarting PM2 app: $APP_NAME"
ssh "$REMOTE_HOST" "cd '$REMOTE_DIR' && bun install --frozen-lockfile --production && pm2 restart '$APP_NAME' && pm2 status '$APP_NAME' --no-color"

echo "Done."
