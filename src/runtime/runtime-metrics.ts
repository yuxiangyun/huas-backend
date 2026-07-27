/**
 * [INPUT]: 接收 HTTP、上游、fallback、cache、singleflight、SQLite 与 analytics flush 运行事件
 * [OUTPUT]: 对外提供 createRuntimeMetrics、runtimeMetrics 与 Prometheus 文本序列化
 * [POS]: runtime 的进程内轻量指标聚合器，只保存可丢弃计数与延迟总量，不承担业务事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export type UpstreamOutcome = 'success' | 'failure' | 'timeout';
export type CacheOutcome = 'hit' | 'miss';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

const METRIC_NAMES = {
  httpRequests: 'huas_http_requests_total',
  httpDurationCount: 'huas_http_request_duration_ms_count',
  httpDurationSum: 'huas_http_request_duration_ms_sum',
  upstream: 'huas_upstream_requests_total',
  fallback: 'huas_fallback_total',
  cache: 'huas_cache_access_total',
  singleflight: 'huas_singleflight_merge_total',
  sqliteBusy: 'huas_sqlite_busy_total',
  analyticsFlushFailure: 'huas_analytics_flush_failure_total',
} as const;

function labelKey(labels: Record<string, string>) {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

function renderLabels(labels: Record<string, string>) {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '';
  const body = entries.map(([key, value]) => `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',');
  return `{${body}}`;
}

function counterKey(name: string, labels: Record<string, string>) {
  return `${name}|${labelKey(labels)}`;
}

function parseCounterKey(key: string) {
  const separator = key.indexOf('|');
  const name = key.slice(0, separator);
  const encoded = key.slice(separator + 1);
  const labels: Record<string, string> = {};
  if (encoded) {
    for (const pair of encoded.split(',')) {
      const equals = pair.indexOf('=');
      labels[pair.slice(0, equals)] = pair.slice(equals + 1);
    }
  }
  return { name, labels };
}

function normalizedHttpMethod(method: string) {
  const normalized = method.toUpperCase();
  return HTTP_METHODS.has(normalized) ? normalized : 'OTHER';
}

function isSqliteBusy(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|database is locked/i.test(message);
}

export function createRuntimeMetrics() {
  const counters = new Map<string, number>();

  function increment(name: string, labels: Record<string, string> = {}, value = 1) {
    const key = counterKey(name, labels);
    counters.set(key, (counters.get(key) ?? 0) + value);
  }

  // 固定低基数维度必须始终暴露，即便进程启动后尚未观察到事件。
  for (const outcome of ['success', 'failure', 'timeout'] as const) {
    increment(METRIC_NAMES.upstream, { outcome }, 0);
  }
  for (const result of ['hit', 'miss'] as const) increment(METRIC_NAMES.cache, { result }, 0);
  for (const name of [
    METRIC_NAMES.fallback,
    METRIC_NAMES.singleflight,
    METRIC_NAMES.sqliteBusy,
    METRIC_NAMES.analyticsFlushFailure,
  ]) increment(name, {}, 0);

  return {
    recordHttpRequest(method: string, status: number, durationMs: number) {
      const labels = { method: normalizedHttpMethod(method), status: String(status) };
      increment(METRIC_NAMES.httpRequests, labels);
      increment(METRIC_NAMES.httpDurationCount, { method: labels.method });
      increment(METRIC_NAMES.httpDurationSum, { method: labels.method }, Math.max(0, durationMs));
    },

    recordUpstream(outcome: UpstreamOutcome) {
      increment(METRIC_NAMES.upstream, { outcome });
    },

    recordFallback() {
      increment(METRIC_NAMES.fallback);
    },

    recordCache(outcome: CacheOutcome) {
      increment(METRIC_NAMES.cache, { result: outcome });
    },

    recordSingleflightMerge() {
      increment(METRIC_NAMES.singleflight);
    },

    recordSqliteBusy() {
      increment(METRIC_NAMES.sqliteBusy);
    },

    recordSqliteBusyError(error: unknown) {
      if (!isSqliteBusy(error)) return false;
      increment(METRIC_NAMES.sqliteBusy);
      return true;
    },

    recordAnalyticsFlushFailure() {
      increment(METRIC_NAMES.analyticsFlushFailure);
    },

    snapshot() {
      return new Map(counters);
    },

    renderPrometheus() {
      const lines = [...counters.entries()]
        .map(([key, value]) => ({ ...parseCounterKey(key), value }))
        .sort((left, right) => {
          if (left.name !== right.name) return left.name.localeCompare(right.name);
          return labelKey(left.labels).localeCompare(labelKey(right.labels));
        })
        .map(({ name, labels, value }) => `${name}${renderLabels(labels)} ${value}`);
      lines.push(`huas_process_uptime_seconds ${Math.floor(process.uptime())}`);
      return `${lines.join('\n')}\n`;
    },
  };
}

export const runtimeMetrics = createRuntimeMetrics();
