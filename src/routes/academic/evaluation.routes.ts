/**
 * [INPUT]: 依赖 EvaluationService、校园实时限流、AppError/ErrorCode、HTTP 日志与统一响应工具
 * [OUTPUT]: 对外提供评教发现、blocked/actionable 状态读取与经批末回查确认的满分提交路由
 * [POS]: routes/academic 的评教 HTTP 适配器，只解析请求并记录最终业务事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { EvaluationService } from '../../services/academic/evaluation-service';
import { AppError, ErrorCode } from '../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { success } from '../../utils/response';
import { academicRealtimeRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';

const evaluations = new Hono();

evaluations.use('*', academicRealtimeRateLimitMiddleware);

async function readJsonBody(c: any) {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(ErrorCode.PARAM_ERROR, '请求体必须是 JSON');
  }
}

function readListUrl(value: unknown) {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.PARAM_ERROR, 'listUrl 不能为空');
  }
  return value;
}

evaluations.get('/status', async (c) => {
  const listUrl = readListUrl(c.req.query('listUrl'));
  const data = await EvaluationService.getStatus(c.get('userId'), listUrl);

  appendHttpLogDetail(c, formatHttpLogDetail({
    total: data.total,
    pending: data.pendingCount,
    actionable: data.actionableCount,
    blocked: data.blockedCount,
  }));

  return success(c, data, { source: 'jw' });
});

evaluations.get('/discover', async (c) => {
  const data = await EvaluationService.discoverListUrl(c.get('userId'));

  appendHttpLogDetail(c, formatHttpLogDetail({
    evaluationRequired: data.evaluationRequired,
    discovered: data.listUrl ? true : undefined,
  }));

  return success(c, data, { source: 'jw' });
});

evaluations.post('/submit-full-score', async (c) => {
  const body = await readJsonBody(c);
  const listUrl = readListUrl(body?.listUrl);
  const dryRun = !(body?.dryRun === false && body?.confirm === true);
  const comment = typeof body?.comment === 'string' ? body.comment : undefined;
  const batchSize = typeof body?.batchSize === 'number' ? body.batchSize : undefined;

  const data = await EvaluationService.submitFullScore(c.get('userId'), listUrl, {
    dryRun,
    comment,
    batchSize,
  });

  appendHttpLogDetail(c, formatHttpLogDetail({
    dryRun: data.dryRun,
    total: data.status.total,
    pending: data.status.pendingCount,
    submitted: data.submittedCount,
    failed: data.failedCount,
    remaining: data.batch.remainingCount,
    blocked: data.status.blockedCount,
  }));

  return success(c, data, { source: 'jw' });
});

export default evaluations;
