/**
 * [INPUT]: 依赖 Identity operations query 契约、Drizzle db/schema 与北京时间格式化工具
 * [OUTPUT]: 对外提供 SQLiteIdentityOperationsQuery，只读聚合用户、凭证与兼容缓存计数
 * [POS]: identity/infrastructure 的管理查询 adapter，独占身份表筛选、年级解析与分页 SQL
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { beijingIsoString } from '../../../utils/time';
import type {
  IdentityOperationsQuery,
  IdentityOperationsQueryPort,
  IdentityOperationsSnapshot,
} from '../domain/operations-query';

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
  return studentId?.match(/(?:19|20)\d{2}/)?.[0] ?? '';
}

function formatLikeKeyword(value: string): string {
  return `%${value.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function toIso(date: Date | null | undefined): string | null {
  return date ? beijingIsoString(date) : null;
}

export class SQLiteIdentityOperationsQuery implements IdentityOperationsQueryPort {
  async getSnapshot(query: IdentityOperationsQuery): Promise<IdentityOperationsSnapshot> {
    const db = getDb();
    const studentGradeExpr = buildStudentGradeSql();
    const [
      totalUsersRows,
      todayActiveRows,
      active7dRows,
      new7dRows,
      cacheRows,
      credentialRows,
      majorRows,
      gradeRows,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(schema.users),
      db.select({ count: sql<number>`count(*)` }).from(schema.users)
        .where(sql`${schema.users.lastActiveAt} >= ${query.todayStartMs}`),
      db.select({ count: sql<number>`count(*)` }).from(schema.users)
        .where(sql`${schema.users.lastActiveAt} >= ${query.sevenDaysAgoMs}`),
      db.select({ count: sql<number>`count(*)` }).from(schema.users)
        .where(sql`${schema.users.createdAt} >= ${query.sevenDaysAgoMs}`),
      db.select({ count: sql<number>`count(*)` }).from(schema.cache),
      db.select({ count: sql<number>`count(*)` }).from(schema.credentials),
      db.select({ className: schema.users.className, count: sql<number>`count(*)` })
        .from(schema.users)
        .groupBy(schema.users.className)
        .orderBy(desc(sql<number>`count(*)`)),
      db.select({ grade: studentGradeExpr, count: sql<number>`count(*)` })
        .from(schema.users)
        .where(sql`${studentGradeExpr} <> ''`)
        .groupBy(studentGradeExpr)
        .orderBy(studentGradeExpr),
    ]);

    const whereParts = [];
    if (query.search) {
      const keyword = formatLikeKeyword(query.search);
      whereParts.push(or(like(schema.users.studentId, keyword), like(schema.users.name, keyword))!);
    }
    if (query.major) {
      whereParts.push(query.major === '__UNASSIGNED__'
        ? sql`(${schema.users.className} IS NULL OR ${schema.users.className} = '')`
        : eq(schema.users.className, query.major));
    }
    if (query.grade) whereParts.push(sql`${studentGradeExpr} = ${query.grade}`);

    const whereExpr = whereParts.length > 0 ? and(...whereParts) : undefined;
    const totalFilteredRows = whereExpr
      ? await db.select({ count: sql<number>`count(*)` }).from(schema.users).where(whereExpr)
      : await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    const total = Number(totalFilteredRows[0]?.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, totalPages);
    const selectUsers = db.select({
      studentId: schema.users.studentId,
      name: schema.users.name,
      className: schema.users.className,
      createdAt: schema.users.createdAt,
      lastLoginAt: schema.users.lastLoginAt,
    }).from(schema.users);
    const userRows = whereExpr
      ? await selectUsers.where(whereExpr).orderBy(desc(schema.users.lastLoginAt))
          .limit(query.pageSize).offset((page - 1) * query.pageSize)
      : await selectUsers.orderBy(desc(schema.users.lastLoginAt))
          .limit(query.pageSize).offset((page - 1) * query.pageSize);

    const byMajor = majorRows.map((row) => ({
      className: row.className || '未分配',
      count: Number(row.count || 0),
    }));
    const byGrade = gradeRows
      .map((row) => ({ grade: (row.grade || '').trim(), count: Number(row.count || 0) }))
      .filter((row) => row.grade.length === 4);

    return {
      metrics: {
        totalUsers: Number(totalUsersRows[0]?.count || 0),
        todayActiveUsers: Number(todayActiveRows[0]?.count || 0),
        activeUsers7d: Number(active7dRows[0]?.count || 0),
        newUsers7d: Number(new7dRows[0]?.count || 0),
        cacheEntries: Number(cacheRows[0]?.count || 0),
        credentialEntries: Number(credentialRows[0]?.count || 0),
      },
      distributions: { byMajor, byGrade },
      users: {
        page,
        pageSize: query.pageSize,
        total,
        totalPages,
        filters: { search: query.search, major: query.major, grade: query.grade },
        options: {
          majors: majorRows.map((row) => ({
            value: row.className?.trim() ? row.className : '__UNASSIGNED__',
            label: row.className?.trim() ? row.className : '未分配',
          })),
          grades: byGrade.map((row) => row.grade),
        },
        items: userRows.map((row) => ({
          studentId: row.studentId,
          name: row.name || '',
          className: row.className || '未分配',
          grade: parseStudentGrade(row.studentId),
          createdAt: toIso(row.createdAt),
          lastLoginAt: toIso(row.lastLoginAt),
        })),
      },
    };
  }
}
