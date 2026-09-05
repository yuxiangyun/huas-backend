/**
 * [INPUT]: 依赖共享 CacheMeta 描述缓存观测结果，依赖 Web Request/Response 基础契约描述校园 HTTP
 * [OUTPUT]: 对外提供带可选总预算/重试策略的 Academic 上游执行、缓存读写/条件失效/保时无覆盖提升/singleflight 与 refresh fallback 端口，以及 MobileJwSchedulePort 只读课表边界
 * [POS]: academic/domain 的外部边界契约，application 只声明恢复与按快照失效意图而不感知凭证、SQLite 或重试实现
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

export interface AcademicUpstreamOptions {
  totalTimeoutMs?: number;
  credentialMaxAttempts?: number;
  requestMaxAttempts?: number;
  isRetryableError?: (error: unknown) => boolean;
}

export type AcademicUpstream = <T>(
  userId: number,
  mode: 'jw' | 'portal',
  operation: (context: AcademicUpstreamContext) => Promise<T>,
  options?: AcademicUpstreamOptions,
) => Promise<T>;

export interface AcademicCache {
  get<T>(key: string, options?: { touch?: boolean; allowExpired?: boolean }): Promise<{
    data: T;
    meta: CacheMeta;
    versionToken?: string;
  } | null>;
  set(key: string, data: unknown, ttlSeconds: number, source?: string): Promise<void>;
  promoteIfAbsent?(sourceKey: string, targetKey: string, versionToken: string): Promise<void>;
  invalidateIfVersion(key: string, versionToken: string): Promise<boolean>;
  enforcePrefixLimit(prefix: string, maxEntries: number): Promise<void>;
  runSingleflight<T>(key: string, forceRefresh: boolean, operation: () => Promise<T>): Promise<T>;
}

export type AcademicRefreshFallback = <T>(options: {
  forceRefresh: boolean;
  cacheKey: string;
  error: unknown;
  source: string;
  studentId: string;
  discardCached?: (data: T) => boolean;
}) => Promise<{ data: T; _meta: CacheMeta } | null>;

export interface AcademicRuntimePorts {
  upstream: AcademicUpstream;
  cache: AcademicCache;
  refreshFallback: AcademicRefreshFallback;
}

/** 移动教务只读端口，学校凭证与 HTTP 细节由 Campus Integrations 负责。 */
export interface MobileJwSchedulePort {
  current(userId: number, input?: { week?: number; timeModeId?: string }, deadlineAt?: number): Promise<{ data: unknown; message: string | null }>;
}
