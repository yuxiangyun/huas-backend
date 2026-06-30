#!/usr/bin/env bash
# [INPUT]: 依赖远端 release 源目录、共享 .env/data/logs 与 nginx/PM2/Bun 运行环境。
# [OUTPUT]: 对外提供蓝绿槽位部署、健康检查、nginx 切流与旧实例整理能力。
# [POS]: scripts 的远端部署内核，被 Git hook 与本地蓝绿脚本共同调用。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/huas-server}"
CONTROL_DIR="${CONTROL_DIR:-$APP_ROOT/.deploy}"
APP_NAME_BASE="${APP_NAME_BASE:-huas-server}"
LEGACY_APP_NAME="${LEGACY_APP_NAME:-$APP_NAME_BASE}"
RELEASE_SOURCE_DIR="${RELEASE_SOURCE_DIR:?RELEASE_SOURCE_DIR is required}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"
INSTALL_SERVER_DEPS="${INSTALL_SERVER_DEPS:-1}"
BUILD_WEB="${BUILD_WEB:-1}"
INSTALL_WEB_DEPS="${INSTALL_WEB_DEPS:-1}"
WEB_PACKAGE_MANAGER="${WEB_PACKAGE_MANAGER:-auto}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"
BLUE_SLOT="${BLUE_SLOT:-blue}"
GREEN_SLOT="${GREEN_SLOT:-green}"
BLUE_PORT="${BLUE_PORT:-3000}"
GREEN_PORT="${GREEN_PORT:-3001}"
ACTIVE_SLOT_FILE="${ACTIVE_SLOT_FILE:-$CONTROL_DIR/active-slot}"
NGINX_BIN="${NGINX_BIN:-/www/server/nginx/sbin/nginx}"
NGINX_CONF="${NGINX_CONF:-/www/server/nginx/conf/nginx.conf}"
NGINX_PROXY_INCLUDE="${NGINX_PROXY_INCLUDE:-/www/server/panel/vhost/nginx/huas-server-active-proxy.inc}"
NGINX_VHOST_FILES="${NGINX_VHOST_FILES:-/www/server/panel/vhost/nginx/api.huas-api.top.conf:/www/server/panel/vhost/nginx/server.huas-api.top.conf}"

RELEASES_DIR="$CONTROL_DIR/releases"
CURRENT_DIR="$CONTROL_DIR/current"
LOGS_DIR="$CONTROL_DIR/logs"
ENV_DIR="$CONTROL_DIR/env"
ECOSYSTEM_DIR="$CONTROL_DIR/ecosystem"

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

slot_port() {
  case "$1" in
    "$BLUE_SLOT") printf '%s\n' "$BLUE_PORT" ;;
    "$GREEN_SLOT") printf '%s\n' "$GREEN_PORT" ;;
    *)
      echo "Unknown slot: $1" >&2
      exit 1
      ;;
  esac
}

slot_app_name() {
  printf '%s-%s\n' "$APP_NAME_BASE" "$1"
}

resolve_web_package_manager() {
  local release_dir="$1"

  if [[ "$BUILD_WEB" != "1" ]]; then
    return
  fi

  if [[ "$WEB_PACKAGE_MANAGER" != "auto" ]]; then
    printf '%s\n' "$WEB_PACKAGE_MANAGER"
    return
  fi

  if [[ -f "$release_dir/web/bun.lock" ]]; then
    printf '%s\n' "bun"
    return
  fi

  if [[ -f "$release_dir/web/package-lock.json" ]]; then
    printf '%s\n' "npm"
    return
  fi

  echo "Could not determine web package manager in $release_dir/web" >&2
  exit 1
}

install_web_dependencies() {
  local release_dir="$1"
  local package_manager="$2"

  case "$package_manager" in
    npm)
      (
        cd "$release_dir/web"
        npm ci --include=dev --registry="$NPM_REGISTRY"
      )
      ;;
    bun)
      (
        cd "$release_dir/web"
        bun install --frozen-lockfile --registry="$NPM_REGISTRY"
      )
      ;;
    *)
      echo "Unsupported web package manager: $package_manager" >&2
      exit 1
      ;;
  esac
}

