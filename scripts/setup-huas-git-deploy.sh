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
CONTROL_DIR="${CONTROL_DIR:-${APP_DIR}/.deploy}"

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
APP_NAME_BASE='$APP_NAME'
DEPLOY_BRANCH='$DEPLOY_BRANCH'
INSTALL_SERVER_DEPS='$INSTALL_SERVER_DEPS'
BUILD_WEB='$BUILD_WEB'
INSTALL_WEB_DEPS='$INSTALL_WEB_DEPS'
WEB_PACKAGE_MANAGER='$WEB_PACKAGE_MANAGER'
CONTROL_DIR='$CONTROL_DIR'
ZERO_OID='0000000000000000000000000000000000000000'

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

tmpdir="\$(mktemp -d)"
cleanup() {
  rm -rf "\$tmpdir"
}
trap cleanup EXIT

echo "Preparing release for \$deploy_rev"
git archive "\$deploy_rev" | tar -x -C "\$tmpdir"

APP_ROOT="\$APP_DIR" \\
CONTROL_DIR="\$CONTROL_DIR" \\
APP_NAME_BASE="\$APP_NAME_BASE" \\
RELEASE_SOURCE_DIR="\$tmpdir" \\
RELEASE_ID="\${deploy_rev:0:12}" \\
INSTALL_SERVER_DEPS="\$INSTALL_SERVER_DEPS" \\
BUILD_WEB="\$BUILD_WEB" \\
INSTALL_WEB_DEPS="\$INSTALL_WEB_DEPS" \\
WEB_PACKAGE_MANAGER="\$WEB_PACKAGE_MANAGER" \\
bash "\$tmpdir/scripts/remote-blue-green-deploy.sh"
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

Deploy mode:
  blue-green release with nginx traffic switch

Remote bare repo:
  $BARE_REPO_DIR

App root:
  $APP_DIR

Control dir:
  $CONTROL_DIR

Protected remote paths:
  .env
  data/
  logs/
  reports/
EOF
}

require_command git
require_command ssh

ensure_local_remote
ensure_remote_bare_repo
install_remote_hook
print_summary
