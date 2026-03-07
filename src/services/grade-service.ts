import { upstream } from './upstream';
import { CacheService } from './cache-service';
import { GradeParser } from '../parsers';
import { URLS } from '../core/url-config';
import { config } from '../config';

export class GradeService {
  static async getGrades(
    userId: number,
    studentId: string,
    query: { term?: string; kcxz?: string; kcmc?: string } = {},
    forceRefresh = false
  ) {
    const term = query.term ?? '';
    const kcxz = query.kcxz ?? '';
    const kcmc = query.kcmc ?? '';
    const cacheKey = `grades:${studentId}:${term}:${kcxz}:${kcmc}`;

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey);
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

    return { data, _meta: { cached: false, source: 'jw' } };
  }
}
