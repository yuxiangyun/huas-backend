#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-huas}"
BARE_REPO_DIR="${BARE_REPO_DIR:-/www/git/huas-server.git}"
APP_DIR="${APP_DIR:-/www/wwwroot/huas-server}"
APP_NAME="${APP_NAME:-huas-server}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
GIT_REMOTE_NAME="${GIT_REMOTE_NAME:-huas-deploy}"
INSTALL_SERVER_DEPS="${INSTALL_SERVER_DEPS:-1}"
BUILD_WEB="${BUILD_WEB:-1}"
INSTALL_WEB_DEPS="${INSTALL_WEB_DEPS:-1}"
WEB_PACKAGE_MANAGER="${WEB_PACKAGE_MANAGER:-auto}"

REMOTE_GIT_URL="${REMOTE_HOST}:${BARE_REPO_DIR}"

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

ensure_local_remote() {
  if git remote get-url "$GIT_REMOTE_NAME" >/dev/null 2>&1; then
    local existing_url
    existing_url="$(git remote get-url "$GIT_REMOTE_NAME")"

    if [[ "$existing_url" != "$REMOTE_GIT_URL" ]]; then
      echo "Remote $GIT_REMOTE_NAME already exists: $existing_url" >&2
      echo "Expected: $REMOTE_GIT_URL" >&2
      exit 1
    fi
  else
    git remote add "$GIT_REMOTE_NAME" "$REMOTE_GIT_URL"
    echo "Added git remote: $GIT_REMOTE_NAME -> $REMOTE_GIT_URL"
  fi

  git config "remote.${GIT_REMOTE_NAME}.push" "refs/heads/${DEPLOY_BRANCH}:refs/heads/${DEPLOY_BRANCH}"
}

ensure_remote_bare_repo() {
  local bare_repo_parent
  bare_repo_parent="$(dirname "$BARE_REPO_DIR")"

  ssh "$REMOTE_HOST" "
    set -euo pipefail
    mkdir -p '$bare_repo_parent'
    if [ ! -d '$BARE_REPO_DIR' ]; then
      git init --bare --initial-branch '$DEPLOY_BRANCH' '$BARE_REPO_DIR'
    fi
  "
}

build_remote_hook() {
  cat <<EOF
#!/usr/bin/env bash
set -euo pipefail

APP_DIR='$APP_DIR'
APP_NAME='$APP_NAME'
DEPLOY_BRANCH='$DEPLOY_BRANCH'
INSTALL_SERVER_DEPS='$INSTALL_SERVER_DEPS'
BUILD_WEB='$BUILD_WEB'
INSTALL_WEB_DEPS='$INSTALL_WEB_DEPS'
WEB_PACKAGE_MANAGER='$WEB_PACKAGE_MANAGER'
ZERO_OID='0000000000000000000000000000000000000000'

require_command() {
  local command_name="\$1"

  if ! command -v "\$command_name" >/dev/null 2>&1; then
    echo "Missing required command: \$command_name" >&2
    exit 1
  fi
}

resolve_web_package_manager() {
  if [[ "\$BUILD_WEB" != "1" ]]; then
    return
  fi

  if [[ "\$WEB_PACKAGE_MANAGER" != "auto" ]]; then
    echo "\$WEB_PACKAGE_MANAGER"
    return
  fi

  if [[ -f "\$APP_DIR/web/package-lock.json" ]]; then
    echo "npm"
    return
  fi

  if [[ -f "\$APP_DIR/web/bun.lock" ]]; then
    echo "bun"
    return
  fi

  echo "Could not determine web package manager in \$APP_DIR/web" >&2
  exit 1
}

install_web_dependencies() {
  local package_manager="\$1"

  case "\$package_manager" in
    npm)
      (
        cd "\$APP_DIR/web"
        npm ci --include=dev
      )
      ;;
    bun)
      (
        cd "\$APP_DIR/web"
        bun install --frozen-lockfile
      )
      ;;
    *)
      echo "Unsupported web package manager: \$package_manager" >&2
      exit 1
      ;;
  esac
}

run_web_build() {
  local package_manager="\$1"

  case "\$package_manager" in
    npm)
      (
        cd "\$APP_DIR/web"
        npm run build
      )
      ;;
    bun)
      (
        cd "\$APP_DIR/web"
        bun run build
      )
      ;;
    *)
      echo "Unsupported web package manager: \$package_manager" >&2
      exit 1
      ;;
  esac
}

