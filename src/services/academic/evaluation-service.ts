/**
 * [INPUT]: 依赖 modules/academic 的 canonical Evaluation composition
 * [OUTPUT]: 兼容再导出 EvaluationService、EvaluationParser 与全部公开评教结果类型
 * [POS]: services/academic 的只读迁移 Facade，旧路由与测试单向指向 Academic
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export {
  EvaluationParser,
  EvaluationService,
  type EvaluationDiscoveryResult,
  type EvaluationListItem,
  type EvaluationStatusResult,
  type EvaluationSubmitItem,
  type EvaluationSubmitResult,
} from '../../modules/academic/evaluation';
