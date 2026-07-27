/**
 * [INPUT]: 依赖 Bun 子进程、tests/ 文件发现与共享 setup preload
 * [OUTPUT]: 提供稳定的全量测试入口，隔离使用进程级 mock.module 的套件
 * [POS]: scripts 的本地/单 CI job 测试编排器，避免全局模块 mock 与共享 SQLite 产生跨文件污染
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const TESTS_ROOT = join(PROJECT_ROOT, 'tests');
const ISOLATED_TESTS = new Set([
  'academic-refresh-rate-limit.test.ts',
  'business-flows.test.ts',
]);

async function discoverTests(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(path);
    return entry.name.endsWith('.test.ts') ? [path] : [];
  }));
  return files.flat().sort();
}

async function runTests(files: string[]) {
  if (files.length === 0) return;
  const child = Bun.spawn([
    process.execPath,
    'test',
    '--preload',
    './tests/setup.ts',
    '--max-concurrency',
    '1',
    ...files,
  ], {
    cwd: PROJECT_ROOT,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) process.exit(exitCode);
}

const tests = await discoverTests(TESTS_ROOT);
const regularTests = tests.filter((file) => !ISOLATED_TESTS.has(basename(file)));
const isolatedTests = tests.filter((file) => ISOLATED_TESTS.has(basename(file)));

await runTests(regularTests);
for (const test of isolatedTests) await runTests([test]);