deploy_rev=''

while read -r oldrev newrev refname; do
  if [[ "\$refname" != "refs/heads/\$DEPLOY_BRANCH" ]]; then
    continue
  fi

  if [[ "\$newrev" == "\$ZERO_OID" ]]; then
    echo "Refusing to deploy deleted branch: \$refname" >&2
    exit 1
  fi

  deploy_rev="\$newrev"
done

if [[ -z "\$deploy_rev" ]]; then
  echo "No deploy triggered for branch \$DEPLOY_BRANCH"
  exit 0
fi

require_command git
require_command tar
require_command rsync
require_command bun
require_command pm2
require_command curl

tmpdir="\$(mktemp -d)"
cleanup() {
  rm -rf "\$tmpdir"
}
trap cleanup EXIT

mkdir -p "\$APP_DIR"

echo "Preparing release for \$deploy_rev"
git archive "\$deploy_rev" | tar -x -C "\$tmpdir"

echo "Syncing release to \$APP_DIR"
rsync -az --delete \\
  --exclude='.env' \\
  --exclude='.env.*' \\
  --exclude='data' \\
  --exclude='logs' \\
  --exclude='reports' \\
  --exclude='node_modules' \\
  --exclude='web/node_modules' \\
  "\$tmpdir/" "\$APP_DIR/"

if [[ ! -f "\$APP_DIR/.env" ]]; then
  echo "Missing required remote file: \$APP_DIR/.env" >&2
  exit 1
fi

set -a
. "\$APP_DIR/.env"
set +a

REMOTE_PORT="\${PORT:-}"

if [[ -z "\$REMOTE_PORT" ]]; then
  echo "Missing PORT in \$APP_DIR/.env" >&2
  exit 1
fi

if ! printf '%s' "\$REMOTE_PORT" | grep -Eq '^[0-9]+\$'; then
  echo "Invalid PORT in \$APP_DIR/.env: \$REMOTE_PORT" >&2
  exit 1
fi

mkdir -p "\$APP_DIR/data" "\$APP_DIR/logs"

if [[ "\$INSTALL_SERVER_DEPS" == "1" ]]; then
  (
    cd "\$APP_DIR"
    bun install --frozen-lockfile --production
  )
fi

if [[ "\$BUILD_WEB" == "1" ]]; then
  web_package_manager="\$(resolve_web_package_manager)"
  if [[ "\$web_package_manager" == "npm" ]]; then
    require_command npm
  fi

  if [[ "\$INSTALL_WEB_DEPS" == "1" ]]; then
    install_web_dependencies "\$web_package_manager"
  fi

  run_web_build "\$web_package_manager"

  if [[ ! -f "\$APP_DIR/web/dist/index.html" ]]; then
    echo "web build did not produce \$APP_DIR/web/dist/index.html" >&2
    exit 1
  fi
fi

(
  cd "\$APP_DIR"
  pm2 startOrReload ecosystem.config.cjs --only "\$APP_NAME" --update-env
  pm2 save
)

HEALTH_URL="http://127.0.0.1:\$REMOTE_PORT/health"
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl --fail --silent --show-error --max-time 10 "\$HEALTH_URL" >/dev/null; then
    echo "Health check passed on \$HEALTH_URL"
    exit 0
  fi
  sleep 1
done

echo "Health check failed: \$HEALTH_URL" >&2
exit 1
EOF
}

install_remote_hook() {
  local hook_path="${BARE_REPO_DIR}/hooks/post-receive"
  local hook_content
  hook_content="$(build_remote_hook)"

  ssh "$REMOTE_HOST" "cat > '$hook_path'" <<<"$hook_content"
  ssh "$REMOTE_HOST" "chmod 755 '$hook_path' && bash -n '$hook_path'"
}

print_summary() {
  cat <<EOF
Git push deploy is configured.

Local remote:
  git remote get-url $GIT_REMOTE_NAME

Push command:
  git push $GIT_REMOTE_NAME $DEPLOY_BRANCH

Remote bare repo:
  $BARE_REPO_DIR

Deploy target:
  $APP_DIR

Protected remote paths:
  .env
  .env.*
  data/
  logs/
  reports/
  node_modules/
  web/node_modules/
EOF
}

require_command git
require_command ssh

ensure_local_remote
ensure_remote_bare_repo
install_remote_hook
print_summary
