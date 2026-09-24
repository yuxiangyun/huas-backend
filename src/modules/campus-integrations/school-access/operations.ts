/**
 * [INPUT]: 依赖内部具名学校协议操作及不可变请求上下文
 * [OUTPUT]: 对外提供受控操作注册表及由注册表推导的输入输出类型
 * [POS]: SchoolAccess 的静态操作目录，每种能力显式指定协议，不接受任意 URL 或客户端回调
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { mobileJwReads, readTradePage, readElectricityConfig, readElectricityAccount } from './mobile-operations';
import { readPortalProfile, readPortalBalance, readPortalSchedule } from './portal-operations';
import { readJwSchedule } from './schedule-operation';
import { readClassroomBuildings, readFreeClassrooms } from './classroom-operations';
import { discoverEvaluation, readEvaluationRows, evaluateItem } from './evaluation-operations';
import { readGrades } from './grade-operation';
import { readTrainingPlan } from './training-plan-operation';

export const schoolOperations = {
  ...mobileJwReads,
  'mobileYxt.trades.page': readTradePage,
  'mobileYxt.electricity.config': readElectricityConfig,
  'mobileYxt.electricity.account': readElectricityAccount,
  'jw.grades': readGrades,
  'jw.trainingPlan': readTrainingPlan,
  'jw.schedule': readJwSchedule,
  'jw.classrooms.buildings': readClassroomBuildings,
  'jw.classrooms.free': readFreeClassrooms,
  'jw.evaluation.discover': discoverEvaluation,
  'jw.evaluation.rows': readEvaluationRows,
  'jw.evaluation.item': evaluateItem,
  'portal.profile': readPortalProfile,
  'portal.balance': readPortalBalance,
  'portal.schedule': readPortalSchedule,
};
export type SchoolOperationName = keyof typeof schoolOperations;
export type SchoolOperationInput<K extends SchoolOperationName> = Parameters<typeof schoolOperations[K]>[1];
export type SchoolOperationOutput<K extends SchoolOperationName> = Awaited<ReturnType<typeof schoolOperations[K]>>;
export type SchoolOperation<K extends SchoolOperationName = SchoolOperationName> = { [N in K]: { name: N; input: SchoolOperationInput<N> } }[K];
