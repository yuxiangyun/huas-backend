/**
 * [INPUT]: 依赖注入的 AnalyticsBatchWriter、固定 flush 周期与可选失败观察器
 * [OUTPUT]: 提供按 day/platform/metric 累加、活跃用户去重及失败可重试的 AnalyticsBatch
 * [POS]: operations/infrastructure 的进程内聚合器，将高频事实采集与低频事务持久化解耦
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export type AnalyticsPlatform = 'miniprogram' | 'web' | 'unknown';

export interface AnalyticsMetricFact {
  day: string;
  platform: AnalyticsPlatform;
  metric: string;
  value: number;
}

export interface AnalyticsActiveUserFact {
  day: string;
  platform: AnalyticsPlatform;
  userId: number;
}

export interface AnalyticsFlushBatch {
  metrics: AnalyticsMetricFact[];
  activeUsers: AnalyticsActiveUserFact[];
}

export interface AnalyticsBatchWriter {
  write(batch: AnalyticsFlushBatch): void | Promise<void>;
}

export interface AnalyticsFlushResult {
  success: boolean;
  metrics: number;
  activeUsers: number;
}

interface AnalyticsBatchOptions {
  flushIntervalMs: number;
  onFlushError?: (error: unknown) => void;
}

function metricKey(fact: Omit<AnalyticsMetricFact, 'value'>): string {
  return JSON.stringify([fact.day, fact.platform, fact.metric]);
}

function activeUserKey(fact: AnalyticsActiveUserFact): string {
  return JSON.stringify([fact.day, fact.platform, fact.userId]);
}

export class AnalyticsBatch {
  private metrics = new Map<string, AnalyticsMetricFact>();
  private activeUsers = new Map<string, AnalyticsActiveUserFact>();
  private flushInFlight: Promise<AnalyticsFlushResult> | null = null;
  private timer: ReturnType<typeof setInterval> | null;

  constructor(
    private readonly writer: AnalyticsBatchWriter,
    private readonly options: AnalyticsBatchOptions,
  ) {
    this.timer = setInterval(() => {
      void this.flush();
    }, options.flushIntervalMs);
    (this.timer as { unref?: () => void }).unref?.();
  }

  increment(day: string, platform: AnalyticsPlatform, metric: string): void {
    const fact = { day, platform, metric };
    const key = metricKey(fact);
    const current = this.metrics.get(key);
    if (current) {
      current.value += 1;
      return;
    }
    this.metrics.set(key, { ...fact, value: 1 });
  }

  recordActiveUser(day: string, platform: AnalyticsPlatform, userId: number): void {
    const fact = { day, platform, userId };
    this.activeUsers.set(activeUserKey(fact), fact);
  }

  async flush(): Promise<AnalyticsFlushResult> {
    while (this.flushInFlight) await this.flushInFlight;
    if (this.metrics.size === 0 && this.activeUsers.size === 0) {
      return { success: true, metrics: 0, activeUsers: 0 };
    }

    const metrics = this.metrics;
    const activeUsers = this.activeUsers;
    this.metrics = new Map();
    this.activeUsers = new Map();
    const batch = {
      metrics: [...metrics.values()],
      activeUsers: [...activeUsers.values()],
    };

    const operation = Promise.resolve()
      .then(() => this.writer.write(batch))
      .then<AnalyticsFlushResult>(() => ({
        success: true,
        metrics: batch.metrics.length,
        activeUsers: batch.activeUsers.length,
      }))
      .catch((error): AnalyticsFlushResult => {
        this.restore(metrics, activeUsers);
        try {
          this.options.onFlushError?.(error);
        } catch {
          // 失败观察器不得破坏采集链路。
        }
        return {
          success: false,
          metrics: batch.metrics.length,
          activeUsers: batch.activeUsers.length,
        };
      });

    this.flushInFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.flushInFlight === operation) this.flushInFlight = null;
    }
  }

  async shutdown(): Promise<AnalyticsFlushResult> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this.flush();
  }

  private restore(
    failedMetrics: Map<string, AnalyticsMetricFact>,
    failedActiveUsers: Map<string, AnalyticsActiveUserFact>,
  ): void {
    for (const [key, fact] of failedMetrics) {
      const current = this.metrics.get(key);
      if (current) current.value += fact.value;
      else this.metrics.set(key, fact);
    }
    for (const [key, fact] of failedActiveUsers) {
      this.activeUsers.set(key, fact);
    }
  }
}
