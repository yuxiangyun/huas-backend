/**
 * [INPUT]: 依赖 package.json、bunfig.toml 与 GitHub Actions check workflow 文本
 * [OUTPUT]: 验证测试数据库默认隔离、本地 check 最小质量链路及 CI 单 job、触发器、并发取消配置
 * [POS]: tests 的 Runtime 工程静态验收套件，阻止直接 bun test 绕过临时 SQLite preload
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('runtime local and CI quality gate', () => {
  it('preloads the isolated SQLite setup for every bun test invocation', async () => {
    const bunfig = await readFile(join(process.cwd(), 'bunfig.toml'), 'utf8');
    expect(bunfig).toContain('[test]');
    expect(bunfig).toContain('preload = ["./tests/setup.ts"]');
  });

  it('defines check as typecheck, stable full test and migration verification', async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));
    expect(packageJson.scripts.check).toBe('bun run typecheck && bun run test && bun run db:verify');
    expect(packageJson.scripts.typecheck).toContain('tsc --noEmit');
    expect(packageJson.scripts.test).toBe('bun scripts/test.ts');
    expect(packageJson.scripts['db:verify']).toContain("Database(':memory:')");
  });

  it('uses one cancellable job for PR main, push main and manual runs', async () => {
    const workflow = await readFile(join(process.cwd(), '.github/workflows/check.yml'), 'utf8');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('bun install --frozen-lockfile');
    expect(workflow).toContain('bun run check');
    const jobsSection = workflow.slice(workflow.indexOf('jobs:'));
    expect((jobsSection.match(/^  [a-z][a-z-]*:\s*$/gm) || [])).toEqual(['  check:']);
    expect(workflow).not.toContain('matrix:');
  });

  it('registers Analytics shutdown behind the bounded Runtime flush hook', async () => {
    const entry = await readFile(join(process.cwd(), 'src/index.ts'), 'utf8');
    const composition = await readFile(join(process.cwd(), 'src/composition.ts'), 'utf8');
    expect(composition).toContain("registerShutdownFlushHook('analytics'");
    expect(composition).toContain('await AnalyticsService.shutdown()');
    expect(entry).toContain('await flushShutdownHooks()');
    expect(composition).toContain('CacheService.configureObservers({');
    expect(composition).toContain('runtimeMetrics.recordCache(outcome)');
    expect(composition).toContain('runtimeMetrics.recordSingleflightMerge()');
    expect(composition).toContain('configureRefreshFallbackObservers({');
    expect(composition).toContain('runtimeMetrics.recordFallback()');
    expect(composition).toContain('AnalyticsService.configureFlushFailureObserver');
    expect(composition).toContain('runtimeMetrics.recordAnalyticsFlushFailure()');
    expect(composition).toContain('configureHttpClientObservers({');
    expect(composition).toContain('runtimeMetrics.recordUpstream(outcome)');
  });
});
