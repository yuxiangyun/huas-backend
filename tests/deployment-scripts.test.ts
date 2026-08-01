/**
 * [INPUT]: 依赖四条维护中的 Bash 部署脚本与 docs/ops/DEPLOY.md
 * [OUTPUT]: 验证脚本语法、release 保留/磁盘门禁、维护发布顺序、destructive migration 授权、Server/Web 冒烟与 forward-fix 契约
 * [POS]: tests 的部署静态回归套件，阻止 release 膨胀或低磁盘进入停流窗口，并禁止 contract migration 失败后恢复旧 upstream
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

async function source(path: string) {
  return readFile(path, 'utf8');
}

describe('deployment scripts', () => {
  it('keeps every maintained Bash entry syntactically valid', () => {
    for (const script of DEPLOY_SCRIPTS) {
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

    for (const script of [localDeploy, setup, blueGreen]) {
      expect(script).toContain('RELEASE_RETENTION_COUNT');
      expect(script).toContain('MIN_FREE_DISK_MB');
    }
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
  });
});
