#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-huas}"
REMOTE_DIR="${REMOTE_DIR:-/www/wwwroot/huas-server}"
APP_NAME="${APP_NAME:-huas-server}"
SYNC_DELETE="${SYNC_DELETE:-0}"
BUILD_WEB="${BUILD_WEB:-1}"
INSTALL_WEB_DEPS="${INSTALL_WEB_DEPS:-1}"
INSTALL_SERVER_DEPS="${INSTALL_SERVER_DEPS:-1}"
WEB_PACKAGE_MANAGER="${WEB_PACKAGE_MANAGER:-auto}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$ROOT_DIR/web"
WEB_DIST_DIR="$WEB_DIR/dist"
WEB_PACKAGE_MANAGER_RESOLVED=""
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
  echo "[dry-run] only sync files, skip remote PM2 actions"
fi

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

resolve_web_package_manager() {
  if [[ "$WEB_PACKAGE_MANAGER" != "auto" ]]; then
    WEB_PACKAGE_MANAGER_RESOLVED="$WEB_PACKAGE_MANAGER"
    return
  fi

  if [[ -f "$WEB_DIR/package-lock.json" ]]; then
    WEB_PACKAGE_MANAGER_RESOLVED="npm"
    return
  fi

  if [[ -f "$WEB_DIR/bun.lock" ]]; then
    WEB_PACKAGE_MANAGER_RESOLVED="bun"
    return
  fi

  echo "Could not determine web package manager in $WEB_DIR" >&2
  exit 1
}

install_web_dependencies() {
  case "$WEB_PACKAGE_MANAGER_RESOLVED" in
    npm)
      (
        cd "$WEB_DIR"
        npm ci --include=dev
      )
      ;;
    bun)
      (
        cd "$WEB_DIR"
        bun install --frozen-lockfile
      )
      ;;
    *)
      echo "Unsupported web package manager: $WEB_PACKAGE_MANAGER_RESOLVED" >&2
      exit 1
      ;;
  esac
}

run_web_build() {
  case "$WEB_PACKAGE_MANAGER_RESOLVED" in
    npm)
      (
        cd "$WEB_DIR"
        npm run build
      )
      ;;
    bun)
      (
        cd "$WEB_DIR"
        bun run build
      )
      ;;
    *)
      echo "Unsupported web package manager: $WEB_PACKAGE_MANAGER_RESOLVED" >&2
      exit 1
      ;;
  esac
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
  echo "Using web package manager: $WEB_PACKAGE_MANAGER_RESOLVED"

  if [[ "$INSTALL_WEB_DEPS" == "1" ]]; then
    install_web_dependencies
  fi

  run_web_build

  if [[ ! -f "$WEB_DIST_DIR/index.html" ]]; then
    echo "web build did not produce $WEB_DIST_DIR/index.html" >&2
    exit 1
  fi
}

run_remote_deploy() {
  local remote_script
  remote_script=$(cat <<EOF
set -eu
cd '$REMOTE_DIR'
mkdir -p data logs
test -f './web/dist/index.html'

if [ '$INSTALL_SERVER_DEPS' = '1' ]; then
  bun install --frozen-lockfile --production
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo 'pm2 is not installed on remote host' >&2
  exit 1
fi

if pm2 describe '$APP_NAME' >/dev/null 2>&1; then
  pm2 restart '$APP_NAME'
else
  pm2 start ecosystem.config.cjs --only '$APP_NAME'
fi

pm2 save
pm2 status '$APP_NAME' --no-color
EOF
)

  ssh "$REMOTE_HOST" "$remote_script"
}

require_command rsync
require_command ssh
resolve_web_package_manager

case "$WEB_PACKAGE_MANAGER_RESOLVED" in
  npm)
    require_command npm
    ;;
  bun)
    require_command bun
    ;;
  *)
    echo "Unsupported web package manager: $WEB_PACKAGE_MANAGER_RESOLVED" >&2
    exit 1
    ;;
esac

build_web

echo "Syncing $ROOT_DIR -> $REMOTE_HOST:$REMOTE_DIR"
rsync "${RSYNC_ARGS[@]}" "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

if [[ "$DRY_RUN" == "1" ]]; then
  exit 0
fi

echo "Restarting PM2 app on remote host: $APP_NAME"
run_remote_deploy

echo "Done."
