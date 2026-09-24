/**
 * [INPUT]: 依赖 JW 培养方案与执行计划固定端点、纯 HTML 解析器及统一基础读取执行器
 * [OUTPUT]: 对外提供一次 JW 会话内读取两页的 jw.trainingPlan 具名只读操作
 * [POS]: SchoolAccess 的培养方案协议适配器，共享恢复与预算，缓存和分学期投影留在 Academic
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { URLS } from '../endpoints';
import { TrainingPlanParser } from '../jw/parsers/training-plan-parser';
import { executeBaseRead } from './base-read';
import type { SchoolRequestContext } from './request-executor';

export function readTrainingPlan(userId: number, _input: Record<string, never>, context: SchoolRequestContext) {
  return executeBaseRead(userId, 'jw_session', context, async ({ client }) => {
    const planResponse = await client.request(URLS.trainingPlan, {
      method: 'GET', timeout: context.config.timeout.business, headers: { Referer: URLS.jwMain },
    });
    if (planResponse.status < 200 || planResponse.status >= 300) throw new Error(`TRAINING_PLAN_HTTP_${planResponse.status}`);
    const plan = TrainingPlanParser.parsePlan(await planResponse.text());

    const executionResponse = await client.request(URLS.trainingPlanExecution, {
      method: 'GET', timeout: context.config.timeout.business, headers: { Referer: URLS.jwMain },
    });
    if (executionResponse.status < 200 || executionResponse.status >= 300) throw new Error(`TRAINING_PLAN_HTTP_${executionResponse.status}`);
    const executions = TrainingPlanParser.parseExecution(await executionResponse.text());
    return { plan, executions };
  });
}
