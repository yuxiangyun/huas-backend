#!/usr/bin/env bash
# [INPUT]: 依赖本地 Bash 与 deploy-huas-zero-downtime.sh，接收历史快速发布参数并映射到维护发布。
# [OUTPUT]: 对外提供保留文件名的维护发布别名，唯一委托受停流与 destructive migration 门禁保护的远端链路。
# [POS]: scripts 的历史入口适配器，不再保留可绕过维护窗口的单进程重载实现。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-baidu}"
REMOTE_DIR="${REMOTE_DIR:-/www/wwwroot/huas-server}"
APP_NAME="${APP_NAME:-huas-server}"
INSTALL_SERVER_DEPS="${INSTALL_SERVER_DEPS:-1}"
BUILD_WEB="${BUILD_WEB:-1}"
INSTALL_WEB_DEPS="${INSTALL_WEB_DEPS:-1}"
WEB_PACKAGE_MANAGER="${WEB_PACKAGE_MANAGER:-auto}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

if [[ "$DRY_RUN" == "1" ]]; then
  cat <<EOF
[dry-run] maintenance release alias
  remote: $REMOTE_HOST
  app root: $REMOTE_DIR
  app name: $APP_NAME
  executor: $SCRIPT_DIR/deploy-huas-zero-downtime.sh
No files uploaded and no remote process or traffic state changed.
EOF
  exit 0
fi

echo "deploy-huas.sh now executes the maintenance release workflow; a service window is required."

REMOTE_HOST="$REMOTE_HOST" \
APP_ROOT="$REMOTE_DIR" \
APP_NAME_BASE="$APP_NAME" \
INSTALL_SERVER_DEPS="$INSTALL_SERVER_DEPS" \
BUILD_WEB="$BUILD_WEB" \
INSTALL_WEB_DEPS="$INSTALL_WEB_DEPS" \
WEB_PACKAGE_MANAGER="$WEB_PACKAGE_MANAGER" \
NPM_REGISTRY="$NPM_REGISTRY" \
RELEASE_MODE=maintenance \
exec "$SCRIPT_DIR/deploy-huas-zero-downtime.sh"
