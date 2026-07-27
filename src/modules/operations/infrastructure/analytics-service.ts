/**
 * [INPUT]: 依赖 Operations analytics schema、进程内 AnalyticsBatch、北京日期工具与请求事实
 * [OUTPUT]: 提供 AnalyticsService 的无阻塞记录、失败 observer、批量 flush/shutdown 与兼容 overview
 * [POS]: operations/infrastructure 的渠道分析 adapter，以短周期单事务批量写替代每请求 SQLite 写
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { gte, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { Logger } from '../../../utils/logger';
import { beijingDate } from '../../../utils/time';
import {
  AnalyticsBatch,
  type AnalyticsFlushBatch,
  type AnalyticsFlushResult,
  type AnalyticsPlatform,
} from './analytics-batch';

export type { AnalyticsFlushResult, AnalyticsPlatform } from './analytics-batch';

export const ANALYTICS_FLUSH_INTERVAL_MS = 5_000;
export type AnalyticsFlushFailureObserver = (error: unknown) => void;

const ignoreFlushFailure: AnalyticsFlushFailureObserver = () => {};
let flushFailureObserver = ignoreFlushFailure;

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

function writeAnalyticsBatch(batch: AnalyticsFlushBatch): void {
  const db = getDb();
  const now = Date.now();
  db.transaction((tx) => {
    for (const fact of batch.activeUsers) {
      tx.run(sql`INSERT OR IGNORE INTO analytics_daily_users (day, platform, user_id, created_at)
        SELECT ${fact.day}, ${fact.platform}, ${fact.userId}, ${now}
        WHERE EXISTS (SELECT 1 FROM users WHERE id = ${fact.userId})`);
    }
    for (const fact of batch.metrics) {
      tx.run(sql`INSERT INTO analytics_daily_metrics (day, platform, metric, value, updated_at)
        VALUES (${fact.day}, ${fact.platform}, ${fact.metric}, ${fact.value}, ${now})
        ON CONFLICT(day, platform, metric)
        DO UPDATE SET value = value + ${fact.value}, updated_at = ${now}`);
    }
  });
}

const analyticsBatch = new AnalyticsBatch(
  { write: writeAnalyticsBatch },
  {
    flushIntervalMs: ANALYTICS_FLUSH_INTERVAL_MS,
    onFlushError(error) {
      try {
        Logger.error('ANALYTICS', '批量持久化失败，将在下周期重试', error);
      } finally {
        flushFailureObserver(error);
      }
    },
  },
);

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
    analyticsBatch.recordActiveUser(day, platform, input.userId);
    analyticsBatch.increment(day, platform, 'request.total');
    const feature = featureOf(input.path);
    if (feature) analyticsBatch.increment(day, platform, `feature.${feature}`);
    if (input.status >= 500) analyticsBatch.increment(day, platform, 'request.server_error');
    else if (input.status >= 400) analyticsBatch.increment(day, platform, 'request.client_error');
  }

  static recordLogin(platformHeader: string | undefined, success: boolean) {
    analyticsBatch.increment(
      beijingDate(),
      normalizePlatform(platformHeader),
      success ? 'login.success' : 'login.failure',
    );
  }

  static configureFlushFailureObserver(observer?: AnalyticsFlushFailureObserver): void {
    flushFailureObserver = observer ?? ignoreFlushFailure;
  }

  static flush(): Promise<AnalyticsFlushResult> {
    return analyticsBatch.flush();
  }

  static shutdown(): Promise<AnalyticsFlushResult> {
    return analyticsBatch.shutdown();
  }

  static async getOverview(days: number) {
    await analyticsBatch.flush();
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
