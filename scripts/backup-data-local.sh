#!/usr/bin/env bash
# [INPUT]: 依赖本机 ssh/sqlite3/tar、远端 Bun/tar、共享 .env 中数据库与三类可配置媒体根，以及当前 release 的 db-snapshot 命令。
# [OUTPUT]: 对外提供生产 SQLite、四类社交媒体与首页弹窗配置/海报的白名单成组本机备份。
# [POS]: scripts 的轻量异地业务数据备份入口，复用远端 VACUUM INTO 内核并在解压前校验固定 tar 条目边界，排除日志与环境配置。
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
Community avatar, Treehole post, Messaging media, and index-popup settings/media
to this computer. Logs and environment configuration are never included.

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

assert_bundle_archive_whitelist() {
  local archive_path="$1"
  local entry normalized_entry

  while IFS= read -r entry; do
    normalized_entry="${entry#./}"
    if [[ "$normalized_entry" == /* || "/$normalized_entry/" == *"/../"* ]]; then
      echo "Backup bundle contains an unsafe archive entry: $entry" >&2
      exit 1
    fi

    case "$normalized_entry" in
      database.db|media|media/|\
      media/discover|media/discover/*|\
      media/treehole-avatars|media/treehole-avatars/*|\
      media/treehole-post-media|media/treehole-post-media/*|\
      media/message-media|media/message-media/*|\
      media/index-popup|media/index-popup/*)
        ;;
      *)
        echo "Backup bundle contains a non-whitelisted archive entry: $entry" >&2
        exit 1
        ;;
    esac
  done < <(tar -tzf "$archive_path")
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
  local absolute_path

  if [[ "$path_value" == /* ]]; then
    absolute_path="$path_value"
  else
    absolute_path="$app_root/${path_value#./}"
  fi

  readlink -m -- "$absolute_path"
}

assert_safe_media_root() {
  local label="$1"
  local source_path="$2"

  if [[ "$source_path" != /* || "$source_path" == "/" || "$source_path" == "$app_root" \
    || "$app_root" == "$source_path"/* || "$database_path" == "$source_path" \
    || "$database_path" == "$source_path"/* ]]; then
    echo "Refusing unsafe $label media root: $source_path" >&2
    exit 1
  fi
  case "$source_path" in
    /bin|/boot|/dev|/etc|/home|/proc|/root|/run|/sbin|/sys|/tmp|/usr|/var)
      echo "Refusing broad system directory as $label media root: $source_path" >&2
      exit 1
      ;;
  esac
}

assert_distinct_media_roots() {
  local roots=("$@")
  local left right

  for ((left = 0; left < ${#roots[@]}; left += 1)); do
    for ((right = left + 1; right < ${#roots[@]}; right += 1)); do
      if [[ "${roots[$left]}" == "${roots[$right]}" \
        || "${roots[$left]}" == "${roots[$right]}"/* \
        || "${roots[$right]}" == "${roots[$left]}"/* ]]; then
        echo "Refusing overlapping media roots: ${roots[$left]} and ${roots[$right]}" >&2
        exit 1
      fi
    done
  done
}

stage_media_directory() {
  local archive_name="$1"
  local source_path="$2"
  local archive_path="$bundle_dir/media/$archive_name"

  if [[ -d "$source_path" ]]; then
    if [[ -n "$(find "$source_path" -type l -print -quit)" ]]; then
      echo "Refusing $archive_name media root containing symbolic links: $source_path" >&2
      exit 1
    fi
    ln -s "$source_path" "$archive_path"
  else
    mkdir "$archive_path"
    echo "Remote media directory does not exist; backing up an empty $archive_name/: $source_path" >&2
  fi
}

require_remote_command bun
require_remote_command tar
require_remote_command readlink
require_remote_command find

app_root="$(readlink -m -- "$app_root")"

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

unset DB_PATH DISCOVER_STORAGE_ROOT COMMUNITY_AVATAR_STORAGE_ROOT TREEHOLE_STORAGE_ROOT
set -a
# shellcheck disable=SC1090
. "$app_root/.env"
set +a

database_path="$(resolve_runtime_path "${DB_PATH:-./data/huas.db}")"
database_dir="$(dirname "$database_path")"
discover_storage_root="$(resolve_runtime_path "${DISCOVER_STORAGE_ROOT:-$database_dir/discover}")"
community_avatar_storage_root="$(resolve_runtime_path "${COMMUNITY_AVATAR_STORAGE_ROOT:-$database_dir/treehole-avatars}")"
treehole_storage_root="$(resolve_runtime_path "${TREEHOLE_STORAGE_ROOT:-$database_dir/treehole-post-media}")"
messaging_media_storage_root="$database_dir/message-media"
index_popup_storage_root="$database_dir/index-popup"

assert_safe_media_root Discover "$discover_storage_root"
assert_safe_media_root Community "$community_avatar_storage_root"
assert_safe_media_root Treehole "$treehole_storage_root"
assert_safe_media_root Messaging "$messaging_media_storage_root"
assert_safe_media_root IndexPopup "$index_popup_storage_root"
assert_distinct_media_roots \
  "$discover_storage_root" \
  "$community_avatar_storage_root" \
  "$treehole_storage_root" \
  "$messaging_media_storage_root" \
  "$index_popup_storage_root"

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
stage_media_directory treehole-post-media "$treehole_storage_root"
stage_media_directory message-media "$messaging_media_storage_root"
stage_media_directory index-popup "$index_popup_storage_root"

tar --dereference -czf - -C "$bundle_dir" database.db media
REMOTE_SCRIPT

if [[ ! -s "$BUNDLE_PARTIAL" ]]; then
  echo "Downloaded backup bundle is empty" >&2
  exit 1
fi

tar -tzf "$BUNDLE_PARTIAL" >/dev/null
assert_bundle_archive_whitelist "$BUNDLE_PARTIAL"
tar -xzf "$BUNDLE_PARTIAL" -C "$EXTRACT_DIR"

if [[ ! -f "$EXTRACT_DIR/database.db" ]]; then
  echo "Backup bundle does not contain database.db" >&2
  exit 1
fi
for media_dir in discover treehole-avatars treehole-post-media message-media index-popup; do
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
