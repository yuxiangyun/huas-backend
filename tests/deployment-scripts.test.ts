/**
 * [INPUT]: 依赖四条维护中的 Bash 部署脚本与 docs/ops/DEPLOY.md
 * [OUTPUT]: 验证脚本语法、readiness 门禁、锁文件包管理器选择和 nginx 切流回滚契约
 * [POS]: tests 的部署静态回归套件，阻止发布链退回旧 health 或不可恢复的配置切换
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

  it('uses migration-aware readiness before reload completion or blue-green traffic switch', async () => {
    const quick = await source('scripts/deploy-huas.sh');
    const blueGreen = await source('scripts/remote-blue-green-deploy.sh');
    expect(quick).toContain('HEALTH_URL="http://127.0.0.1:\\$REMOTE_PORT/health/ready"');
    expect(blueGreen).toContain('local url="http://127.0.0.1:$port/health/ready"');
    expect(blueGreen.lastIndexOf('wait_for_health "$target_port"'))
      .toBeLessThan(blueGreen.lastIndexOf('switch_active_proxy "$target_port"'));
    expect(blueGreen.lastIndexOf('switch_active_proxy "$target_port"'))
      .toBeLessThan(blueGreen.lastIndexOf('mv "$active_slot_candidate" "$ACTIVE_SLOT_FILE"'));
    expect(blueGreen.lastIndexOf('prepare_active_slot_record "$target_slot"'))
      .toBeLessThan(blueGreen.lastIndexOf('switch_active_proxy "$target_port"'));
    expect(quick.lastIndexOf('Health check passed on \\$HEALTH_URL'))
      .toBeLessThan(quick.lastIndexOf('pm2 save'));
    expect(blueGreen.lastIndexOf('wait_for_health "$target_port"'))
      .toBeLessThan(blueGreen.lastIndexOf('pm2 save >/dev/null'));
    expect(blueGreen.lastIndexOf('pm2 save >/dev/null'))
      .toBeLessThan(blueGreen.lastIndexOf('switch_active_proxy "$target_port"'));
    expect(blueGreen).toContain('active_slot_dir="$(dirname "$ACTIVE_SLOT_FILE")"');
    expect(blueGreen).toContain('mktemp "$active_slot_dir/.active-slot.XXXXXX"');
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

  it('restores routing files when nginx validation or reload fails', async () => {
    const blueGreen = await source('scripts/remote-blue-green-deploy.sh');
    expect(blueGreen).toContain('switch_active_proxy()');
    expect(blueGreen).toContain('rollback_nginx_vhosts');
    expect(blueGreen).toContain('restoring previous routing files');
    expect(blueGreen).toContain('mv "$previous_proxy" "$NGINX_PROXY_INCLUDE"');
  });

  it('keeps the operations guide aligned with the executable gate', async () => {
    const guide = await source('docs/ops/DEPLOY.md');
    expect(guide).toContain('/health/ready');
    expect(guide).toContain('仅在 readiness 成功后执行 `pm2 save`');
    expect(guide).toContain('校验或 reload 失败会恢复原路由文件');
    expect(guide).toContain('`REMOTE_HOST` | `baidu`');
  });
});
