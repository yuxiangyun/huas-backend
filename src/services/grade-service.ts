import { upstream } from './upstream';
import { CacheService } from './cache-service';
import { GradeParser } from '../parsers';
import { URLS } from '../core/url-config';
import { config } from '../config';
import { createHash } from 'node:crypto';
import { AppError, ErrorCode } from '../utils/errors';

const MAX_TERM_LENGTH = 32;
const MAX_KCXZ_LENGTH = 32;
const MAX_KCMC_LENGTH = 64;

function normalizeQueryValue(raw: string | undefined, maxLength: number, fieldName: string): string {
  const normalized = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (normalized.length > maxLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${fieldName} 参数过长`);
  }
  return normalized;
}

function buildGradeCacheKey(studentId: string, term: string, kcxz: string, kcmc: string): string {
  const fingerprint = createHash('sha256')
    .update(`${term}\u0000${kcxz}\u0000${kcmc}`)
    .digest('hex')
    .slice(0, 32);
  return `grades:${studentId}:${fingerprint}`;
}

export class GradeService {
  static async getGrades(
    userId: number,
    studentId: string,
    query: { term?: string; kcxz?: string; kcmc?: string } = {},
    forceRefresh = false
  ) {
    const term = normalizeQueryValue(query.term, MAX_TERM_LENGTH, 'term');
    const kcxz = normalizeQueryValue(query.kcxz, MAX_KCXZ_LENGTH, 'kcxz');
    const kcmc = normalizeQueryValue(query.kcmc, MAX_KCMC_LENGTH, 'kcmc');
    const cacheKey = buildGradeCacheKey(studentId, term, kcxz, kcmc);

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey, { touch: true });
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    const data = await upstream(userId, 'jw', async ({ client }) => {
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
      return GradeParser.parse(await res.text());
    });

    await CacheService.set(cacheKey, data, config.cacheTtl.grades, 'jw');
    await CacheService.enforcePrefixLimit(`grades:${studentId}:`, config.cacheLimit.gradesPerUser);

    return { data, _meta: { cached: false, source: 'jw' } };
  }
}
