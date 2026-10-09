/**
 * [INPUT]: 依赖 Identity operations query 契约、Drizzle db/schema 与北京时间格式化工具
 * [OUTPUT]: 对外提供 SQLiteIdentityOperationsQuery，只读聚合用户、三类基础学校凭证与兼容缓存计数
 * [POS]: identity/infrastructure 的管理查询 adapter，隔离身份表筛选、字面关键词匹配、年级解析、基础凭证口径、独立概览及稳定用户分页 SQL
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { resolvePagination } from '../../../utils/pagination';
import { beijingIsoString } from '../../../utils/time';
import type {
  IdentityAdminUsersQuery,
  IdentityAdminUsers,
  IdentityOperationsOverview,
  IdentityOperationsQuery,
  IdentityOperationsQueryPort,
  IdentityOperationsSnapshot,
} from '../domain/operations-query';

const BASE_SCHOOL_CREDENTIAL_SYSTEMS = ['cas_tgc', 'portal_jwt', 'jw_session'] as const;

function buildStudentGradeSql() {
  const candidates = [1, 2, 3, 4].map((position) => sql`
    WHEN substr(${schema.users.studentId}, ${position}, 4) GLOB '19[0-9][0-9]'
      OR substr(${schema.users.studentId}, ${position}, 4) GLOB '20[0-9][0-9]'
    THEN substr(${schema.users.studentId}, ${position}, 4)
  `);
  return sql<string>`(CASE ${sql.join(candidates, sql` `)} ELSE '' END)`;
}

function formatLikeKeyword(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function toIso(date: Date | null | undefined): string | null {
  return date ? beijingIsoString(date) : null;
}

export class SQLiteIdentityOperationsQuery implements IdentityOperationsQueryPort {
  async getOverview(query: { todayStartMs: number; sevenDaysAgoMs: number }): Promise<IdentityOperationsOverview> {
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
      db.select({ count: sql<number>`count(*)` }).from(schema.credentials)
        .where(inArray(schema.credentials.system, [...BASE_SCHOOL_CREDENTIAL_SYSTEMS])),
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

    const byMajor = majorRows.map((row) => ({
      className: row.className?.trim() ? row.className : '未分配',
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
    };
  }

  async listUsers(query: IdentityAdminUsersQuery): Promise<IdentityAdminUsers> {
    const db = getDb();
    const studentGradeExpr = buildStudentGradeSql();
    const pagination = resolvePagination({ page: query.page }, 20, 20);
    const search = query.search?.trim() || '';
    const className = query.className?.trim() || '';
    const grade = query.grade?.trim() || '';
    const [classRows, gradeRows] = await Promise.all([
      db.select({ className: schema.users.className }).from(schema.users)
        .groupBy(schema.users.className).orderBy(schema.users.className),
      db.select({ grade: studentGradeExpr }).from(schema.users)
        .where(sql`${studentGradeExpr} <> ''`).groupBy(studentGradeExpr).orderBy(studentGradeExpr),
    ]);
    const whereParts = [];
    if (search) {
      const keyword = formatLikeKeyword(search);
      whereParts.push(or(
        sql`${schema.users.studentId} LIKE ${keyword} ESCAPE ${'\\'}`,
        sql`${schema.users.name} LIKE ${keyword} ESCAPE ${'\\'}`,
      )!);
    }
    if (className) {
      whereParts.push(className === '__UNASSIGNED__'
        ? sql`(${schema.users.className} IS NULL OR trim(${schema.users.className}) = '')`
        : eq(schema.users.className, className));
    }
    if (grade) whereParts.push(sql`${studentGradeExpr} = ${grade}`);

    const whereExpr = whereParts.length > 0 ? and(...whereParts) : undefined;
    const totalFilteredRows = whereExpr
      ? await db.select({ count: sql<number>`count(*)` }).from(schema.users).where(whereExpr)
      : await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    const total = Number(totalFilteredRows[0]?.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
    const page = Math.min(pagination.page, totalPages);
    const selectUsers = db.select({
      grade: studentGradeExpr,
      lastActiveAt: schema.users.lastActiveAt,
      studentId: schema.users.studentId,
      name: schema.users.name,
      className: schema.users.className,
      createdAt: schema.users.createdAt,
      lastLoginAt: schema.users.lastLoginAt,
    }).from(schema.users);
    const userRows = whereExpr
      ? await selectUsers.where(whereExpr).orderBy(desc(schema.users.lastLoginAt), desc(schema.users.id))
          .limit(pagination.pageSize).offset((page - 1) * pagination.pageSize)
      : await selectUsers.orderBy(desc(schema.users.lastLoginAt), desc(schema.users.id))
          .limit(pagination.pageSize).offset((page - 1) * pagination.pageSize);

    return {
      page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
      filters: { search, className, grade },
      options: {
        classes: Array.from(new Map(classRows.map((row) => [
          row.className?.trim() ? row.className : '__UNASSIGNED__',
          { value: row.className?.trim() ? row.className : '__UNASSIGNED__', label: row.className?.trim() ? row.className : '未分配' },
        ])).values()),
        grades: gradeRows.map((row) => row.grade),
      },
      items: userRows.map((row) => ({
        studentId: row.studentId,
        name: row.name || '',
        className: row.className?.trim() ? row.className : '未分配',
        grade: row.grade,
        createdAt: toIso(row.createdAt),
        lastLoginAt: toIso(row.lastLoginAt),
        lastActiveAt: toIso(row.lastActiveAt),
      })),
    };
  }

  async getSnapshot(query: IdentityOperationsQuery): Promise<IdentityOperationsSnapshot> {
    const [overview, users] = await Promise.all([
      this.getOverview(query),
      this.listUsers({ page: query.page, search: query.search, className: query.major, grade: query.grade }),
    ]);
    return {
      ...overview,
      users: {
        ...users,
        filters: { search: users.filters.search, major: users.filters.className, grade: users.filters.grade },
        options: { majors: users.options.classes, grades: users.options.grades },
      },
    };
  }
}
