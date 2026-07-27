/**
 * [INPUT]: 依赖 Operations 自有 analytics schema、北京日期工具与请求路径/显式渠道/用户事实
 * [OUTPUT]: 提供 AnalyticsService 的同步 recordAuthenticatedRequest/recordLogin 与 overview 时间序列
 * [POS]: operations/infrastructure 的渠道分析事实 adapter，保持请求内立即写入语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { gte, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { beijingDate } from '../../../utils/time';

export type AnalyticsPlatform = 'miniprogram' | 'web' | 'unknown';

const MINIPROGRAM_FEATURE_PATHS: Array<[string, string]> = [
  ['/api/v1/schedule', 'schedule'],
  ['/api/schedule', 'schedule'],
  ['/api/grades', 'grades'],
  ['/api/evaluations', 'evaluations'],
  ['/api/ecard', 'ecard'],
  ['/api/classrooms', 'classrooms'],
  ['/api/calendar', 'calendar'],
];

const WEB_FEATURE_PATHS: Array<[string, string]> = [
  ['/api/discover', 'discover'],
  ['/api/treehole', 'treehole'],
];

const FEATURE_PATHS = [...MINIPROGRAM_FEATURE_PATHS, ...WEB_FEATURE_PATHS];

function normalizePlatform(value: string | undefined): AnalyticsPlatform {
  const platform = value?.trim().toLowerCase();
  return platform === 'miniprogram' || platform === 'web' ? platform : 'unknown';
}

function featureOf(path: string) {
  return FEATURE_PATHS.find(([prefix]) => path.startsWith(prefix))?.[1] ?? null;
}

function requestPlatformOf(path: string, header: string | undefined): AnalyticsPlatform {
  if (header !== undefined) return normalizePlatform(header);
  if (MINIPROGRAM_FEATURE_PATHS.some(([prefix]) => path.startsWith(prefix))) return 'miniprogram';
  return 'unknown';
}

function increment(day: string, platform: AnalyticsPlatform, metric: string) {
  const db = getDb();
  db.run(sql`INSERT INTO analytics_daily_metrics (day, platform, metric, value, updated_at)
    VALUES (${day}, ${platform}, ${metric}, 1, ${Date.now()})
    ON CONFLICT(day, platform, metric)
    DO UPDATE SET value = value + 1, updated_at = ${Date.now()}`);
}

export class AnalyticsService {
  static platformOf(header: string | undefined) {
    return normalizePlatform(header);
  }

  static recordAuthenticatedRequest(input: {
    userId: number;
    platformHeader?: string;
    path: string;
    status: number;
  }) {
    const day = beijingDate();
    const platform = requestPlatformOf(input.path, input.platformHeader);
    const db = getDb();

    db.run(sql`INSERT OR IGNORE INTO analytics_daily_users (day, platform, user_id, created_at)
      VALUES (${day}, ${platform}, ${input.userId}, ${Date.now()})`);
    increment(day, platform, 'request.total');
    const feature = featureOf(input.path);
    if (feature) increment(day, platform, `feature.${feature}`);
    if (input.status >= 500) increment(day, platform, 'request.server_error');
    else if (input.status >= 400) increment(day, platform, 'request.client_error');
  }

  static recordLogin(platformHeader: string | undefined, success: boolean) {
    increment(beijingDate(), normalizePlatform(platformHeader), success ? 'login.success' : 'login.failure');
  }

  static async getOverview(days: number) {
    const safeDays = [7, 30, 90].includes(days) ? days : 30;
    const start = new Date();
    start.setDate(start.getDate() - safeDays + 1);
    const startDay = beijingDate(start);
    const db = getDb();

    const [metricRows, activeRows] = await Promise.all([
      db.select().from(schema.analyticsDailyMetrics).where(gte(schema.analyticsDailyMetrics.day, startDay)),
      db.select({
        day: schema.analyticsDailyUsers.day,
        platform: schema.analyticsDailyUsers.platform,
        value: sql<number>`count(*)`,
      }).from(schema.analyticsDailyUsers)
        .where(gte(schema.analyticsDailyUsers.day, startDay))
        .groupBy(schema.analyticsDailyUsers.day, schema.analyticsDailyUsers.platform),
    ]);

    const series = new Map<string, Record<string, number | string>>();
    for (let index = 0; index < safeDays; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const day = beijingDate(date);
      series.set(day, { day });
    }
    for (const row of activeRows) {
      const item = series.get(row.day);
      if (item) item[`active.${row.platform}`] = Number(row.value || 0);
    }
    for (const row of metricRows) {
      const item = series.get(row.day);
      if (item) item[`${row.metric}.${row.platform}`] = Number(row.value || 0);
    }
    return { days: safeDays, since: startDay, series: [...series.values()] };
  }
}
