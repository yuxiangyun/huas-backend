/**
 * [INPUT]: 依赖共享 CacheMeta 描述缓存观测结果，依赖 Web Request/Response 基础契约描述校园 HTTP
 * [OUTPUT]: 对外提供 Academic 上游执行、缓存读写与 refresh fallback 三个真实 I/O 端口
 * [POS]: academic/domain 的外部边界契约，application 依赖此抽象而不感知凭证、SQLite 或重试实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CacheMeta } from '../../../types';

export interface AcademicHttpClient {
  request(url: string, options?: RequestInit & { timeout?: number }): Promise<Response>;
}

export interface AcademicUpstreamContext {
  client: AcademicHttpClient;
  portalToken?: string;
}

export type AcademicUpstream = <T>(
  userId: number,
  mode: 'jw' | 'portal',
  operation: (context: AcademicUpstreamContext) => Promise<T>,
) => Promise<T>;

export interface AcademicCache {
  get<T>(key: string, options?: { touch?: boolean; allowExpired?: boolean }): Promise<{
    data: T;
    meta: CacheMeta;
  } | null>;
  set(key: string, data: unknown, ttlSeconds: number, source?: string): Promise<void>;
  enforcePrefixLimit(prefix: string, maxEntries: number): Promise<void>;
}

export type AcademicRefreshFallback = <T>(options: {
  forceRefresh: boolean;
  cacheKey: string;
  error: unknown;
  source: string;
  studentId: string;
}) => Promise<{ data: T; _meta: CacheMeta } | null>;

export interface AcademicRuntimePorts {
  upstream: AcademicUpstream;
  cache: AcademicCache;
  refreshFallback: AcademicRefreshFallback;
}
