/**
 * [INPUT]: 依赖 GradeApplicationPorts、canonical GradeParser/端点、config 与统一错误
 * [OUTPUT]: 对外提供可注入 GradeApplicationPorts 的 GradeApplicationService，以 45 秒总预算有限恢复凭证和重试成绩临时故障
 * [POS]: academic/application 的 fresh-first 成绩读取用例，合并同键刷新并仅在新鲜路径穷尽后进入 stale fallback
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { GradeParser } from '../../campus-integrations/jw/parsers/grade-parser';
import { URLS } from '../../campus-integrations/endpoints';
import { config } from '../../../config';
import { AppError, ErrorCode } from '../../../utils/errors';
import { normalizeGradeQuery, type GradeApplicationPorts, type GradeQuery } from '../domain/grade';

function assertGradeResponse(response: Response) {
  if (response.status === 401 || response.status === 403) throw new Error('SESSION_EXPIRED');
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GRADE_HTTP_${response.status}`);
  }
}

function isRetryableGradeError(error: unknown): boolean {
  const message = String((error as any)?.message || '');
  return /^GRADE_HTTP_(?:502|503|504)$/.test(message) || message === 'GRADE_PAGE_INVALID';
}

export class GradeApplicationService {
  constructor(private readonly ports: GradeApplicationPorts) {}

  async getGrades(
    userId: number,
    studentId: string,
    query: GradeQuery = {},
    forceRefresh = false,
    name?: string
  ) {
    const { term, kcxz, kcmc } = normalizeGradeQuery(query);
    const cacheKey = this.ports.buildCacheKey(studentId, term, kcxz, kcmc);

    if (!forceRefresh) {
      const cached = await this.ports.cache.get(cacheKey, { touch: true });
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    let data: any;
    try {
      data = await this.ports.cache.runSingleflight(
        cacheKey,
        forceRefresh,
        () => this.ports.upstream(userId, 'jw', async ({ client }) => {
          const params = new URLSearchParams();
          params.append('kksj', term);
          params.append('kcxz', kcxz);
          params.append('kcmc', kcmc);
          params.append('xsfs', 'max');

          const res = await client.request(URLS.gradeApi, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
            timeout: config.timeout.business,
          });
          assertGradeResponse(res);
          const html = await res.text();
          try {
            return GradeParser.parse(html, { studentId, name });
          } catch (error) {
            if (!(error instanceof AppError) || error.code !== ErrorCode.EVALUATION_REQUIRED) {
              throw error;
            }

            const discovery = await this.ports.discoverEvaluation(client).catch(() => ({
              evaluationRequired: true,
              listUrl: null,
            }));
            throw new AppError(error.code, error.message, {
              ...(typeof error.data === 'object' && error.data !== null ? error.data : {}),
              evaluationRequired: true,
              listUrl: discovery.listUrl,
            });
          }
        }, {
          totalTimeoutMs: config.timeout.gradeFreshBudget,
          credentialMaxAttempts: 2,
          requestMaxAttempts: config.retry.businessMaxAttempts,
          isRetryableError: isRetryableGradeError,
        }),
      );
    } catch (error) {
      const fallback = await this.ports.refreshFallback({
        forceRefresh,
        cacheKey,
        error,
        source: 'jw',
        studentId,
      });
      if (fallback) return fallback;
      throw error;
    }

    await this.ports.cache.set(cacheKey, data, config.cacheTtl.grades, 'jw');
    await this.ports.cache.enforcePrefixLimit(`grades:${studentId}:`, config.cacheLimit.gradesPerUser);

    return { data, _meta: { cached: false, source: 'jw' } };
  }
}
