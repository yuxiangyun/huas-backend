/**
 * [INPUT]: 依赖 JW 成绩端点、既有纯解析器、评教发现协议与统一基础读取执行器
 * [OUTPUT]: 对外提供内部 readGrades 具名操作，保留评教门禁附加信息与明确 HTTP 失败事实
 * [POS]: SchoolAccess 的成绩协议适配器；缓存、fresh-first 和 stale 选择留在 Academic
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { AppError, ErrorCode } from '../../../utils/errors';
import { URLS } from '../endpoints';
import { GradeParser } from '../jw/parsers/grade-parser';
import { executeBaseRead } from './base-read';
import { discoverEvaluationListUrlFromClient } from './evaluation-discovery';
import type { SchoolRequestContext } from './request-executor';

export interface GradeReadInput { term: string; kcxz: string; kcmc: string; studentId: string; name?: string }
export function readGrades(userId: number, input: GradeReadInput, context: SchoolRequestContext) {
  return executeBaseRead(userId, 'jw_session', context, async ({ client }) => {
    const body = new URLSearchParams({ kksj: input.term, kcxz: input.kcxz, kcmc: input.kcmc, xsfs: 'max' });
    const response = await client.request(URLS.gradeApi, {
      method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: context.config.timeout.business,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`GRADE_HTTP_${response.status}`);
    try { return GradeParser.parse(await response.text(), input); }
    catch (error) {
      if (!(error instanceof AppError) || error.code !== ErrorCode.EVALUATION_REQUIRED) throw error;
      const discovery = await discoverEvaluationListUrlFromClient(client).catch(() => ({ evaluationRequired: true, listUrl: null }));
      throw new AppError(error.code, error.message, { ...(typeof error.data === 'object' && error.data !== null ? error.data : {}), evaluationRequired: true, listUrl: discovery.listUrl });
    }
  });
}
