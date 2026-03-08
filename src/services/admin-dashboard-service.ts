import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { AnnouncementService } from './announcement-service';
import { beijingIsoString, parseBeijingDateTimeToEpoch, startOfBeijingDay } from '../utils/time';

const PAGE_SIZE = 20;
const LOG_LIMIT = 50;

type LogSource = 'out' | 'error';

interface DashboardQuery {
  page?: string;
  search?: string;
  major?: string;
  grade?: string;
}

function buildStudentGradeSql() {
  return sql<string>`(
    CASE
      WHEN length(${schema.users.studentId}) >= 4
        AND substr(${schema.users.studentId}, 1, 4) GLOB '[12][0-9][0-9][0-9]' THEN substr(${schema.users.studentId}, 1, 4)
      WHEN length(${schema.users.studentId}) >= 5
        AND substr(${schema.users.studentId}, 2, 4) GLOB '[12][0-9][0-9][0-9]' THEN substr(${schema.users.studentId}, 2, 4)
      WHEN length(${schema.users.studentId}) >= 6
        AND substr(${schema.users.studentId}, 3, 4) GLOB '[12][0-9][0-9][0-9]' THEN substr(${schema.users.studentId}, 3, 4)
      WHEN length(${schema.users.studentId}) >= 7
        AND substr(${schema.users.studentId}, 4, 4) GLOB '[12][0-9][0-9][0-9]' THEN substr(${schema.users.studentId}, 4, 4)
      ELSE ''
    END
  )`;
}

function parseStudentGrade(studentId: string | null | undefined): string {
  if (!studentId) return '';
  const match = studentId.match(/(?:19|20)\d{2}/);
  return match?.[0] ?? '';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return beijingIsoString(date);
}

function toMB(value: number): number {
  return Math.round((value / 1024 / 1024) * 100) / 100;
}

