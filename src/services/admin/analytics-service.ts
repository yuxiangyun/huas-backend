/**
 * [INPUT]: 依赖 db/schema、北京日期工具与请求路径/渠道/用户事实
 * [OUTPUT]: 提供 recordAuthenticatedRequest、recordLogin 与 getOverview 时间序列
 * [POS]: services/admin 的轻量分析事实层，记录每日渠道指标并聚合后台图表数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { gte, sql } from 'drizzle-orm';
import { getDb, schema } from '../../db';
import { beijingDate } from '../../utils/time';

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

function normalizePlatform(value: string | undefined): AnalyticsPlatform {
  const platform = value?.trim().toLowerCase();
  if (platform === 'miniprogram' || platform === 'web') return platform;
  return 'unknown';
}

function featureOf(path: string, platform: AnalyticsPlatform) {
  const paths = platform === 'miniprogram'
    ? MINIPROGRAM_FEATURE_PATHS
    : platform === 'web'
      ? WEB_FEATURE_PATHS
      : [];
  return paths.find(([prefix]) => path.startsWith(prefix))?.[1] ?? null;
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
    const platform = normalizePlatform(input.platformHeader);
    const db = getDb();

    db.run(sql`INSERT OR IGNORE INTO analytics_daily_users (day, platform, user_id, created_at)
      VALUES (${day}, ${platform}, ${input.userId}, ${Date.now()})`);
    increment(day, platform, 'request.total');
    const feature = featureOf(input.path, platform);
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
