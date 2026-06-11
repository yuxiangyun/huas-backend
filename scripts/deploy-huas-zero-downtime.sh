#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-baidu}"
APP_ROOT="${APP_ROOT:-/www/wwwroot/huas-server}"
CONTROL_DIR="${CONTROL_DIR:-$APP_ROOT/.deploy}"
APP_NAME_BASE="${APP_NAME_BASE:-huas-server}"
INSTALL_SERVER_DEPS="${INSTALL_SERVER_DEPS:-1}"
BUILD_WEB="${BUILD_WEB:-1}"
INSTALL_WEB_DEPS="${INSTALL_WEB_DEPS:-1}"
WEB_PACKAGE_MANAGER="${WEB_PACKAGE_MANAGER:-bun}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
REMOTE_INCOMING_DIR="$CONTROL_DIR/incoming/manual-$RELEASE_ID"

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

RSYNC_ARGS=(
  -az
  --delete
  --no-owner
  --no-group
  --exclude=.git
  --exclude=.claude
  --exclude=node_modules
  --exclude=data
  --exclude=logs
  --exclude=.env
  --exclude=.env.*
  --exclude=.DS_Store
  --exclude=coverage
  --exclude=web/node_modules
  --exclude=web/*.tsbuildinfo
)

require_command rsync
require_command ssh

echo "Uploading release snapshot to $REMOTE_HOST:$REMOTE_INCOMING_DIR"
ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_INCOMING_DIR'"
rsync "${RSYNC_ARGS[@]}" "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_INCOMING_DIR/"

echo "Deploying inactive slot and switching traffic"
ssh "$REMOTE_HOST" \
  "APP_ROOT='$APP_ROOT' CONTROL_DIR='$CONTROL_DIR' APP_NAME_BASE='$APP_NAME_BASE' RELEASE_SOURCE_DIR='$REMOTE_INCOMING_DIR' RELEASE_ID='$RELEASE_ID' INSTALL_SERVER_DEPS='$INSTALL_SERVER_DEPS' BUILD_WEB='$BUILD_WEB' INSTALL_WEB_DEPS='$INSTALL_WEB_DEPS' WEB_PACKAGE_MANAGER='$WEB_PACKAGE_MANAGER' bash '$REMOTE_INCOMING_DIR/scripts/remote-blue-green-deploy.sh'"

ssh "$REMOTE_HOST" "rm -rf '$REMOTE_INCOMING_DIR'"

echo "Zero-downtime deploy finished."
