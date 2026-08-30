/**
 * [INPUT]: 依赖 SqliteCacheStore、FreshnessPolicy 转换、PerKeySingleflight 与可注入低基数观察器
 * [OUTPUT]: 对外提供 canonical CacheService，兼容秒级 set API、显式策略写入、快照令牌条件失效、联合键 singleflight 与观察器注册
 * [POS]: cache 模块 composition root，供业务 infrastructure 直接消费，旧 services 路径仅单向再导出
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { PerKeySingleflight, type RefreshIntent } from './application/singleflight';
import { fromLegacyTtlSeconds, type FreshnessPolicy } from './domain/freshness-policy';
import { SqliteCacheStore, type CacheReadOptions } from './infrastructure/sqlite-cache-store';

export interface CacheObservers {
  recordAccess?: (outcome: 'hit' | 'miss') => void;
  recordSingleflightMerge?: () => void;
}

let observers: CacheObservers = {};
const store = new SqliteCacheStore((outcome) => observers.recordAccess?.(outcome));
const singleflight = new PerKeySingleflight(() => observers.recordSingleflightMerge?.());

export class CacheService {
  static configureObservers(next: CacheObservers): () => void {
    const previous = observers;
    observers = next;
    return () => {
      if (observers === next) observers = previous;
    };
  }

  static get<T>(key: string, options?: CacheReadOptions) {
    return store.get<T>(key, options);
  }

  static set(key: string, data: unknown, ttlSeconds: number, source?: string): Promise<void> {
    return store.set(key, data, fromLegacyTtlSeconds(ttlSeconds), source);
  }

  static setWithPolicy(key: string, data: unknown, policy: FreshnessPolicy, source?: string): Promise<void> {
    return store.set(key, data, policy, source);
  }

  static invalidate(key: string): Promise<void> {
    return store.invalidate(key);
  }

  static invalidateIfVersion(key: string, versionToken: string): Promise<boolean> {
    return store.invalidateIfVersion(key, versionToken);
  }

  static cleanupExpired(): Promise<void> {
    return store.cleanupExpired();
  }

  static enforcePrefixLimit(prefix: string, maxEntries: number): Promise<void> {
    return store.enforcePrefixLimit(prefix, maxEntries);
  }

  static runSingleflight<T>(key: string, forceRefresh: boolean, operation: () => Promise<T>): Promise<T> {
    const intent: RefreshIntent = forceRefresh ? 'refresh' : 'normal';
    return singleflight.run(key, intent, operation);
  }
}
