/**
 * [INPUT]: 依赖 EvaluationApplicationService、SchoolAccess 具名评教操作
 * [OUTPUT]: 对外提供兼容静态 EvaluationService、EvaluationParser 与公开评教类型
 * [POS]: academic 的 Evaluation composition root，唯一负责评教 application 与 infrastructure 装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { EvaluationApplicationService } from './application/evaluation-service';
import { schoolAccess } from '../campus-integrations/school-access/school-access';

const evaluationApplication = new EvaluationApplicationService({
  discoverEvaluation: userId => schoolAccess.execute(userId, { name: 'jw.evaluation.discover', input: {} }),
  readRows: (userId, listUrl, deadlineAt) => schoolAccess.execute(userId, { name: 'jw.evaluation.rows', input: { listUrl } }, deadlineAt === undefined ? undefined : { deadlineAt }),
  evaluateItem: (userId, input, deadlineAt) => schoolAccess.execute(userId, { name: 'jw.evaluation.item', input }, { deadlineAt }),
});

export class EvaluationService {


  static discoverListUrl(...args: Parameters<EvaluationApplicationService['discoverListUrl']>) {
    return evaluationApplication.discoverListUrl(...args);
  }

  static getStatus(...args: Parameters<EvaluationApplicationService['getStatus']>) {
    return evaluationApplication.getStatus(...args);
  }



  static submitFullScore(...args: Parameters<EvaluationApplicationService['submitFullScore']>) {
    return evaluationApplication.submitFullScore(...args);
  }
}

export { EvaluationParser } from '../campus-integrations/jw/parsers/evaluation-parser';
export type {
  EvaluationDiscoveryResult,
  EvaluationListItem,
  EvaluationStatusResult,
  EvaluationSubmitItem,
  EvaluationSubmitResult,
} from './domain/evaluation';
