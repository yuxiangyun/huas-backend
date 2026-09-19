/**
 * [INPUT]: 依赖既有评教纯解析器、JW 导航发现及统一 JW 读取/单次执行
 * [OUTPUT]: 对外提供内部评教发现、列表读取、同会话准备并单次提交操作与提交尝试结果
 * [POS]: SchoolAccess 的评教协议；一次提交的会话不外泄，批次选择和回查增量确认留在 Academic
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { assertJwEvaluationListUrl, assertSuccessfulEvaluationSubmitHtml, EvaluationParser, safeJwUrl, type EvaluationListRow } from '../jw/parsers/evaluation-parser';
import { URLS } from '../endpoints';
import { executeBaseRead } from './base-read';
import { discoverEvaluationListUrlFromClient } from './evaluation-discovery';
import { schoolRequestExecutor, type SchoolRequestContext } from './request-executor';
import { SchoolAccessError } from './errors';
import { schoolStateStore } from './state-store';

export type SchoolEvaluationRow = EvaluationListRow;
export interface EvaluationItemAttempt { questionCount: number; fullScore: number; attempted: boolean; error?: string }

export function discoverEvaluation(userId: number, _input: Record<string, never>, context: SchoolRequestContext) {
  return executeBaseRead(userId, 'jw_session', context, ({ client }) => discoverEvaluationListUrlFromClient(client));
}
export function readEvaluationRows(userId: number, input: { listUrl: string }, context: SchoolRequestContext) {
  const listUrl = assertJwEvaluationListUrl(input.listUrl);
  return executeBaseRead(userId, 'jw_session', context, async ({ client }) => {
    const response = await client.request(listUrl);
    if (!response.ok) throw new Error(`EVALUATION_LIST_HTTP_${response.status}`);
    return EvaluationParser.extractListRows(await response.text());
  });
}

export async function evaluateItem(userId: number, input: { target: EvaluationListRow; comment: string; dryRun: boolean }, context: SchoolRequestContext): Promise<EvaluationItemAttempt> {
  const editUrl = safeJwUrl(input.target.editUrl, URLS.jwBase);
  if (!editUrl) throw new SchoolAccessError('protocol', '评教表单地址无效');
  const prepared = await executeBaseRead(userId, 'jw_session', context, async session => {
    const response = await session.client.request(editUrl);
    if (!response.ok) throw new Error(`EVALUATION_FORM_HTTP_${response.status}`);
    return { session, form: EvaluationParser.buildFullScoreForm(await response.text(), editUrl, input.comment) };
  });
  const { form, session } = prepared;
  const summary = { questionCount: form.questionCount, fullScore: form.fullScore };
  if (input.dryRun) return { ...summary, attempted: false };
  // 从这一点开始失败均是不确定提交，不恢复、不重放；列表回查由业务批次统一完成。
  let attempted = false;
  try {
    await schoolRequestExecutor.step(context, async () => {
      attempted = true;
      const response = await session.client.request(form.actionUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: editUrl }, body: form.body,
      });
      if (response.status < 200 || response.status >= 400) throw new Error(`SUBMIT_HTTP_${response.status}`);
      const html = await response.text();
      if (!html.trim()) {
        const location = response.headers.get('location');
        if (!location || !safeJwUrl(location, form.actionUrl)) throw new Error('SUBMIT_RESPONSE_EMPTY');
      } else assertSuccessfulEvaluationSubmitHtml(html);
    }, false);
    return { ...summary, attempted: true };
  } catch (error) {
    if (!attempted) throw error;
    if (error instanceof SchoolAccessError && error.kind === 'session-rejected') schoolStateStore.invalidate(session.snapshot);
    return { ...summary, attempted: true, error: error instanceof Error ? error.message : 'SUBMIT_RESULT_UNKNOWN' };
  }
}
