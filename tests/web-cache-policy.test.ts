/**
 * [INPUT]: 依赖 Web 共享 Query 缓存策略
 * [OUTPUT]: 验证普通、引用、后台与轮询游标的时间层级和有界回收关系
 * [POS]: tests 的 Web 缓存策略契约测试，防止业务 hook 重新散落互相冲突的魔法时间
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, test } from 'bun:test';
import {
  liveQueryCachePolicy,
  QUERY_CACHE_POLICY,
} from '../web/src/shared/api/query-cache-policy';

describe('Web Query cache policy', () => {
  test('keeps reference data longest and admin snapshots shortest', () => {
    expect(QUERY_CACHE_POLICY.reference.staleTime).toBeGreaterThan(QUERY_CACHE_POLICY.standard.staleTime);
    expect(QUERY_CACHE_POLICY.reference.gcTime).toBeGreaterThan(QUERY_CACHE_POLICY.standard.gcTime);
    expect(QUERY_CACHE_POLICY.admin.staleTime).toBeLessThan(QUERY_CACHE_POLICY.standard.staleTime);
    expect(QUERY_CACHE_POLICY.admin.gcTime).toBeLessThan(QUERY_CACHE_POLICY.standard.gcTime);
  });

  test('bounds high-water query keys to two polling windows with a 30 second floor', () => {
    expect(liveQueryCachePolicy(5_000)).toMatchObject({
      refetchInterval: 5_000,
      staleTime: 5_000,
      gcTime: 30_000,
      refetchIntervalInBackground: false,
    });
    expect(liveQueryCachePolicy(60_000).gcTime).toBe(120_000);
  });

  test('falls back to the standard lifetime when polling is paused', () => {
    expect(liveQueryCachePolicy(false)).toEqual({
      ...QUERY_CACHE_POLICY.standard,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    });
  });

  test('never reuses an explicit refresh result as a fresh bypass query', () => {
    expect(QUERY_CACHE_POLICY.bypass).toEqual({ staleTime: 0, gcTime: 0 });
  });
});
