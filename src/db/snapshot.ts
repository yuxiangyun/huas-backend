/**
 * [INPUT]: 依赖 Bun SQLite VACUUM INTO、显式数据库路径与受控输出目录/发布标识
 * [OUTPUT]: 对外提供 createDatabaseSnapshot 与安全文件名解析结果
 * [POS]: db 的部署前一致性快照内核，不参与普通启动，也不负责自动清理历史文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { getCurrentSchemaVersion } from './migrator';

export interface SnapshotOptions {
  dbPath: string;
  outputDir?: string;
  release: string;
  now?: Date;
  cwd?: string;
}

function safeRelease(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('Snapshot release identifier must contain a letter, number, dot, underscore, or dash.');
  return normalized.slice(0, 80);
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function createDatabaseSnapshot(options: SnapshotOptions): string {
  const cwd = options.cwd ?? process.cwd();
  const dbPath = isAbsolute(options.dbPath) ? options.dbPath : resolve(cwd, options.dbPath);
  if (!existsSync(dbPath)) throw new Error(`SQLite database does not exist: ${dbPath}`);

  const database = new Database(dbPath);
  try {
    const integrity = database.query('PRAGMA quick_check').get() as { quick_check?: string };
    if (integrity.quick_check !== 'ok') throw new Error('SQLite quick_check failed; deployment snapshot aborted.');
    const version = getCurrentSchemaVersion(database);
    const stamp = (options.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const outputDir = options.outputDir
      ? (isAbsolute(options.outputDir) ? options.outputDir : resolve(cwd, options.outputDir))
      : join(dirname(dbPath), 'snapshots');
    mkdirSync(outputDir, { recursive: true });
    const outputPath = join(
      outputDir,
      `${basename(dbPath, '.db')}-${stamp}-schema-v${version}-release-${safeRelease(options.release)}.db`
    );
    if (existsSync(outputPath)) throw new Error(`Snapshot target already exists: ${outputPath}`);
    database.exec(`VACUUM INTO ${quoteSqlString(outputPath)}`);
    return outputPath;
  } finally {
    database.close();
  }
}
