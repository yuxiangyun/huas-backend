#!/usr/bin/env bash
# [INPUT]: 依赖本机 ssh/sqlite3/tar、远端 Bun/tar、共享 .env/DB_PATH 与当前 release 的 db-snapshot 命令。
# [OUTPUT]: 对外提供生产 SQLite、Discover 媒体、Community 头像与 Messaging 媒体的成组本机备份，不复制日志或环境配置。
# [POS]: scripts 的轻量异地业务数据备份入口，复用远端 VACUUM INTO 内核并以受控媒体目录白名单隔离运行日志。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$PROJECT_ROOT/../.." && pwd)"
BACKUP_ROOT="$WORKSPACE_ROOT/backups"

REMOTE_HOST="${REMOTE_HOST:-baidu}"
APP_ROOT="${APP_ROOT:-/www/wwwroot/huas-server}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-$BACKUP_ROOT/database}"
LOCAL_MEDIA_BACKUP_DIR="${LOCAL_MEDIA_BACKUP_DIR:-$BACKUP_ROOT/media}"
BACKUP_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_ID="local-$BACKUP_TIMESTAMP"
DATABASE_BACKUP_PATH="$LOCAL_BACKUP_DIR/huas-$BACKUP_TIMESTAMP.db"
MEDIA_BACKUP_PATH="$LOCAL_MEDIA_BACKUP_DIR/huas-$BACKUP_TIMESTAMP-media.tar.gz"
BUNDLE_PARTIAL=""
EXTRACT_DIR=""
MEDIA_PARTIAL=""

usage() {
  cat <<'EOF'
Usage: scripts/backup-data-local.sh

Create a consistent remote SQLite snapshot and copy the associated Discover,
Community avatar, and Messaging media to this computer. Logs and runtime
configuration are never included.

Environment variables:
  REMOTE_HOST            SSH target (default: baidu)
  APP_ROOT               Remote app root (default: /www/wwwroot/huas-server)
  LOCAL_BACKUP_DIR       Local database destination (default: <workspace>/backups/database)
  LOCAL_MEDIA_BACKUP_DIR Local media destination (default: <workspace>/backups/media)
EOF
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required local command: $command_name" >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "$BUNDLE_PARTIAL" && -f "$BUNDLE_PARTIAL" ]]; then
    rm -f "$BUNDLE_PARTIAL"
  fi
  if [[ -n "$EXTRACT_DIR" && -d "$EXTRACT_DIR" ]]; then
    rm -rf "$EXTRACT_DIR"
  fi
  if [[ -n "$MEDIA_PARTIAL" && -f "$MEDIA_PARTIAL" ]]; then
    rm -f "$MEDIA_PARTIAL"
  fi
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$#" -ne 0 ]]; then
  usage >&2
  exit 2
fi

require_command ssh
require_command sqlite3
require_command tar

mkdir -p "$BACKUP_ROOT" "$LOCAL_BACKUP_DIR" "$LOCAL_MEDIA_BACKUP_DIR"
if [[ -e "$DATABASE_BACKUP_PATH" ]]; then
  echo "Refusing to overwrite existing database backup: $DATABASE_BACKUP_PATH" >&2
  exit 1
fi
if [[ -e "$MEDIA_BACKUP_PATH" ]]; then
  echo "Refusing to overwrite existing media backup: $MEDIA_BACKUP_PATH" >&2
  exit 1
fi

BUNDLE_PARTIAL="$(mktemp "$BACKUP_ROOT/.huas-$BACKUP_TIMESTAMP.bundle.XXXXXX")"
EXTRACT_DIR="$(mktemp -d "$BACKUP_ROOT/.huas-$BACKUP_TIMESTAMP.extract.XXXXXX")"
MEDIA_PARTIAL="$(mktemp "$LOCAL_MEDIA_BACKUP_DIR/.huas-$BACKUP_TIMESTAMP.media.XXXXXX")"
trap cleanup EXIT

printf -v REMOTE_COMMAND 'bash -s -- %q %q' "$APP_ROOT" "$BACKUP_ID"

echo "Creating database and media backup on $REMOTE_HOST..."
ssh "$REMOTE_HOST" "$REMOTE_COMMAND" >"$BUNDLE_PARTIAL" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

app_root="$1"
backup_id="$2"
remote_temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/huas-data-backup.XXXXXX")"
bundle_dir="$remote_temp_dir/bundle"

cleanup_remote() {
  rm -rf "$remote_temp_dir"
}
trap cleanup_remote EXIT

require_remote_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required remote command: $command_name" >&2
    exit 1
  fi
}

