import { Hono } from 'hono';
import { EvaluationService } from '../../services/academic/evaluation-service';
import { AppError, ErrorCode } from '../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { success } from '../../utils/response';

const evaluations = new Hono();

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

  const data = await EvaluationService.submitFullScore(c.get('userId'), listUrl, {
    dryRun,
    comment,
  });

  appendHttpLogDetail(c, formatHttpLogDetail({
    dryRun: data.dryRun,
    total: data.total,
    pending: data.pendingCount,
    failed: data.failedCount,
  }));

  return success(c, data, { source: 'jw' });
});

export default evaluations;
