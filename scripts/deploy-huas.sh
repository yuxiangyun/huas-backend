#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-huas}"
REMOTE_DIR="${REMOTE_DIR:-/www/wwwroot/huas-server}"
APP_NAME="${APP_NAME:-huas-server}"
SYNC_DELETE="${SYNC_DELETE:-0}"
BUILD_WEB="${BUILD_WEB:-1}"
INSTALL_WEB_DEPS="${INSTALL_WEB_DEPS:-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$ROOT_DIR/web"
WEB_DIST_DIR="$WEB_DIR/dist"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

RSYNC_ARGS=(
  -az
  --stats
  --exclude=.git
  --exclude=.claude
  --exclude=node_modules
  --exclude=tests
  --exclude=data
  --exclude=logs
  --exclude=.env
  --exclude=.env.*
  --exclude=.DS_Store
  --exclude=coverage
  --exclude=web/node_modules
  --exclude=web/*.tsbuildinfo
)

if [[ "$SYNC_DELETE" == "1" ]]; then
  RSYNC_ARGS+=(--delete --delete-excluded)
fi

if [[ "$DRY_RUN" == "1" ]]; then
  RSYNC_ARGS+=(--dry-run)
  echo "[dry-run] rsync only, no restart"
fi

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

build_web() {
  if [[ "$BUILD_WEB" != "1" ]]; then
    echo "Skipping web build (BUILD_WEB=$BUILD_WEB)"
    return
  fi

  if [[ ! -d "$WEB_DIR" ]]; then
    echo "web/ directory not found: $WEB_DIR" >&2
    exit 1
  fi

  echo "Building web app in $WEB_DIR"

  if [[ "$INSTALL_WEB_DEPS" == "1" ]]; then
    (
      cd "$WEB_DIR"
      bun install --frozen-lockfile
    )
  fi

  (
    cd "$WEB_DIR"
    bun run build
  )

  if [[ ! -f "$WEB_DIST_DIR/index.html" ]]; then
    echo "web build did not produce $WEB_DIST_DIR/index.html" >&2
    exit 1
  fi
}

require_command bun
require_command rsync
require_command ssh

build_web

echo "Deploying $ROOT_DIR -> $REMOTE_HOST:$REMOTE_DIR"
rsync "${RSYNC_ARGS[@]}" "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

if [[ "$DRY_RUN" == "1" ]]; then
  exit 0
fi

echo "Installing deps and restarting PM2 app: $APP_NAME"
ssh "$REMOTE_HOST" "cd '$REMOTE_DIR' && test -f './web/dist/index.html' && bun install --frozen-lockfile --production && pm2 restart '$APP_NAME' && pm2 status '$APP_NAME' --no-color"

echo "Done."
