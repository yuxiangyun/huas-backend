#!/usr/bin/env bash
# [INPUT]: 依赖本地 rsync/ssh 与百度服务器 .deploy 控制目录。
# [OUTPUT]: 对外提供本地工作区快照的维护发布入口，上传 release 并委托远端停流、快照、迁移与冒烟门禁。
# [POS]: scripts 的本地维护发布编排器，保留历史文件名但不再承诺零停机。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-baidu}"
APP_ROOT="${APP_ROOT:-/www/wwwroot/huas-server}"
CONTROL_DIR="${CONTROL_DIR:-$APP_ROOT/.deploy}"
APP_NAME_BASE="${APP_NAME_BASE:-huas-server}"
INSTALL_SERVER_DEPS="${INSTALL_SERVER_DEPS:-1}"
BUILD_WEB="${BUILD_WEB:-1}"
INSTALL_WEB_DEPS="${INSTALL_WEB_DEPS:-1}"
WEB_PACKAGE_MANAGER="${WEB_PACKAGE_MANAGER:-auto}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"
RELEASE_MODE="${RELEASE_MODE:-maintenance}"

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

if [[ "$RELEASE_MODE" != "maintenance" ]]; then
  echo "Unsupported release mode: $RELEASE_MODE" >&2
  exit 1
fi

cleanup_incoming() {
  ssh "$REMOTE_HOST" "rm -rf '$REMOTE_INCOMING_DIR'" >/dev/null 2>&1 || true
}

trap cleanup_incoming EXIT

echo "Uploading maintenance release snapshot to $REMOTE_HOST:$REMOTE_INCOMING_DIR"
ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_INCOMING_DIR'"
rsync "${RSYNC_ARGS[@]}" "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_INCOMING_DIR/"

echo "Starting maintenance release; production traffic and writers will be stopped before migration"
ssh "$REMOTE_HOST" \
  "APP_ROOT='$APP_ROOT' CONTROL_DIR='$CONTROL_DIR' APP_NAME_BASE='$APP_NAME_BASE' RELEASE_SOURCE_DIR='$REMOTE_INCOMING_DIR' RELEASE_ID='$RELEASE_ID' INSTALL_SERVER_DEPS='$INSTALL_SERVER_DEPS' BUILD_WEB='$BUILD_WEB' INSTALL_WEB_DEPS='$INSTALL_WEB_DEPS' WEB_PACKAGE_MANAGER='$WEB_PACKAGE_MANAGER' NPM_REGISTRY='$NPM_REGISTRY' RELEASE_MODE='$RELEASE_MODE' bash '$REMOTE_INCOMING_DIR/scripts/remote-blue-green-deploy.sh'"

echo "Maintenance release finished and traffic is open on the verified target slot."