function formatLikeKeyword(value: string): string {
  return `%${value.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
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

async function readLatestTerminalLogs(limit: number) {
  const sources: Array<{ source: LogSource; file: string }> = [
    { source: 'out', file: resolve(process.cwd(), 'logs/pm2-out.log') },
    { source: 'error', file: resolve(process.cwd(), 'logs/pm2-error.log') },
  ];

  const perFile = limit;
  const lineGroups = await Promise.all(
    sources.map(async ({ source, file }) => {
      const lines = await tailLines(file, perFile);
      return lines.map((line, idx) => ({
        source,
        line,
        ts: extractLineTimestamp(line),
        idx,
      }));
    })
  );

  const merged = lineGroups
    .flat()
    .sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      return a.idx - b.idx;
    })
    .slice(-limit)
    .map(({ source, line }) => ({ source, line }));

  return merged;
}

export class AdminDashboardService {
  static async getDashboard(query: DashboardQuery) {
    const db = getDb();
    const now = new Date();
    const page = parsePositiveInt(query.page, 1);
    const search = (query.search || '').trim();
    const major = (query.major || '').trim();
    const grade = (query.grade || '').trim();
    const studentGradeExpr = buildStudentGradeSql();

    const nowMs = Date.now();
    const todayStart = startOfBeijingDay(now);
    const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);

    let serviceStatus: 'ok' | 'error' = 'ok';
    try {
      db.run(sql`SELECT 1`);
    } catch {
      serviceStatus = 'error';
    }

    const [
      totalUsersRows,
      todayActiveRows,
      active7dRows,
      new7dRows,
      cacheRows,
      credentialRows,
      majorRows,
      gradeRows,
      announcements,
      logs,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(schema.users),
      db.select({ count: sql<number>`count(*)` }).from(schema.users).where(sql`${schema.users.lastLoginAt} >= ${todayStart}`),
      db.select({ count: sql<number>`count(*)` }).from(schema.users).where(sql`${schema.users.lastLoginAt} >= ${sevenDaysAgo}`),
      db.select({ count: sql<number>`count(*)` }).from(schema.users).where(sql`${schema.users.createdAt} >= ${sevenDaysAgo}`),
      db.select({ count: sql<number>`count(*)` }).from(schema.cache),
      db.select({ count: sql<number>`count(*)` }).from(schema.credentials),
      db
        .select({
          className: schema.users.className,
          count: sql<number>`count(*)`,
        })
        .from(schema.users)
        .groupBy(schema.users.className)
        .orderBy(desc(sql<number>`count(*)`)),
      db
        .select({
          grade: studentGradeExpr,
          count: sql<number>`count(*)`,
        })
        .from(schema.users)
        .where(sql`${studentGradeExpr} <> ''`)
        .groupBy(studentGradeExpr)
        .orderBy(studentGradeExpr),
      AnnouncementService.listAdmin(),
      readLatestTerminalLogs(LOG_LIMIT),
    ]);

    const whereParts = [];
    if (search) {
      const keyword = formatLikeKeyword(search);
      whereParts.push(or(like(schema.users.studentId, keyword), like(schema.users.name, keyword)));
    }
    if (major) {
      if (major === '__UNASSIGNED__') {
        whereParts.push(sql`(${schema.users.className} IS NULL OR ${schema.users.className} = '')`);
      } else {
        whereParts.push(eq(schema.users.className, major));
      }
    }
    if (grade) {
      whereParts.push(sql`${studentGradeExpr} = ${grade}`);
    }

    const whereExpr = whereParts.length > 0 ? and(...whereParts) : undefined;
    const totalFilteredRows = whereExpr
      ? await db.select({ count: sql<number>`count(*)` }).from(schema.users).where(whereExpr)
      : await db.select({ count: sql<number>`count(*)` }).from(schema.users);

    const totalFiltered = Number(totalFilteredRows[0]?.count || 0);
    const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * PAGE_SIZE;

    const userRows = whereExpr
      ? await db
          .select({
            studentId: schema.users.studentId,
            name: schema.users.name,
            className: schema.users.className,
            createdAt: schema.users.createdAt,
            lastLoginAt: schema.users.lastLoginAt,
          })
          .from(schema.users)
          .where(whereExpr)
          .orderBy(desc(schema.users.lastLoginAt))
          .limit(PAGE_SIZE)
          .offset(offset)
      : await db
          .select({
            studentId: schema.users.studentId,
            name: schema.users.name,
            className: schema.users.className,
            createdAt: schema.users.createdAt,
            lastLoginAt: schema.users.lastLoginAt,
          })
          .from(schema.users)
          .orderBy(desc(schema.users.lastLoginAt))
          .limit(PAGE_SIZE)
          .offset(offset);

    const users = userRows.map((row) => ({
      studentId: row.studentId,
      name: row.name || '',
      className: row.className || '未分配',
      grade: parseStudentGrade(row.studentId),
      createdAt: toIso(row.createdAt),
      lastLoginAt: toIso(row.lastLoginAt),
    }));

    const byMajor = majorRows.map((row) => ({
      className: row.className || '未分配',
      count: Number(row.count || 0),
    }));

    const byGrade = gradeRows
      .map((row) => ({ grade: (row.grade || '').trim(), count: Number(row.count || 0) }))
      .filter((row) => row.grade.length === 4);

    const majors = majorRows.map((row) => ({
      value: row.className?.trim() ? row.className : '__UNASSIGNED__',
      label: row.className?.trim() ? row.className : '未分配',
    }));
    const grades = byGrade.map((row) => row.grade);

    const memory = process.memoryUsage();

    return {
      service: {
        status: serviceStatus,
        timestamp: beijingIsoString(now),
      },
      metrics: {
        totalUsers: Number(totalUsersRows[0]?.count || 0),
        todayActiveUsers: Number(todayActiveRows[0]?.count || 0),
        activeUsers7d: Number(active7dRows[0]?.count || 0),
        newUsers7d: Number(new7dRows[0]?.count || 0),
        cacheEntries: Number(cacheRows[0]?.count || 0),
        credentialEntries: Number(credentialRows[0]?.count || 0),
        memory: {
          rssMb: toMB(memory.rss),
          heapUsedMb: toMB(memory.heapUsed),
          heapTotalMb: toMB(memory.heapTotal),
        },
        uptimeSeconds: Math.floor(process.uptime()),
      },
      distributions: {
        byMajor,
        byGrade,
      },
      users: {
        page: safePage,
        pageSize: PAGE_SIZE,
        total: totalFiltered,
        totalPages,
        filters: {
          search,
          major,
          grade,
        },
        options: {
          majors,
          grades,
        },
        items: users,
      },
      logs: {
        limit: LOG_LIMIT,
        items: logs,
      },
      announcements,
    };
  }
}