run_web_build() {
  local release_dir="$1"
  local package_manager="$2"

  case "$package_manager" in
    npm)
      (
        cd "$release_dir/web"
        npm run build
      )
      ;;
    bun)
      (
        cd "$release_dir/web"
        bun run build
      )
      ;;
    *)
      echo "Unsupported web package manager: $package_manager" >&2
      exit 1
      ;;
  esac
}

ensure_nginx_managed() {
  local backup_suffix
  backup_suffix="$(date +%Y%m%d%H%M%S)"

  mkdir -p "$(dirname "$NGINX_PROXY_INCLUDE")"

  IFS=':' read -r -a vhost_files <<<"$NGINX_VHOST_FILES"
  for file_path in "${vhost_files[@]}"; do
    if [[ ! -f "$file_path" ]]; then
      echo "Missing nginx vhost file: $file_path" >&2
      exit 1
    fi

    if grep -F "include $NGINX_PROXY_INCLUDE;" "$file_path" >/dev/null 2>&1; then
      continue
    fi

    cp "$file_path" "${file_path}.bak-${backup_suffix}"
    perl -0pi -e "s@proxy_pass\\s+http://127\\.0\\.0\\.1:\\d+;[^\\n]*@include $NGINX_PROXY_INCLUDE;@g" "$file_path"
  done
}

write_active_proxy() {
  local active_port="$1"
  local temp_file
  temp_file="$(mktemp)"
  printf 'proxy_pass http://127.0.0.1:%s;\n' "$active_port" >"$temp_file"
  mv "$temp_file" "$NGINX_PROXY_INCLUDE"
}

reload_nginx() {
  "$NGINX_BIN" -t -c "$NGINX_CONF"
  "$NGINX_BIN" -s reload -c "$NGINX_CONF"
}

ensure_runtime_env() {
  local slot="$1"
  local port="$2"
  local runtime_env="$ENV_DIR/$slot.env"
  mkdir -p "$ENV_DIR"

  if [[ ! -f "$APP_ROOT/.env" ]]; then
    echo "Missing required remote file: $APP_ROOT/.env" >&2
    exit 1
  fi

  grep -Ev '^(PORT|DEPLOY_SLOT)=' "$APP_ROOT/.env" >"$runtime_env"
  {
    printf '\nPORT=%s\n' "$port"
    printf 'DEPLOY_SLOT=%s\n' "$slot"
  } >>"$runtime_env"

  printf '%s\n' "$runtime_env"
}

attach_runtime_env_to_release() {
  local runtime_env="$1"
  local release_dir="$2"

  # Bun will auto-load .env from cwd; keep a stable link inside each release.
  ln -sfn "$runtime_env" "$release_dir/.env"
}

