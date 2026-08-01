/**
 * [INPUT]: 依赖四条维护部署脚本、本机成组备份脚本与 docs/ops/DEPLOY.md
 * [OUTPUT]: 验证脚本语法、四媒体加首页弹窗白名单备份、媒体存量磁盘门禁、maintenance/migration/冒烟顺序与 forward-fix 契约
 * [POS]: tests 的部署静态回归套件，阻止备份越界、release/持久媒体挤满磁盘或 contract migration 失败后恢复旧 upstream
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';

const DEPLOY_SCRIPTS = [
  'scripts/deploy-huas.sh',
  'scripts/deploy-huas-zero-downtime.sh',
  'scripts/remote-blue-green-deploy.sh',
  'scripts/setup-huas-git-deploy.sh',
] as const;
const BACKUP_SCRIPT = 'scripts/backup-data-local.sh';
const BASH_SCRIPTS = [BACKUP_SCRIPT, ...DEPLOY_SCRIPTS] as const;

async function source(path: string) {
  return readFile(path, 'utf8');
}

describe('deployment scripts', () => {
  it('keeps every maintained Bash entry syntactically valid', () => {
    for (const script of BASH_SCRIPTS) {
      const result = Bun.spawnSync(['bash', '-n', script]);
      expect(result.exitCode, `${script}: ${result.stderr.toString()}`).toBe(0);
    }
  });

  it('orders the maintenance window around snapshot, destructive migration and local smoke', async () => {
    const quick = await source('scripts/deploy-huas.sh');
    const blueGreen = await source('scripts/remote-blue-green-deploy.sh');
    expect(quick).toContain('exec "$SCRIPT_DIR/deploy-huas-zero-downtime.sh"');
    expect(blueGreen).toContain('local url="http://127.0.0.1:$port/health/ready"');
    expect(blueGreen).toContain('local url="http://127.0.0.1:$port/m"');
    expect(blueGreen).toContain('--allow-destructive');
    const steps = [
      'enter_maintenance_mode',
      'stop_all_writers',
      'snapshot_database "$RELEASE_SOURCE_DIR"',
      'migrate_database "$RELEASE_SOURCE_DIR"',
      'ensure_pm2_app "$target_slot"',
      'wait_for_health "$target_port"',
      'smoke_web "$target_port"',
      'switch_active_proxy "$target_port"',
      'mv "$ACTIVE_SLOT_CANDIDATE" "$ACTIVE_SLOT_FILE"',
    ].map((step) => blueGreen.lastIndexOf(step));
    expect(steps.every((index) => index >= 0)).toBe(true);
    expect(steps).toEqual([...steps].sort((left, right) => left - right));
    expect(blueGreen).toContain('active_slot_dir="$(dirname "$ACTIVE_SLOT_FILE")"');
    expect(blueGreen).toContain('mktemp "$active_slot_dir/.active-slot.XXXXXX"');
  });

  it('prunes only inactive releases and checks disk headroom before traffic stops', async () => {
    const localDeploy = await source('scripts/deploy-huas-zero-downtime.sh');
    const setup = await source('scripts/setup-huas-git-deploy.sh');
    const blueGreen = await source('scripts/remote-blue-green-deploy.sh');

    expect(blueGreen).toContain('RELEASE_RETENTION_COUNT="${RELEASE_RETENTION_COUNT:-6}"');
    expect(blueGreen).toContain('MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB:-2048}"');
    expect(blueGreen).toContain('prune_inactive_releases "$target_release_dir"');
    expect(blueGreen.lastIndexOf('prune_inactive_releases "$target_release_dir"'))
      .toBeLessThan(blueGreen.lastIndexOf('prepare_release_dir "$target_slot"'));
    expect(blueGreen).toContain('"$CURRENT_DIR/$BLUE_SLOT" "$CURRENT_DIR/$GREEN_SLOT"');
    expect(blueGreen).toContain('protected_releases+=("$target_canonical")');
    expect(blueGreen).toContain('[[ "$candidate_canonical" != "$releases_root/"* ]]');
    expect(blueGreen).toContain("find \"$RELEASES_DIR\" -mindepth 1 -maxdepth 1 -type d");

    expect(blueGreen).toContain('assert_deployment_disk_headroom "$target_release_dir"');
    expect(blueGreen.lastIndexOf('assert_deployment_disk_headroom "$target_release_dir"'))
      .toBeLessThan(blueGreen.lastIndexOf('prepare_active_slot_record "$target_slot"'));
    expect(blueGreen.lastIndexOf('assert_deployment_disk_headroom "$target_release_dir"'))
      .toBeLessThan(blueGreen.lastIndexOf('enter_maintenance_mode'));
    expect(blueGreen).toContain('df -Pk "$path"');
    expect(blueGreen).toContain('database_bytes * 3');
    expect(blueGreen).toContain('"database filesystem"');
    expect(blueGreen).toContain('"snapshot filesystem"');
    expect(blueGreen).toContain('unset DB_PATH DISCOVER_STORAGE_ROOT COMMUNITY_AVATAR_STORAGE_ROOT TREEHOLE_STORAGE_ROOT');
    expect(blueGreen).toContain('RUNTIME_DATABASE_PATH="$(resolve_runtime_path "$configured_database_path")"');
    expect(blueGreen).toContain('RUNTIME_DISCOVER_STORAGE_ROOT="$(resolve_runtime_path "${DISCOVER_STORAGE_ROOT:-$database_dir/discover}")"');
    expect(blueGreen).toContain('RUNTIME_COMMUNITY_AVATAR_STORAGE_ROOT="$(resolve_runtime_path "${COMMUNITY_AVATAR_STORAGE_ROOT:-$database_dir/treehole-avatars}")"');
    expect(blueGreen).toContain('RUNTIME_TREEHOLE_STORAGE_ROOT="$(resolve_runtime_path "${TREEHOLE_STORAGE_ROOT:-$database_dir/treehole-post-media}")"');
    expect(blueGreen).toContain('RUNTIME_MESSAGING_STORAGE_ROOT="$database_dir/message-media"');
    expect(blueGreen).toContain('readlink -m -- "$absolute_path"');
    expect(blueGreen).toContain('disk_probe_path "$RUNTIME_TREEHOLE_STORAGE_ROOT"');
    expect(blueGreen).toContain('treehole_media_bytes="$(path_disk_usage_bytes "$RUNTIME_TREEHOLE_STORAGE_ROOT")"');
    expect(blueGreen).toContain('database_bytes * 3 + media_bytes');
    expect(blueGreen).toContain('assert_safe_media_root Treehole "$RUNTIME_TREEHOLE_STORAGE_ROOT"');
    expect(blueGreen).toContain('assert_distinct_media_roots');
    expect(blueGreen).toContain('Refusing broad system directory as $label media root');
    for (const label of [
      'Discover media filesystem',
      'Community avatar filesystem',
      'Treehole post media filesystem',
      'Messaging media filesystem',
    ]) {
      expect(blueGreen).toContain(`"${label}"`);
    }

    for (const script of [localDeploy, setup, blueGreen]) {
      expect(script).toContain('RELEASE_RETENTION_COUNT');
      expect(script).toContain('MIN_FREE_DISK_MB');
    }
  });

  it('backs up only the database, four named business-media roots and index popup state', async () => {
    const backup = await source(BACKUP_SCRIPT);
    const gitignore = await source('.gitignore');
    const whitelist = backup.slice(
      backup.indexOf('assert_bundle_archive_whitelist()'),
      backup.indexOf('cleanup()')
    );

    expect(backup).toContain('TREEHOLE_STORAGE_ROOT');
    expect(backup).toContain('readlink -m -- "$absolute_path"');
    expect(backup).toContain('${TREEHOLE_STORAGE_ROOT:-$database_dir/treehole-post-media}');
    for (const stagedRoot of [
      'stage_media_directory discover "$discover_storage_root"',
      'stage_media_directory treehole-avatars "$community_avatar_storage_root"',
      'stage_media_directory treehole-post-media "$treehole_storage_root"',
      'stage_media_directory message-media "$messaging_media_storage_root"',
      'stage_media_directory index-popup "$index_popup_storage_root"',
    ]) {
      expect(backup).toContain(stagedRoot);
    }
    expect(backup).toContain('index_popup_storage_root="$database_dir/index-popup"');
    expect(backup).toContain('for media_dir in discover treehole-avatars treehole-post-media message-media index-popup; do');
    expect(backup).toContain('assert_bundle_archive_whitelist "$BUNDLE_PARTIAL"');
    expect(backup).toContain('assert_safe_media_root Treehole "$treehole_storage_root"');
    expect(backup).toContain('assert_safe_media_root IndexPopup "$index_popup_storage_root"');
    expect(backup).toContain('assert_distinct_media_roots');
    expect(backup).toContain('Refusing $archive_name media root containing symbolic links');
    expect(backup.indexOf('assert_bundle_archive_whitelist "$BUNDLE_PARTIAL"'))
      .toBeLessThan(backup.indexOf('tar -xzf "$BUNDLE_PARTIAL"'));
    for (const entry of [
      'media/discover/*',
      'media/treehole-avatars/*',
      'media/treehole-post-media/*',
      'media/message-media/*',
      'media/index-popup/*',
    ]) {
      expect(whitelist).toContain(entry);
    }
    expect(whitelist).not.toContain('logs/');
    expect(whitelist).not.toContain('.env');
    expect(backup).toContain('tar -tzf "$MEDIA_PARTIAL" >/dev/null');
    expect(gitignore).toContain('data/treehole-post-media/');
    expect(gitignore).toContain('data/index-popup/');
  });

  it('chooses the Web package manager deterministically from lock files', async () => {
    for (const script of DEPLOY_SCRIPTS) {
      expect(await source(script)).toContain('WEB_PACKAGE_MANAGER="${WEB_PACKAGE_MANAGER:-auto}"');
    }
    const blueGreen = await source('scripts/remote-blue-green-deploy.sh');
    expect(blueGreen.indexOf('release_dir/web/package-lock.json'))
      .toBeLessThan(blueGreen.indexOf('release_dir/web/bun.lock'));
    expect(blueGreen).toContain('require_command "$web_package_manager"');
  });

  it('starts the async Bun entry directly instead of using the PM2 require wrapper', async () => {
    const blueGreen = await source('scripts/remote-blue-green-deploy.sh');
    const ecosystem = await source('ecosystem.config.cjs');
    for (const config of [blueGreen, ecosystem]) {
      expect(config).toContain("interpreter: 'none'");
      expect(config).not.toContain("interpreter: 'bun'");
    }
    expect(blueGreen).toContain('bun_bin="$(command -v bun)"');
    expect(blueGreen).toContain("args: 'run src/index.ts'");
    expect(blueGreen).toContain('pm2 delete "$app_name"');
    expect(blueGreen).toContain('pm2 start "$ecosystem_file" --only "$app_name" --update-env');
    expect(blueGreen).not.toContain('pm2 startOrReload');
    expect(ecosystem).toContain("script: '/usr/bin/env'");
    expect(ecosystem).toContain("args: 'bun run src/index.ts'");
  });

  it('keeps maintenance routing and stopped writers after a post-migration failure', async () => {
    const blueGreen = await source('scripts/remote-blue-green-deploy.sh');
    const failureHandler = blueGreen.slice(
      blueGreen.indexOf('enforce_failed_release_maintenance()'),
      blueGreen.indexOf('prepare_release_dir()')
    );
    expect(blueGreen).toContain('switch_active_proxy()');
    expect(blueGreen).toContain('enforce_failed_release_maintenance');
    expect(failureHandler).toContain('write_maintenance_proxy || true');
    expect(failureHandler).toContain('stop_all_writers || true');
    expect(failureHandler).toContain('pm2 save >/dev/null 2>&1 || true');
    expect(blueGreen).toContain('Migration may already be committed; the old upstream will not be restored.');
    expect(blueGreen).toContain('Keep the service in maintenance mode, repair forward');
    expect(blueGreen).toContain('restoring maintenance routing, never the old upstream');
    expect(blueGreen).not.toContain('restoring previous routing files');
  });

  it('keeps the operations guide aligned with the executable gate', async () => {
    const guide = await source('docs/ops/DEPLOY.md');
    expect(guide).toContain('/health/ready');
    expect(guide).toContain('db:migrate --allow-destructive');
    expect(guide).toContain('保持停流与停 writer');
    expect(guide).toContain('不得恢复旧 upstream');
    expect(guide).toContain('forward-fix');
    expect(guide).toContain('`REMOTE_HOST` | `baidu`');
    expect(guide).toContain('media/treehole-post-media/');
    expect(guide).toContain('media/index-popup/');
    expect(guide).toContain('`dirname(DB_PATH)/index-popup/`');
    expect(guide).toContain('`0004_treehole_post_media`');
  });
});
