/**
 * [INPUT]: 依赖 modules/cache 的 canonical CacheService 与既有 refresh fallback 策略
 * [OUTPUT]: 对 Academic composition 提供不改写 TTL、LRU、singleflight、stale 与 3003 穿透语义的缓存端口实现
 * [POS]: academic/infrastructure 的缓存适配器，隔离用例层与共享基础设施的物理路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { AcademicCache, AcademicRefreshFallback } from '../domain/ports';
import { CacheService } from '../../cache/cache-service';
import { fallbackOnRefreshFailure } from '../../../services/infra/refresh-fallback';

export const academicCache: AcademicCache = {
  get: (key, options) => CacheService.get(key, options),
  set: (key, data, ttlSeconds, source) => CacheService.set(key, data, ttlSeconds, source),
  enforcePrefixLimit: (prefix, maxEntries) => CacheService.enforcePrefixLimit(prefix, maxEntries),
  runSingleflight: (key, forceRefresh, operation) => CacheService.runSingleflight(key, forceRefresh, operation),
};

export const academicRefreshFallback: AcademicRefreshFallback = fallbackOnRefreshFailure;
