/**
 * [INPUT]: 依赖 campus-integrations/upstream 的 canonical 上游执行边界
 * [OUTPUT]: 兼容再导出 upstream、UpstreamContext 与 UpstreamExecutionOptions
 * [POS]: services/infra 的只读迁移 Facade，保持 Academic 与 PortalSchedule 旧调用路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { upstream } from '../../modules/campus-integrations/upstream/upstream';
export type {
  UpstreamContext,
  UpstreamExecutionOptions,
} from '../../modules/campus-integrations/upstream/upstream';
