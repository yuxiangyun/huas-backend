/**
 * [INPUT]: 依赖未知 JSON payload 与当前 cache schema 版本常量
 * [OUTPUT]: 对外提供 v1 CacheEnvelope 创建及 legacy/current/unsupported/invalid 解码结果
 * [POS]: cache/domain 的持久化兼容边界，使滚动升级只把未知版本视为安全 miss
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const CACHE_SCHEMA_VERSION = 1 as const;

export interface CacheEnvelope<T> {
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
  payload: T;
}

export type CacheEnvelopeDecodeResult<T> =
  | { status: 'current'; data: T }
  | { status: 'legacy'; data: T }
  | { status: 'unsupported'; schemaVersion: unknown }
  | { status: 'invalid' };

export function createCacheEnvelope<T>(payload: T): CacheEnvelope<T> {
  return { schemaVersion: CACHE_SCHEMA_VERSION, payload };
}

export function decodeCacheEnvelope<T>(value: unknown): CacheEnvelopeDecodeResult<T> {
  if (typeof value !== 'object' || value === null || !Object.prototype.hasOwnProperty.call(value, 'schemaVersion')) {
    return { status: 'legacy', data: value as T };
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== CACHE_SCHEMA_VERSION) {
    return { status: 'unsupported', schemaVersion: candidate.schemaVersion };
  }
  if (!Object.prototype.hasOwnProperty.call(candidate, 'payload')) {
    return { status: 'invalid' };
  }
  return { status: 'current', data: candidate.payload as T };
}
