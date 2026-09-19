/**
 * [INPUT]: 依赖内部学校认证、条件状态仓储与具名操作目录
 * [OUTPUT]: 对外提供 schoolAccess.authenticate/execute 及 schoolAccessMaintenance，隔离学校身份与本服务 JWT
 * [POS]: Campus Integrations 的学校访问公共边界；维护入口只交给进程组合层
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { SchoolAuthentication, type SchoolAuthenticationCommand } from './authentication';
import { schoolStateStore } from './state-store';
import { schoolOperations, type SchoolOperation, type SchoolOperationInput, type SchoolOperationName, type SchoolOperationOutput } from './operations';
import { requestContext, type SchoolRequestContext } from './request-executor';
export type { SchoolAuthenticationCommand, SchoolAuthenticationResult } from './authentication';

const authentication = new SchoolAuthentication();
export const schoolAccess = {
  authenticate: (command: SchoolAuthenticationCommand, context?: { deadlineAt: number }) => authentication.authenticate(command, context?.deadlineAt),
  requiresInteraction: (userId: number) => schoolStateStore.requiresInteraction(userId),
  execute<K extends SchoolOperationName>(userId: number, operation: SchoolOperation<K>, context?: { deadlineAt: number }): Promise<SchoolOperationOutput<K>> {
    const run = schoolOperations[operation.name] as (userId: number, input: SchoolOperationInput<K>, context: SchoolRequestContext) => Promise<SchoolOperationOutput<K>>;
    return run(userId, operation.input, requestContext(context?.deadlineAt));
  },
};
export const schoolAccessMaintenance = {
  cleanupChallenges: () => authentication.cleanupChallenges(),
  cleanupExpiredCredentials: () => schoolStateStore.cleanupExpired(),
};

export type { SchoolOperationInput, SchoolOperationOutput } from './operations';
export type { SchoolEvaluationRow, EvaluationItemAttempt } from './evaluation-operations';
