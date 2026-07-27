/**
 * [INPUT]: 依赖显式 --db/--release 参数、可选 --output-dir 与 src/db/snapshot
 * [OUTPUT]: 对外提供 SQLite VACUUM INTO 一致性快照命令，失败以非零状态退出
 * [POS]: scripts 的部署前数据保护入口，被快速与蓝绿部署链路调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { createDatabaseSnapshot } from '../src/db/snapshot';

const args = process.argv.slice(2);
function required(name: string): string {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) {
    console.error('Usage: bun run db:snapshot -- --db <sqlite-path> --release <release-id> [--output-dir <directory>]');
    process.exit(2);
  }
  return args[index + 1];
}

const outputIndex = args.indexOf('--output-dir');
const outputPath = createDatabaseSnapshot({
  dbPath: required('--db'),
  release: required('--release'),
  outputDir: outputIndex >= 0 ? required('--output-dir') : undefined,
});
console.log(`Database snapshot complete: ${outputPath}`);