ensure_pm2_app() {
  local slot="$1"
  local release_link="$2"
  local runtime_env="$3"
  local port="$4"
  local app_name
  app_name="$(slot_app_name "$slot")"
  local logs_path="$LOGS_DIR/$slot"
  local ecosystem_file="$ECOSYSTEM_DIR/$slot.config.cjs"

  mkdir -p "$logs_path" "$ECOSYSTEM_DIR"

  cat >"$ecosystem_file" <<EOF
module.exports = {
  apps: [{
    name: '$app_name',
    cwd: '$release_link',
    script: 'src/index.ts',
    interpreter: 'bun',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    max_memory_restart: '256M',
    kill_timeout: 15000,
    env: {
      NODE_ENV: 'production',
      TIMEZONE: 'Asia/Shanghai',
      TZ: 'Asia/Shanghai',
      PORT: '$port',
      DEPLOY_SLOT: '$slot',
    },
    env_file: '$runtime_env',
    error_file: '$logs_path/pm2-error.log',
    out_file: '$logs_path/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
EOF

  pm2 startOrReload "$ecosystem_file" --only "$app_name" --update-env
}

wait_for_health() {
  local port="$1"
  local url="http://127.0.0.1:$port/health"

  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; then
      echo "Health check passed on $url"
      return 0
    fi
    sleep 1
  done

  echo "Health check failed: $url" >&2
  return 1
}

prepare_release_dir() {
  local slot="$1"
  local release_dir="$2"
  local logs_target="$LOGS_DIR/$slot"

  mkdir -p "$release_dir" "$RELEASES_DIR" "$CURRENT_DIR" "$LOGS_DIR" "$APP_ROOT/data" "$APP_ROOT/reports"
  rsync -az --delete \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='data' \
    --exclude='logs' \
    --exclude='reports' \
    --exclude='node_modules' \
    --exclude='web/node_modules' \
    "$RELEASE_SOURCE_DIR/" "$release_dir/"

  mkdir -p "$logs_target"
  rm -rf "$release_dir/data" "$release_dir/logs" "$release_dir/reports"
  ln -sfn "$APP_ROOT/data" "$release_dir/data"
  ln -sfn "$logs_target" "$release_dir/logs"
  ln -sfn "$APP_ROOT/reports" "$release_dir/reports"
}

active_slot='legacy'
if [[ -f "$ACTIVE_SLOT_FILE" ]]; then
  active_slot="$(tr -d '[:space:]' <"$ACTIVE_SLOT_FILE")"
fi

if [[ "$active_slot" != "$BLUE_SLOT" && "$active_slot" != "$GREEN_SLOT" ]]; then
  active_slot='legacy'
fi

if [[ "$active_slot" == "$BLUE_SLOT" ]]; then
  target_slot="$GREEN_SLOT"
elif [[ "$active_slot" == "$GREEN_SLOT" ]]; then
  target_slot="$BLUE_SLOT"
elif pm2 describe "$LEGACY_APP_NAME" >/dev/null 2>&1; then
  target_slot="$GREEN_SLOT"
else
  target_slot="$BLUE_SLOT"
fi

target_port="$(slot_port "$target_slot")"
target_app_name="$(slot_app_name "$target_slot")"
target_release_dir="$RELEASES_DIR/${RELEASE_ID}-${target_slot}"
target_current_link="$CURRENT_DIR/$target_slot"

require_command rsync
require_command bun
require_command pm2
require_command curl
require_command perl

if [[ "$BUILD_WEB" == "1" ]]; then
  require_command npm
fi

if [[ ! -x "$NGINX_BIN" ]]; then
  echo "Missing nginx binary: $NGINX_BIN" >&2
  exit 1
fi

if [[ "$target_slot" == "$BLUE_SLOT" ]] && pm2 describe "$LEGACY_APP_NAME" >/dev/null 2>&1; then
  if [[ "$active_slot" == "$GREEN_SLOT" ]]; then
    echo "Stopping legacy PM2 app to free port $BLUE_PORT"
    pm2 delete "$LEGACY_APP_NAME" >/dev/null 2>&1 || true
  else
    echo "Legacy PM2 app still owns port $BLUE_PORT while active traffic is not on $GREEN_SLOT" >&2
    exit 1
  fi
fi

prepare_release_dir "$target_slot" "$target_release_dir"

if [[ "$INSTALL_SERVER_DEPS" == "1" ]]; then
  (
    cd "$target_release_dir"
    bun install --frozen-lockfile --production --registry="$NPM_REGISTRY"
  )
fi

if [[ "$BUILD_WEB" == "1" ]]; then
  web_package_manager="$(resolve_web_package_manager "$target_release_dir")"
  if [[ "$INSTALL_WEB_DEPS" == "1" ]]; then
    install_web_dependencies "$target_release_dir" "$web_package_manager"
  fi
  run_web_build "$target_release_dir" "$web_package_manager"
  if [[ ! -f "$target_release_dir/web/dist/index.html" ]]; then
    echo "web build did not produce $target_release_dir/web/dist/index.html" >&2
    exit 1
  fi
fi

ln -sfn "$target_release_dir" "$target_current_link"
runtime_env="$(ensure_runtime_env "$target_slot" "$target_port")"
attach_runtime_env_to_release "$runtime_env" "$target_release_dir"
ensure_pm2_app "$target_slot" "$target_current_link" "$runtime_env" "$target_port"
wait_for_health "$target_port"

ensure_nginx_managed
write_active_proxy "$target_port"
reload_nginx
printf '%s\n' "$target_slot" >"$ACTIVE_SLOT_FILE"
pm2 save >/dev/null

if [[ "$active_slot" == 'legacy' ]] && pm2 describe "$LEGACY_APP_NAME" >/dev/null 2>&1; then
  echo "Legacy PM2 app $LEGACY_APP_NAME is still running on $BLUE_PORT with no traffic; it will be removed on the first deploy back to $BLUE_SLOT."
fi

echo "Active slot switched to $target_slot on port $target_port"
pm2 status "$target_app_name" --no-color
