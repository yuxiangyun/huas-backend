#!/usr/bin/env bash
# [INPUT]: 依赖本机 ssh、百度远端 blue/green 运行目录、Bun/PM2/Nginx、共享 .env 与 SQLite users.encrypted_password
# [OUTPUT]: 对外提供默认只读预检及显式确认后的 Self JWT 密钥轮换，保持用户密码明文语义并用新旧签名探针闭环验证
# [POS]: scripts 的高风险远程身份维护入口；本机只负责编排，远端在 maintenance 内完成密码密文事务轮换与运行环境原子切换
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -Eeuo pipefail

REMOTE_HOST="${REMOTE_HOST:-baidu}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-/www/wwwroot/huas-server}"
MODE="preflight"
ASSUME_YES=0
REVOKE_USER_ID=""

usage() {
  cat <<'EOF'
用法：
  scripts/rotate-self-jwt-secret-remote.sh
  scripts/rotate-self-jwt-secret-remote.sh [--revoke-user-id <id>]
  scripts/rotate-self-jwt-secret-remote.sh --execute --revoke-user-id <id> [--yes]

选项：
  --execute  进入维护窗口并轮换 JWT_SECRET，同时事务重加密全部非空用户密码
  --revoke-user-id 在同一事务中清空该用户保存的密码并删除其全部 credentials
  --yes      跳过交互确认；必须与 --execute 同时使用
  --host     SSH config 主机名，默认 baidu
  --app-root 远端应用根目录，默认 /www/wwwroot/huas-server
  -h, --help 显示帮助

默认模式只执行远端只读预检，不停流、不写数据库、不修改环境。

执行模式会产生短暂 503，并重启进程，因此后台 Cookie 会话、验证码会话和内存限流状态会重置。
历史数据库快照不会被改写；其密码密文仍需要旧密钥，恢复后应让用户重新走真实 CAS 登录。
EOF
}