resolve_runtime_path() {
  local path_value="$1"

  if [[ "$path_value" == /* ]]; then
    printf '%s\n' "$path_value"
  else
    printf '%s/%s\n' "$app_root" "${path_value#./}"
  fi
}

stage_media_directory() {
  local archive_name="$1"
  local source_path="$2"
  local archive_path="$bundle_dir/media/$archive_name"

  if [[ -d "$source_path" ]]; then
    ln -s "$source_path" "$archive_path"
  else
    mkdir "$archive_path"
    echo "Remote media directory does not exist; backing up an empty $archive_name/: $source_path" >&2
  fi
}

require_remote_command bun
require_remote_command tar

if [[ ! -f "$app_root/.env" ]]; then
  echo "Missing remote runtime env: $app_root/.env" >&2
  exit 1
fi

active_slot=""
if [[ -f "$app_root/.deploy/active-slot" ]]; then
  active_slot="$(tr -d '[:space:]' <"$app_root/.deploy/active-slot")"
fi

snapshot_script="$app_root/scripts/db-snapshot.ts"
if [[ -n "$active_slot" && -f "$app_root/.deploy/current/$active_slot/scripts/db-snapshot.ts" ]]; then
  snapshot_script="$app_root/.deploy/current/$active_slot/scripts/db-snapshot.ts"
fi

if [[ ! -f "$snapshot_script" ]]; then
  echo "Could not find remote db-snapshot.ts under the active release or app root" >&2
  exit 1
fi

unset DB_PATH DISCOVER_STORAGE_ROOT COMMUNITY_AVATAR_STORAGE_ROOT
set -a
# shellcheck disable=SC1090
. "$app_root/.env"
set +a

database_path="$(resolve_runtime_path "${DB_PATH:-./data/huas.db}")"
database_dir="$(dirname "$database_path")"
discover_storage_root="$(resolve_runtime_path "${DISCOVER_STORAGE_ROOT:-$database_dir/discover}")"
community_avatar_storage_root="$(resolve_runtime_path "${COMMUNITY_AVATAR_STORAGE_ROOT:-$database_dir/treehole-avatars}")"
messaging_media_storage_root="$database_dir/message-media"

(
  cd "$app_root"
  bun "$snapshot_script" \
    --db "$database_path" \
    --output-dir "$remote_temp_dir" \
    --release "$backup_id" >&2
)

snapshot_path="$(find "$remote_temp_dir" -maxdepth 1 -type f -name '*.db' -print -quit)"
if [[ -z "$snapshot_path" ]]; then
  echo "Remote snapshot command did not produce a database file" >&2
  exit 1
fi

mkdir -p "$bundle_dir/media"
ln -s "$snapshot_path" "$bundle_dir/database.db"
stage_media_directory discover "$discover_storage_root"
stage_media_directory treehole-avatars "$community_avatar_storage_root"
stage_media_directory message-media "$messaging_media_storage_root"

tar --dereference -czf - -C "$bundle_dir" database.db media
REMOTE_SCRIPT

if [[ ! -s "$BUNDLE_PARTIAL" ]]; then
  echo "Downloaded backup bundle is empty" >&2
  exit 1
fi

tar -tzf "$BUNDLE_PARTIAL" >/dev/null
tar -xzf "$BUNDLE_PARTIAL" -C "$EXTRACT_DIR"

if [[ ! -f "$EXTRACT_DIR/database.db" ]]; then
  echo "Backup bundle does not contain database.db" >&2
  exit 1
fi
for media_dir in discover treehole-avatars message-media; do
  if [[ ! -d "$EXTRACT_DIR/media/$media_dir" ]]; then
    echo "Backup bundle does not contain media/$media_dir" >&2
    exit 1
  fi
done

quick_check="$(sqlite3 "$EXTRACT_DIR/database.db" 'PRAGMA quick_check;')"
if [[ "$quick_check" != "ok" ]]; then
  echo "Local SQLite quick_check failed: $quick_check" >&2
  exit 1
fi

tar -czf "$MEDIA_PARTIAL" -C "$EXTRACT_DIR" media
tar -tzf "$MEDIA_PARTIAL" >/dev/null

chmod 600 "$EXTRACT_DIR/database.db" "$MEDIA_PARTIAL"
mv "$EXTRACT_DIR/database.db" "$DATABASE_BACKUP_PATH"
mv "$MEDIA_PARTIAL" "$MEDIA_BACKUP_PATH"
MEDIA_PARTIAL=""

echo "Database backup complete: $DATABASE_BACKUP_PATH"
echo "Media backup complete: $MEDIA_BACKUP_PATH"
