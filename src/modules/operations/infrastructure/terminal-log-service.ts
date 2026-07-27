/**
 * [INPUT]: 依赖 node:fs/promises、node:path 与北京时间日志时间解析工具
 * [OUTPUT]: 对外提供 TerminalLogService，有界扫描、过滤、排序并返回 pm2 终端日志
 * [POS]: operations/infrastructure 的只读日志 adapter，文件故障降级为空列表
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseBeijingDateTimeToEpoch } from '../../../utils/time';
import type { TerminalLogQuery, TerminalLogSource } from '../domain/operations';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_SCAN_LINES = 800;

function parsePositiveInt(value: number | undefined, fallback: number): number {
  if (!value || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), MAX_LIMIT);
}

function extractLineTimestamp(line: string): number {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  return match ? parseBeijingDateTimeToEpoch(match[1]) : 0;
}

async function tailLines(filePath: string, maxLines: number): Promise<string[]> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(filePath, 'r');
    const stat = await handle.stat();
    if (stat.size <= 0) return [];
    const chunkSize = 16 * 1024;
    let position = stat.size;
    let content = '';
    while (position > 0) {
      const size = Math.min(chunkSize, position);
      position -= size;
      const buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, position);
      content = buffer.toString('utf8') + content;
      if (content.split(/\r?\n/).filter(Boolean).length >= maxLines + 5) break;
    }
    return content.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch {
    return [];
  } finally {
    if (handle) await handle.close();
  }
}

async function readLatestTerminalLogs(limit: number, keyword?: string) {
  const normalizedKeyword = keyword?.trim().toLowerCase() || '';
  const scanLines = normalizedKeyword ? Math.min(MAX_SCAN_LINES, Math.max(limit * 6, limit)) : limit;
  const sources: Array<{ source: TerminalLogSource; file: string }> = [
    { source: 'out', file: resolve(process.cwd(), 'logs/pm2-out.log') },
    { source: 'error', file: resolve(process.cwd(), 'logs/pm2-error.log') },
  ];
  const lineGroups = await Promise.all(sources.map(async ({ source, file }) => {
    const lines = await tailLines(file, scanLines);
    const filtered = normalizedKeyword
      ? lines.filter((line) => line.toLowerCase().includes(normalizedKeyword))
      : lines;
    return filtered.map((line, idx) => ({ source, line, ts: extractLineTimestamp(line), idx }));
  }));
  return lineGroups.flat()
    .sort((left, right) => left.ts !== right.ts ? left.ts - right.ts : left.idx - right.idx)
    .slice(-limit)
    .map(({ source, line }) => ({ source, line }));
}

export class TerminalLogService {
  static async list(query: TerminalLogQuery) {
    const limit = parsePositiveInt(query.limit, DEFAULT_LIMIT);
    const keyword = query.keyword?.trim() || '';
    return { limit, keyword, items: await readLatestTerminalLogs(limit, keyword) };
  }
}