fail() {
  echo "Self JWT 密钥轮换失败：$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute)
      MODE="execute"
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --revoke-user-id)
      [[ $# -ge 2 ]] || fail '--revoke-user-id 缺少参数'
      REVOKE_USER_ID="$2"
      shift 2
      ;;
    --host)
      [[ $# -ge 2 ]] || fail '--host 缺少参数'
      REMOTE_HOST="$2"
      shift 2
      ;;
    --app-root)
      [[ $# -ge 2 ]] || fail '--app-root 缺少参数'
      REMOTE_APP_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "未知参数：$1"
      ;;
  esac
done

[[ "$REMOTE_HOST" =~ ^[A-Za-z0-9._-]+$ ]] \
  || fail '--host 只能使用 SSH config 主机名'
[[ "$REMOTE_HOST" != -* ]] \
  || fail '--host 不得以连字符开头'
[[ "$REMOTE_APP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] \
  || fail '--app-root 必须是无空格的绝对路径'
[[ "$REMOTE_APP_ROOT" != "/" ]] \
  || fail '--app-root 不得指向根目录'
[[ "/$REMOTE_APP_ROOT/" != *'/../'* && "/$REMOTE_APP_ROOT/" != *'/./'* ]] \
  || fail '--app-root 不得包含 . 或 .. 路径段'
if [[ "$ASSUME_YES" == "1" && "$MODE" != "execute" ]]; then
  fail '--yes 只能与 --execute 同时使用'
fi
if [[ -n "$REVOKE_USER_ID" && ! "$REVOKE_USER_ID" =~ ^[1-9][0-9]*$ ]]; then
  fail '--revoke-user-id 必须是正整数'
fi

command -v ssh >/dev/null 2>&1 || fail '本机缺少 ssh'

if [[ "$MODE" == "execute" && "$ASSUME_YES" != "1" ]]; then
  if [[ ! -t 0 ]]; then
    fail '非交互执行必须同时传入 --yes'
  fi
  echo "即将通过 ssh $REMOTE_HOST 让全部现有 Self JWT 失效，并重加密线上用户密码。"
  if [[ -n "$REVOKE_USER_ID" ]]; then
    echo "用户 id=$REVOKE_USER_ID 保存的密码与全部 credentials 将被吊销。"
  fi
  read -r -p '请输入 ROTATE 确认：' confirmation
  [[ "$confirmation" == "ROTATE" ]] || fail '用户取消执行'
fi

ssh "$REMOTE_HOST" bash -s -- "$MODE" "$REMOTE_APP_ROOT" "${REVOKE_USER_ID:-0}" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

MODE="$1"
APP_ROOT="$2"
REVOKE_USER_ID="$3"
CONTROL_DIR="$APP_ROOT/.deploy"
ROOT_ENV="$APP_ROOT/.env"
ACTIVE_SLOT_FILE="$CONTROL_DIR/active-slot"
CURRENT_DIR="$CONTROL_DIR/current"
ENV_DIR="$CONTROL_DIR/env"
ECOSYSTEM_DIR="$CONTROL_DIR/ecosystem"
RECOVERY_ROOT="$CONTROL_DIR/recovery"
APP_NAME_BASE="huas-server"
LEGACY_APP_NAME="$APP_NAME_BASE"
BLUE_SLOT="blue"
GREEN_SLOT="green"
NGINX_BIN="/www/server/nginx/sbin/nginx"
NGINX_CONF="/www/server/nginx/conf/nginx.conf"
NGINX_PROXY_INCLUDE="/www/server/panel/vhost/nginx/huas-server-active-proxy.inc"
NGINX_VHOST_FILES="/www/server/panel/vhost/nginx/api.huas-api.top.conf:/www/server/panel/vhost/nginx/server.huas-api.top.conf"

ACTIVE_SLOT=""
ACTIVE_RELEASE=""
ACTIVE_RUNTIME_ENV=""
ACTIVE_ECOSYSTEM=""
ACTIVE_APP=""
ACTIVE_PORT=""
RECOVERY_DIR=""
ROOT_ENV_NEXT=""
MAINTENANCE_ACTIVE=0
ROTATION_COMMITTED=0

fail() {
  echo "Remote Self JWT rotation failed: $*" >&2
  return 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

single_env_line() {
  local file_path="$1"
  local key="$2"
  local count line
  [[ -f "$file_path" ]] || fail "missing env file: $file_path"
  count="$(awk -F= -v key="$key" '$1 == key { count += 1 } END { print count + 0 }' "$file_path")"
  [[ "$count" == "1" ]] || fail "$file_path must contain exactly one $key entry"
  line="$(awk -F= -v key="$key" '$1 == key { print; exit }' "$file_path")"
  printf '%s\n' "$line"
}

env_value() {
  local file_path="$1"
  local key="$2"
  local line
  line="$(single_env_line "$file_path" "$key")" || return 1
  printf '%s\n' "${line#*=}"
}

slot_app_name() {
  printf '%s-%s\n' "$APP_NAME_BASE" "$1"
}

stop_all_writers() {
  local app_name
  for app_name in \
    "$(slot_app_name "$BLUE_SLOT")" \
    "$(slot_app_name "$GREEN_SLOT")" \
    "$LEGACY_APP_NAME"; do
    if pm2 describe "$app_name" >/dev/null 2>&1; then
      echo "Stopping PM2 writer: $app_name"
      pm2 stop "$app_name" >/dev/null
    fi
  done
}

assert_all_writers_stopped() {
  local app_name pid
  for app_name in \
    "$(slot_app_name "$BLUE_SLOT")" \
    "$(slot_app_name "$GREEN_SLOT")" \
    "$LEGACY_APP_NAME"; do
    if pm2 describe "$app_name" >/dev/null 2>&1; then
      pid="$(pm2 pid "$app_name" | tr -d '[:space:]')"
      [[ -z "$pid" || "$pid" == "0" ]] || fail "writer still running: $app_name pid=$pid"
    fi
  done
}

write_maintenance_proxy() {
  local temp_file
  temp_file="$(mktemp "$(dirname "$NGINX_PROXY_INCLUDE")/.huas-jwt-maintenance.XXXXXX")"
  printf 'return 503;\n' >"$temp_file"
  mv "$temp_file" "$NGINX_PROXY_INCLUDE"
}

reload_nginx() {
  "$NGINX_BIN" -t -c "$NGINX_CONF" \
    && "$NGINX_BIN" -s reload -c "$NGINX_CONF"
}

restore_active_proxy() {
  local temp_file
  temp_file="$(mktemp "$(dirname "$NGINX_PROXY_INCLUDE")/.huas-jwt-active.XXXXXX")"
  cp -p "$RECOVERY_DIR/nginx-active-proxy.inc" "$temp_file"
  mv "$temp_file" "$NGINX_PROXY_INCLUDE"
  reload_nginx
}

enter_maintenance_mode() {
  write_maintenance_proxy
  if reload_nginx; then
    MAINTENANCE_ACTIVE=1
    echo 'Maintenance mode enabled: nginx returns 503.'
    return 0
  fi

  echo 'Could not enable maintenance; restoring the previous proxy file.' >&2
  cp -p "$RECOVERY_DIR/nginx-active-proxy.inc" "$NGINX_PROXY_INCLUDE"
  reload_nginx >/dev/null 2>&1 || true
  return 1
}

cleanup_recovery_dir() {
  [[ -n "$RECOVERY_DIR" && -d "$RECOVERY_DIR" ]] || return 0
  case "$RECOVERY_DIR" in
    "$RECOVERY_ROOT"/self-jwt-rotation-*) rm -rf -- "$RECOVERY_DIR" ;;
    *)
      echo "Warning: refusing to clean unexpected recovery path: $RECOVERY_DIR" >&2
      return 1
      ;;
  esac
  RECOVERY_DIR=""
}

preserve_failed_temp_files() {
  if [[ -n "$ROOT_ENV_NEXT" && -f "$ROOT_ENV_NEXT" && -n "$RECOVERY_DIR" && -d "$RECOVERY_DIR" ]]; then
    mv "$ROOT_ENV_NEXT" "$RECOVERY_DIR/root.env.next" 2>/dev/null || true
  fi
}

on_error() {
  local exit_code="$1"
  trap - ERR
  set +e
  preserve_failed_temp_files
  if [[ "$MAINTENANCE_ACTIVE" == "1" ]]; then
    write_maintenance_proxy
    reload_nginx >/dev/null 2>&1
    stop_all_writers
    pm2 save >/dev/null 2>&1
  fi
  if [[ "$MAINTENANCE_ACTIVE" == "0" && "$ROTATION_COMMITTED" == "0" ]]; then
    cleanup_recovery_dir >/dev/null 2>&1 || true
  fi
  if [[ -n "$RECOVERY_DIR" ]]; then
    echo "Rotation did not reopen traffic. Recovery material: $RECOVERY_DIR" >&2
    if [[ "$ROTATION_COMMITTED" == "1" ]]; then
      echo 'Password ciphertext transaction committed; inspect root.env.next/root.env.before and database-before.db before forward repair.' >&2
    fi
  fi
  exit "$exit_code"
}

trap 'on_error $?' ERR

for required in awk bun chmod chown cp curl date find grep mkdir mktemp mv pm2 readlink rm sleep stat tr; do
  require_command "$required"
done
[[ -x "$NGINX_BIN" ]] || fail "missing nginx binary: $NGINX_BIN"
[[ "$MODE" == "preflight" || "$MODE" == "execute" ]] || fail "unsupported mode: $MODE"
[[ -f "$ACTIVE_SLOT_FILE" ]] || fail "missing active slot record: $ACTIVE_SLOT_FILE"

ACTIVE_SLOT="$(tr -d '[:space:]' <"$ACTIVE_SLOT_FILE")"
[[ "$ACTIVE_SLOT" == "$BLUE_SLOT" || "$ACTIVE_SLOT" == "$GREEN_SLOT" ]] \
  || fail "active slot must be blue or green, got: $ACTIVE_SLOT"
ACTIVE_RELEASE="$(readlink -f "$CURRENT_DIR/$ACTIVE_SLOT")"
ACTIVE_RUNTIME_ENV="$ENV_DIR/$ACTIVE_SLOT.env"
ACTIVE_ECOSYSTEM="$ECOSYSTEM_DIR/$ACTIVE_SLOT.config.cjs"
ACTIVE_APP="$(slot_app_name "$ACTIVE_SLOT")"

[[ -d "$ACTIVE_RELEASE" ]] || fail "missing active release: $ACTIVE_RELEASE"
[[ -f "$ACTIVE_RUNTIME_ENV" ]] || fail "missing active runtime env: $ACTIVE_RUNTIME_ENV"
[[ ! -L "$ROOT_ENV" ]] || fail 'shared .env must be a regular file, not a symlink'
[[ ! -L "$ACTIVE_RUNTIME_ENV" ]] || fail 'active runtime env must be a regular file, not a symlink'
[[ -f "$ACTIVE_ECOSYSTEM" ]] || fail "missing active ecosystem file: $ACTIVE_ECOSYSTEM"
[[ -f "$NGINX_PROXY_INCLUDE" ]] || fail "missing nginx proxy include: $NGINX_PROXY_INCLUDE"
[[ "$(readlink -f "$ACTIVE_RELEASE/.env")" == "$(readlink -f "$ACTIVE_RUNTIME_ENV")" ]] \
  || fail 'active release .env does not point to the active runtime env'

IFS=':' read -r -a nginx_vhosts <<<"$NGINX_VHOST_FILES"
for nginx_vhost in "${nginx_vhosts[@]}"; do
  [[ -f "$nginx_vhost" ]] || fail "missing nginx vhost: $nginx_vhost"
  grep -F "include $NGINX_PROXY_INCLUDE;" "$nginx_vhost" >/dev/null \
    || fail "nginx vhost does not include managed proxy: $nginx_vhost"
done

ROOT_SECRET_LINE="$(single_env_line "$ROOT_ENV" JWT_SECRET)"
ACTIVE_SECRET_LINE="$(single_env_line "$ACTIVE_RUNTIME_ENV" JWT_SECRET)"
[[ "$ROOT_SECRET_LINE" == "$ACTIVE_SECRET_LINE" ]] \
  || fail 'shared and active runtime JWT_SECRET values differ'
ACTIVE_PORT="$(env_value "$ACTIVE_RUNTIME_ENV" PORT)"
[[ "$ACTIVE_PORT" =~ ^[0-9]+$ && "$ACTIVE_PORT" -ge 1 && "$ACTIVE_PORT" -le 65535 ]] \
  || fail "invalid active port: $ACTIVE_PORT"
[[ "$(env_value "$ACTIVE_RUNTIME_ENV" DEPLOY_SLOT)" == "$ACTIVE_SLOT" ]] \
  || fail 'active runtime DEPLOY_SLOT mismatch'
pm2 describe "$ACTIVE_APP" >/dev/null 2>&1 || fail "active PM2 app not found: $ACTIVE_APP"

stale_recovery=""
if [[ -d "$RECOVERY_ROOT" ]]; then
  stale_recovery="$(find "$RECOVERY_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'self-jwt-rotation-*' -print -quit)"
fi
[[ -z "$stale_recovery" ]] || fail "unfinished JWT rotation recovery exists: $stale_recovery"
stale_root_env="$(find "$APP_ROOT" -mindepth 1 -maxdepth 1 -type f -name '.env.jwt-rotation.*' -print -quit)"
[[ -z "$stale_root_env" ]] || fail "unfinished root env candidate exists: $stale_root_env"
stale_runtime_env="$(find "$ENV_DIR" -mindepth 1 -maxdepth 1 -type f -name '.*.env.jwt-rotation.*' -print -quit)"
[[ -z "$stale_runtime_env" ]] || fail "unfinished runtime env candidate exists: $stale_runtime_env"

read -r -d '' PASSWORD_TOOL <<'BUN_TOOL' || true
import { Database } from 'bun:sqlite';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statfsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

type PasswordRow = { id: number; encryptedPassword: string };

function fail(message: string): never {
  throw new Error(message);
}

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function decrypt(encoded: string, secret: string): string {
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 29) fail('invalid AES-GCM ciphertext length');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return decipher.update(bytes.subarray(28), undefined, 'utf8') + decipher.final('utf8');
}

function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

function readPreparedSecret(path: string): string {
  const matches = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('JWT_SECRET='));
  if (matches.length !== 1) fail('prepared env must contain exactly one JWT_SECRET');
  const secret = matches[0]!.slice('JWT_SECRET='.length);
  if (!/^[a-f0-9]{64}$/.test(secret)) fail('prepared JWT_SECRET must be 64 lowercase hex characters');
  return secret;
}

const phase = process.env.ROTATION_PHASE || 'preflight';
const revokeUserId = Number(process.env.ROTATION_REVOKE_USER_ID || '0');
if (!Number.isSafeInteger(revokeUserId) || revokeUserId < 0) fail('invalid revoke user id');
const configuredDbPath = process.env.DB_PATH || './data/huas.db';
if (configuredDbPath === ':memory:') fail('refusing in-memory database');
const candidateDbPath = isAbsolute(configuredDbPath)
  ? configuredDbPath
  : resolve(process.cwd(), configuredDbPath);
if (!existsSync(candidateDbPath)) fail(`database does not exist: ${candidateDbPath}`);
const dbPath = realpathSync(candidateDbPath);
const oldSecret = process.env.JWT_SECRET;
if (!oldSecret) fail('JWT_SECRET is empty');
const recoveryParent = process.env.ROTATION_RECOVERY_PARENT;
if (!recoveryParent || !existsSync(recoveryParent)) fail('rotation recovery parent does not exist');
const databaseBytes = statSync(dbPath).size;
const safetyBytes = databaseBytes + 64 * 1024 * 1024;
const availableBytes = (path: string) => {
  const stats = statfsSync(path);
  return Number(stats.bavail) * Number(stats.bsize);
};
if (availableBytes(recoveryParent) < safetyBytes) {
  fail('insufficient free space for the temporary database snapshot');
}
if (availableBytes(dbPath) < safetyBytes) {
  fail('insufficient free space for the SQLite password rotation transaction');
}

const database = new Database(dbPath, {
  create: false,
  readonly: phase !== 'rotate',
  readwrite: phase === 'rotate',
});
try {
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  const quickCheck = database.query('PRAGMA quick_check').get() as { quick_check?: string };
  if (quickCheck.quick_check !== 'ok') fail('SQLite quick_check failed');

  const users = database.query('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  const revokeUser = revokeUserId > 0
    ? database.query('SELECT id, encrypted_password AS encryptedPassword FROM users WHERE id = ?')
      .get(revokeUserId) as PasswordRow | null
    : null;
  if (revokeUserId > 0 && !revokeUser) fail(`revoke target user does not exist: ${revokeUserId}`);
  const revokeCredentialCount = revokeUserId > 0
    ? (database.query('SELECT COUNT(*) AS count FROM credentials WHERE user_id = ?')
      .get(revokeUserId) as { count: number }).count
    : 0;
  const rows = database.query(`
    SELECT id, encrypted_password AS encryptedPassword
    FROM users
    WHERE encrypted_password IS NOT NULL
    ORDER BY id
  `).all() as PasswordRow[];

  const plaintextRows: Array<{ id: number; encryptedPassword: string; plaintext: string }> = [];
  const failedUserIds: number[] = [];
  for (const row of rows) {
    if (row.id === revokeUserId) continue;
    try {
      plaintextRows.push({ ...row, plaintext: decrypt(row.encryptedPassword, oldSecret) });
    } catch {
      failedUserIds.push(row.id);
    }
  }
  if (failedUserIds.length > 0) {
    const preview = failedUserIds.slice(0, 20).join(',');
    const suffix = failedUserIds.length > 20 ? ',...' : '';
    fail(`password preflight failed: count=${failedUserIds.length}, userIds=${preview}${suffix}`);
  }

  if (phase === 'preflight' || phase === 'verify') {
    if (phase === 'verify' && revokeUserId > 0) {
      if (revokeUser?.encryptedPassword !== null) fail(`revoked user password is not null: ${revokeUserId}`);
      if (revokeCredentialCount !== 0) fail(`revoked user still has credentials: ${revokeUserId}`);
    }
    console.log(`Password ${phase}: users=${users.count}, encrypted=${rows.length}, database=${dbPath}`);
    if (revokeUserId > 0) {
      console.log(`Credential revocation ${phase}: userId=${revokeUserId}, credentials=${revokeCredentialCount}`);
    }
  } else {
    if (phase !== 'rotate') fail(`unsupported rotation phase: ${phase}`);

    const preparedEnv = process.env.ROTATION_PREPARED_ENV;
    const snapshotPath = process.env.ROTATION_SNAPSHOT_PATH;
    if (!preparedEnv || !snapshotPath) fail('rotation paths are missing');
    if (existsSync(snapshotPath)) fail(`snapshot already exists: ${snapshotPath}`);
    const newSecret = readPreparedSecret(preparedEnv);
    if (oldSecret === newSecret) fail('new JWT_SECRET equals old secret');

    database.run('VACUUM INTO ?', [snapshotPath]);
    const snapshot = new Database(snapshotPath, { create: false, readonly: true });
    try {
      const snapshotCheck = snapshot.query('PRAGMA quick_check').get() as { quick_check?: string };
      if (snapshotCheck.quick_check !== 'ok') fail('snapshot quick_check failed');
    } finally {
      snapshot.close();
    }

    const update = database.prepare(`
      UPDATE users
      SET encrypted_password = ?
      WHERE id = ? AND encrypted_password = ?
    `);
    const clearRevokedPassword = database.prepare(`
      UPDATE users
      SET encrypted_password = NULL
      WHERE id = ?
    `);
    const deleteRevokedCredentials = database.prepare('DELETE FROM credentials WHERE user_id = ?');
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const row of plaintextRows) {
        const reencrypted = encrypt(row.plaintext, newSecret);
        if (decrypt(reencrypted, newSecret) !== row.plaintext) {
          fail(`password verification failed for user id ${row.id}`);
        }
        const result = update.run(reencrypted, row.id, row.encryptedPassword);
        if (result.changes !== 1) fail(`concurrent password change detected for user id ${row.id}`);
      }
      if (revokeUserId > 0) {
        const cleared = clearRevokedPassword.run(revokeUserId);
        if (cleared.changes !== 1) fail(`failed to clear revoked user password: ${revokeUserId}`);
        deleteRevokedCredentials.run(revokeUserId);
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    console.log(`Password rotation committed: users=${users.count}, reencrypted=${plaintextRows.length}`);
    if (revokeUserId > 0) {
      console.log(`Credential revocation committed: userId=${revokeUserId}, deletedCredentials=${revokeCredentialCount}`);
    }
  }
} finally {
  database.close();
}
BUN_TOOL

run_password_tool() {
  local phase="$1"
  local prepared_env="${2:-}"
  local snapshot_path="${3:-}"
  (
    cd "$ACTIVE_RELEASE"
    ROTATION_PHASE="$phase" \
    ROTATION_PREPARED_ENV="$prepared_env" \
    ROTATION_SNAPSHOT_PATH="$snapshot_path" \
    ROTATION_RECOVERY_PARENT="$CONTROL_DIR" \
    ROTATION_REVOKE_USER_ID="$REVOKE_USER_ID" \
      bun --env-file="$ROOT_ENV" run - <<<"$PASSWORD_TOOL"
  )
}

echo "Remote target: slot=$ACTIVE_SLOT app=$ACTIVE_APP port=$ACTIVE_PORT"
pm2 jlist | (
  cd "$ACTIVE_RELEASE"
  PM2_ACTIVE_APP="$ACTIVE_APP" bun --env-file="$ROOT_ENV" -e '
    const applications = JSON.parse(await Bun.stdin.text());
    const application = applications.find((item) => item.name === process.env.PM2_ACTIVE_APP);
    if (!application) throw new Error("active PM2 app missing from jlist");
    if (application.pm2_env?.status !== "online") throw new Error("active PM2 app is not online");
    const pm2Secret = application.pm2_env?.JWT_SECRET;
    if (pm2Secret !== undefined && pm2Secret !== process.env.JWT_SECRET) {
      throw new Error("active PM2 JWT_SECRET differs from the shared env");
    }
    console.log("PM2 runtime preflight passed.");
  '
)
"$NGINX_BIN" -t -c "$NGINX_CONF"
run_password_tool preflight

if [[ "$MODE" == "preflight" ]]; then
  echo 'Preflight passed. No remote state was changed.'
  exit 0
fi

mkdir -p "$RECOVERY_ROOT"
chmod 700 "$RECOVERY_ROOT"
RECOVERY_DIR="$(mktemp -d "$RECOVERY_ROOT/self-jwt-rotation-$(date +%Y%m%d%H%M%S).XXXXXX")"
chmod 700 "$RECOVERY_DIR"
cp -p "$ROOT_ENV" "$RECOVERY_DIR/root.env.before"
chmod 600 "$RECOVERY_DIR/root.env.before"
cp -p "$ACTIVE_RUNTIME_ENV" "$RECOVERY_DIR/$ACTIVE_SLOT.env.before"
chmod 600 "$RECOVERY_DIR/$ACTIVE_SLOT.env.before"
cp -p "$NGINX_PROXY_INCLUDE" "$RECOVERY_DIR/nginx-active-proxy.inc"

for slot in "$BLUE_SLOT" "$GREEN_SLOT"; do
  runtime_env="$ENV_DIR/$slot.env"
  if [[ -f "$runtime_env" && "$runtime_env" != "$ACTIVE_RUNTIME_ENV" ]]; then
    cp -p "$runtime_env" "$RECOVERY_DIR/$slot.env.before"
    chmod 600 "$RECOVERY_DIR/$slot.env.before"
  fi
done

NEW_SECRET="$(bun -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(32).toString('hex'))")"
[[ "$NEW_SECRET" =~ ^[a-f0-9]{64}$ ]] || fail 'failed to generate new JWT_SECRET'
[[ "JWT_SECRET=$NEW_SECRET" != "$ROOT_SECRET_LINE" ]] || fail 'generated JWT_SECRET unexpectedly equals old value'

ROOT_ENV_NEXT="$(mktemp "$APP_ROOT/.env.jwt-rotation.XXXXXX")"
replacement_count=0
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" == JWT_SECRET=* ]]; then
    printf 'JWT_SECRET=%s\n' "$NEW_SECRET"
    replacement_count=$((replacement_count + 1))
  else
    printf '%s\n' "$line"
  fi
done <"$ROOT_ENV" >"$ROOT_ENV_NEXT"
[[ "$replacement_count" == "1" ]] || fail 'could not prepare exactly one JWT_SECRET replacement'
chown --reference="$ROOT_ENV" "$ROOT_ENV_NEXT"
chmod --reference="$ROOT_ENV" "$ROOT_ENV_NEXT"
unset NEW_SECRET

enter_maintenance_mode
stop_all_writers
assert_all_writers_stopped
pm2 save >/dev/null

run_password_tool rotate "$ROOT_ENV_NEXT" "$RECOVERY_DIR/database-before.db"
ROTATION_COMMITTED=1

mv "$ROOT_ENV_NEXT" "$ROOT_ENV"
ROOT_ENV_NEXT=""

for slot in "$BLUE_SLOT" "$GREEN_SLOT"; do
  runtime_env="$ENV_DIR/$slot.env"
  [[ -f "$runtime_env" ]] || continue
  slot_port="$(env_value "$runtime_env" PORT)"
  [[ "$slot_port" =~ ^[0-9]+$ && "$slot_port" -ge 1 && "$slot_port" -le 65535 ]] \
    || fail "invalid runtime port for $slot: $slot_port"
  [[ "$(env_value "$runtime_env" DEPLOY_SLOT)" == "$slot" ]] \
    || fail "runtime DEPLOY_SLOT mismatch for $slot"
  runtime_next="$(mktemp "$ENV_DIR/.$slot.env.jwt-rotation.XXXXXX")"
  awk -F= '$1 != "PORT" && $1 != "DEPLOY_SLOT" { print }' "$ROOT_ENV" >"$runtime_next"
  {
    printf '\nPORT=%s\n' "$slot_port"
    printf 'DEPLOY_SLOT=%s\n' "$slot"
  } >>"$runtime_next"
  chown --reference="$runtime_env" "$runtime_next"
  chmod --reference="$runtime_env" "$runtime_next"
  mv "$runtime_next" "$runtime_env"
done

[[ "$(single_env_line "$ROOT_ENV" JWT_SECRET)" == "$(single_env_line "$ACTIVE_RUNTIME_ENV" JWT_SECRET)" ]] \
  || fail 'new shared and active runtime JWT_SECRET values differ'
run_password_tool verify

for app_name in \
  "$(slot_app_name "$BLUE_SLOT")" \
  "$(slot_app_name "$GREEN_SLOT")" \
  "$LEGACY_APP_NAME"; do
  if pm2 describe "$app_name" >/dev/null 2>&1; then
    pm2 delete "$app_name" >/dev/null
  fi
done
pm2 start "$ACTIVE_ECOSYSTEM" --only "$ACTIVE_APP" --update-env >/dev/null
pm2 save >/dev/null

health_url="http://127.0.0.1:$ACTIVE_PORT/health/ready"
health_ok=0
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl --fail --silent --show-error --max-time 10 "$health_url" >/dev/null; then
    health_ok=1
    break
  fi
  sleep 1
done
[[ "$health_ok" == "1" ]] || fail "health check failed: $health_url"

read -r -d '' JWT_PROBE <<'BUN_PROBE' || true
import { randomUUID } from 'node:crypto';
import { sign } from 'hono/jwt';

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('probe JWT_SECRET is empty');
const now = Math.floor(Date.now() / 1000);
const token = await sign({
  userId: -2147483648,
  studentId: `__jwt_rotation_probe__${randomUUID()}`,
  iat: now,
  exp: now + 300,
}, secret, 'HS256');
const response = await fetch(`http://127.0.0.1:${process.env.ROTATION_PROBE_PORT}/api/early-rising/settings`, {
  headers: { Authorization: `Bearer ${token}` },
});
const body = await response.json() as { error_code?: number; error_message?: string };
const expectedMessage = process.env.ROTATION_EXPECT_MESSAGE;
if (response.status !== 401 || body.error_code !== 4001 || body.error_message !== expectedMessage) {
  throw new Error(`authentication probe returned unexpected auth boundary: ${response.status}/${body.error_code}/${body.error_message}`);
}
console.log(`Authentication probe passed: ${expectedMessage}`);
BUN_PROBE

run_jwt_probe() {
  local env_file="$1"
  local expected_message="$2"
  (
    cd "$ACTIVE_RELEASE"
    ROTATION_PROBE_PORT="$ACTIVE_PORT" \
    ROTATION_EXPECT_MESSAGE="$expected_message" \
      bun --env-file="$env_file" run - <<<"$JWT_PROBE"
  )
}

run_jwt_probe "$RECOVERY_DIR/root.env.before" 'Invalid or expired token'
run_jwt_probe "$ROOT_ENV" 'User no longer exists, please login again'

restore_active_proxy
MAINTENANCE_ACTIVE=0
echo "Traffic reopened on $ACTIVE_APP after health and old/new JWT probes passed."

if ! cleanup_recovery_dir; then
  echo 'Warning: rotation succeeded, but temporary recovery material requires manual cleanup.' >&2
fi
echo 'Self JWT secret rotation completed. Old JWTs are invalid; stored password semantics are preserved.'
echo 'Reminder: historical database snapshots still contain password ciphertext encrypted by the retired secret.'
REMOTE_SCRIPT
