/**
 * [INPUT]: 依赖 OrderedCommit 的并发提交顺序保护，依赖 GradeApplicationPorts、具名 readGrades 学校操作、config 与统一错误
 * [OUTPUT]: 对外提供可注入 GradeApplicationPorts 的 GradeApplicationService，通过 SchoolAccess 读取成绩，学校协议与恢复不进入应用层
 * [POS]: academic/application 的 fresh-first 成绩读取用例，合并同意图回源、按开始代次提交缓存，并仅在新鲜路径穷尽后进入 stale fallback
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { OrderedCommit } from '../../../utils/ordered-commit';
import { config } from '../../../config';
import { normalizeGradeQuery, type GradeApplicationPorts, type GradeQuery } from '../domain/grade';

const cacheWrites = new OrderedCommit();

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
        () => cacheWrites.run(cacheKey, () => this.ports.readGrades(userId, { term, kcxz, kcmc, studentId, name }), async (fresh) => {
          await this.ports.cache.set(cacheKey, fresh, config.cacheTtl.grades, 'jw');
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

    await this.ports.cache.enforcePrefixLimit(`grades:${studentId}:`, config.cacheLimit.gradesPerUser);

    return { data, _meta: { cached: false, source: 'jw' } };
  }
}
