import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseBeijingDateTimeToEpoch } from '../../utils/time';

type LogSource = 'out' | 'error';

interface TerminalLogQuery {
  limit?: number;
  keyword?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_SCAN_LINES = 800;

function parsePositiveInt(value: number | undefined, fallback: number): number {
  if (!value || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), MAX_LIMIT);
}

function extractLineTimestamp(line: string): number {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  if (!match) return 0;
  return parseBeijingDateTimeToEpoch(match[1]);
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

      const lines = content.split(/\r?\n/).filter(Boolean);
      if (lines.length >= maxLines + 5) {
        break;
      }
    }

    const lines = content.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  } finally {
    if (handle) {
      await handle.close();
    }
  }
}

async function readLatestTerminalLogs(limit: number, keyword?: string) {
  const normalizedKeyword = keyword?.trim().toLowerCase() || '';
  const scanLines = normalizedKeyword
    ? Math.min(MAX_SCAN_LINES, Math.max(limit * 6, limit))
    : limit;
  const sources: Array<{ source: LogSource; file: string }> = [
    { source: 'out', file: resolve(process.cwd(), 'logs/pm2-out.log') },
    { source: 'error', file: resolve(process.cwd(), 'logs/pm2-error.log') },
  ];

  const lineGroups = await Promise.all(
    sources.map(async ({ source, file }) => {
      const lines = await tailLines(file, scanLines);
      const filtered = normalizedKeyword
        ? lines.filter((line) => line.toLowerCase().includes(normalizedKeyword))
        : lines;

      return filtered.map((line, idx) => ({
        source,
        line,
        ts: extractLineTimestamp(line),
        idx,
      }));
    })
  );

  return lineGroups
    .flat()
    .sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      return a.idx - b.idx;
    })
    .slice(-limit)
    .map(({ source, line }) => ({ source, line }));
}

export class TerminalLogService {
  static async list(query: TerminalLogQuery) {
    const limit = parsePositiveInt(query.limit, DEFAULT_LIMIT);
    const keyword = query.keyword?.trim() || '';
    const items = await readLatestTerminalLogs(limit, keyword);

    return {
      limit,
      keyword,
      items,
    };
  }
}
