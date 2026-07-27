/**
 * [INPUT]: 依赖 EvaluationApplicationService、默认 Academic upstream 与评教发现适配器
 * [OUTPUT]: 对外提供兼容静态 EvaluationService、EvaluationParser 与公开评教类型
 * [POS]: academic 的 Evaluation composition root，唯一负责评教 application 与 infrastructure 装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { EvaluationApplicationService } from './application/evaluation-service';
import { defaultAcademicRuntimePorts } from './infrastructure/runtime';
import { discoverEvaluationListUrlFromClient } from './infrastructure/evaluation-discovery';

const evaluationApplication = new EvaluationApplicationService({
  upstream: defaultAcademicRuntimePorts.upstream,
  discoverEvaluation: discoverEvaluationListUrlFromClient,
});

export class EvaluationService {
  static discoverListUrlFromClient(...args: Parameters<EvaluationApplicationService['discoverListUrlFromClient']>) {
    return evaluationApplication.discoverListUrlFromClient(...args);
  }

  static discoverListUrl(...args: Parameters<EvaluationApplicationService['discoverListUrl']>) {
    return evaluationApplication.discoverListUrl(...args);
  }

  static getStatus(...args: Parameters<EvaluationApplicationService['getStatus']>) {
    return evaluationApplication.getStatus(...args);
  }

  static submitFullScoreFromClient(...args: Parameters<EvaluationApplicationService['submitFullScoreFromClient']>) {
    return evaluationApplication.submitFullScoreFromClient(...args);
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
